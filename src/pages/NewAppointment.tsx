import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { tapFeedback } from "@/lib/feedback";
import { useAuth } from "@/hooks/useAuth";
import { useClientSuggestions, type ClientSuggestion } from "@/hooks/useClientSuggestions";
import { contactEmail } from "../../supabase/functions/_shared/contactEmail";
import { Button } from "@/components/ui/button";
import { useBookingRules } from "@/hooks/useBookingRules";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Clock,
  User,
  Scissors,
  Loader2,
  Check,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
  Plus,
  Minus,
  ShoppingBag,
  Search,
  Pencil,
  Repeat,
} from "lucide-react";
import { format, addDays, addMinutes, startOfWeek, isToday, isSameDay, isBefore, startOfDay, parse, isValid } from "date-fns";
import RecurringPicker from "@/components/RecurringPicker";
import RecurringProgressModal, { type ProgressAction } from "@/components/RecurringProgressModal";
import { findOrCreateClient } from "@/lib/clientLookup";
import { findMatchingClient, type ClientMatch } from "@/lib/clientMatching";
import { ClientMatchConfirmDialog } from "@/components/ClientMatchConfirmDialog";
import { StaffOverlapPopup } from "@/components/StaffOverlapPopup";
import { hasMinimumStaffClientInfo, validateStaffClientInput } from "@/lib/appointmentValidation";
import { backToCalendar } from "@/lib/navHelpers";
import { generateRecurrenceDates, describePattern, type RecurrencePattern } from "@/lib/recurrence";
import {
  useUrlState,
  isNumericString,
  isSignedNumericString,
  isCommaSeparatedNumericList,
  isIsoDate,
  isAcuityDatetime,
} from "@/lib/urlState";
import { es, enUS } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { motion, AnimatePresence } from "motion/react";


import { BarberPickerRow, getBarberColor } from "@/components/BarberPickerRow";
import { checkAppointmentConflicts, type ConflictAppt } from "@/lib/conflictCheck";
import { authorizeStaffOverlap, canConfirmStaffOverlap } from "@/lib/staffOverlap";
import { BookingProgress, type BookingProgressChip } from "@/components/site/booking/BookingProgress";
import { ProductsStep, type ProductCart } from "@/components/site/booking/ProductsStep";

/* ─── helpers ─── */
async function acuityProxy(path: string, method = "GET", body?: any): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/acuity-proxy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ path, method, body }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || json?.error || `Acuity proxy error ${res.status}`);
  return json;
}

interface AcuityType {
  id: number;
  name: string;
  duration: number;
  price: string;
  color: string;
  calendarIDs: number[];
  category: string;
  addonIDs: number[];
  description: string;
  private?: boolean;
}

interface AcuityCalendar { id: number; name: string; email?: string; avatarUrl?: string | null; barberId?: string | null; }
interface AcuityTimeSlot { time: string; slotsAvailable: number; }
interface AcuityAddon { id: number; name: string; duration: number; price: string; }

/* Local DB-only services use a synthetic negative id and isLocal flag.
 * They're merged into the picker but never sent to Acuity.
 */
interface DbService {
  id: string;                  // services.id (uuid)
  acuity_type_id: number;      // synthetic negative for local-only
  name: string;
  duration_minutes: number;
  price_cents: number;
  barber_id: string | null;
  sort_order: number;
  locally_edited: boolean;
}

type Step = "barber" | "service" | "addons" | "datetime" | "summary";

/* ─── Custom time helpers ─── */
import { getShopTimezone, getShopNextSlot, toAcuityDatetimeInTz } from "@/lib/timezone";

function buildCustomDatetime(date: Date, hours: number, minutes: number, tz: string): string {
  // Interpret wall-clock components in the shop's timezone, emit Acuity-format ISO with correct offset.
  return toAcuityDatetimeInTz(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    hours,
    minutes,
    tz,
  );
}

function sameMinute(a: string, b: string): boolean {
  return Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000);
}

/* ─── component ─── */
export default function NewAppointment() {
  const navigate = useNavigate();
  const { id: editApptId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isEditMode = Boolean(editApptId);
  const { session, isOwner, isBarber } = useAuth();
  const mayOverride = canConfirmStaffOverlap(isOwner, isBarber);
  // Role tag for created_by_role: admin if owner, barber if barber, fallback admin
  const createdByRole = isOwner ? "admin" : isBarber ? "barber" : "admin";
  const createdByUserId = session?.user?.id || null;
  const { getMinAdvance, maxAdvanceDays } = useBookingRules();
  const { t, language } = useTranslation();
  const dateFnsLocale = language === "es" ? es : enUS;

  /* ─── Phase 1B.UX.3.B Window 1 — URL persistence ─────────────────────────
   * 6 URL params survive Safari app-switch, reload, and bfcache restore.
   * `n` prefix avoids collision with calendar's ?date=. PII never goes in URL.
   * Writes are gated by `hydrated` so initial-render defaults don't clobber
   * a deep-linked URL. All writes use replace:true (no history pollution). */
  const [stepParam, setStepParam] = useUrlState<Step>("nstep", {
    defaultValue: null,
    validator: (v): v is Step => ["barber", "service", "addons", "datetime", "summary"].includes(v),
  });
  const [calParam, setCalParam] = useUrlState<string>("ncal", {
    defaultValue: null,
    validator: isNumericString,
  });
  const [svcParam, setSvcParam] = useUrlState<string>("nsvc", {
    defaultValue: null,
    validator: isSignedNumericString,
  });
  const [addonsParam, setAddonsParam] = useUrlState<string>("naddons", {
    defaultValue: null,
    validator: isCommaSeparatedNumericList,
  });
  const [dateParam, setDateParam] = useUrlState<string>("ndate", {
    defaultValue: null,
    validator: isIsoDate,
  });
  const [timeParam, setTimeParam] = useUrlState<string>("ntime", {
    defaultValue: null,
    validator: isAcuityDatetime,
  });

  // Block URL writes until T0-T5 hydration completes (prevents default-state
  // from overwriting valid deep-linked params during mount).
  const [hydrated, setHydrated] = useState(false);
  const [idsHydrated, setIdsHydrated] = useState(false);
  const [dateTimeHydrated, setDateTimeHydrated] = useState(false);

  const [step, setStep] = useState<Step>("barber");
  const [editLoading, setEditLoading] = useState(isEditMode);
  const editDataLoaded = useRef(false);

  // Selections
  const [selectedCalendar, setSelectedCalendar] = useState<AcuityCalendar | null>(null);
  const [selectedType, setSelectedType] = useState<AcuityType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<number[]>([]);
  const [notes, setNotes] = useState("");
  const [sendConfirmation, setSendConfirmation] = useState(true);

  // Client
  const [clientExpanded, setClientExpanded] = useState(false);
  const clientSectionRef = useRef<HTMLDivElement>(null);
  const [clientFirst, setClientFirst] = useState("");
  const [clientLast, setClientLast] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const { results: clientResults, searching: searchingClients, failed: clientSearchFailed,
    search: triggerClientSearch, clear: clearClientSearch } = useClientSuggestions(
      session ? `${session.user.id}:${createdByRole}` : null,
    );
  const [selectedClient, setSelectedClient] = useState<ClientSuggestion | null>(null);
  const [supabaseClientId, setSupabaseClientId] = useState<string | null>(null);

  // Data
  const [services, setServices] = useState<AcuityType[]>([]);
  const [dbServices, setDbServices] = useState<DbService[]>([]);
  const [calendars, setCalendars] = useState<AcuityCalendar[]>([]);
  const [allAddons, setAllAddons] = useState<AcuityAddon[]>([]);
  
  const [timeSlots, setTimeSlots] = useState<AcuityTimeSlot[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // Loading
  const [loadingData, setLoadingData] = useState(true);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(0);

  // Conflict warning state (when booking over an existing appointment)
  const [conflicts, setConflicts] = useState<ConflictAppt[]>([]);
  const [conflictAck, setConflictAck] = useState(false);
  const overlapContinueRef = useRef(false);

  // Unified client identity match prompt (partial match only)
  const [matchPrompt, setMatchPrompt] = useState<ClientMatch | null>(null);
  const [matchAck, setMatchAck] = useState(false);
  const [matchChecking, setMatchChecking] = useState(false);

  // Products
  interface CartProduct { id: string; name: string; price_cents: number; image_url: string | null; qty: number; }
  const [products, setProducts] = useState<any[]>([]);
  const [cartProducts, setCartProducts] = useState<CartProduct[]>([]);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  // (productSearch removed — shared ProductsStep handles its own UI)

  // Custom time
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [customHour, setCustomHour] = useState(9);
  const [customMinute, setCustomMinute] = useState(0);

  // Shop timezone (Phase 1B.TIMEZONE)
  const [shopTz, setShopTz] = useState<string>("America/Puerto_Rico");
  useEffect(() => {
    let mounted = true;
    getShopTimezone().then((tz) => {
      if (!mounted) return;
      setShopTz(tz);
      // Smart default: round-up to next 15-min slot in shop time when opening fresh
      getShopNextSlot(15).then((slot) => {
        if (!mounted) return;
        setCustomHour(slot.getHours());
        setCustomMinute(slot.getMinutes());
      });
    });
    return () => { mounted = false; };
  }, []);

  // Success
  const [successSheetOpen, setSuccessSheetOpen] = useState(false);
  const [createdAppointmentId, setCreatedAppointmentId] = useState<string | null>(null);

  // Recurrence
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern | null>(null);
  const [recurringPickerOpen, setRecurringPickerOpen] = useState(false);
  const [recurringSummary, setRecurringSummary] = useState<{ created: number; skipped: Date[] } | null>(null);

  // Bulk-progress modal (recurring create)
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressAction, setProgressAction] = useState<ProgressAction>("create");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  // Edit mode state
  const [editAcuityId, setEditAcuityId] = useState<number | null>(null);
  const [editSupabaseId, setEditSupabaseId] = useState<string | null>(null);

  // Edit client drawer state
  const [editClientDrawerOpen, setEditClientDrawerOpen] = useState(false);
  const [editClientFirstDraft, setEditClientFirstDraft] = useState("");
  const [editClientLastDraft, setEditClientLastDraft] = useState("");
  const [editClientPhoneDraft, setEditClientPhoneDraft] = useState("");
  const [editClientEmailDraft, setEditClientEmailDraft] = useState("");
  const [savingClientEdit, setSavingClientEdit] = useState(false);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1);
  const [monthViewOpen, setMonthViewOpen] = useState(false);
  const [monthViewDate, setMonthViewDate] = useState(new Date());
  const weekTouchRef = useRef<{ startX: number }>({ startX: 0 });

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const dayLabels = language === "es" ? ["D", "L", "M", "M", "J", "V", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
  const hasClient = hasMinimumStaffClientInfo({ firstName: clientFirst, phone: clientPhone });

  // Auto-scroll to client section on entering summary if client is missing
  useEffect(() => {
    if (step === "summary" && !hasClient && clientSectionRef.current) {
      const t = setTimeout(() => {
        clientSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 250);
      return () => clearTimeout(t);
    }
  }, [step, hasClient]);

  // Service-aware booking rules
  const minAdvanceMinutes = useMemo(() => getMinAdvance(selectedType?.id ?? null), [getMinAdvance, selectedType]);
  const minDate = useMemo(() => addMinutes(new Date(), minAdvanceMinutes), [minAdvanceMinutes]);
  const maxDateLimit = useMemo(() => addDays(new Date(), maxAdvanceDays), [maxAdvanceDays]);
  const isDateAllowed = useCallback((day: Date) => {
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59);
    return dayEnd >= startOfDay(minDate) && day <= maxDateLimit;
  }, [minDate, maxDateLimit]);

  const goToWeek = (dir: -1 | 1) => {
    setSwipeDir(dir);
    setWeekStart((prev) => addDays(prev, dir * 7));
  };

  const goToDate = (date: Date) => {
    setSelectedDate(date);
    setWeekStart(startOfWeek(date, { weekStartsOn: 0 }));
  };

  /* ─── Load data from Acuity ─── */
  useEffect(() => {
    (async () => {
      try {
        const [typesData, calsData, addonsData, barbersRes, productsRes, dbServicesRes] = await Promise.all([
          acuityProxy("/appointment-types"),
          acuityProxy("/calendars"),
          acuityProxy("/appointment-addons"),
          supabase.from("barbers_public").select("id, acuity_calendar_id, avatar_url").eq("is_active", true).eq("is_bookable", true),
          supabase.from("products").select("id, name, price_cents, image_url, stock_count").eq("is_active", true).gt("stock_count", 0).order("name"),
          supabase.from("services").select("id, acuity_type_id, name, duration_minutes, price_cents, barber_id, sort_order, locally_edited").eq("is_active", true),
        ]);
        if (dbServicesRes.data) setDbServices(dbServicesRes.data as DbService[]);
        if (productsRes.data) setProducts(productsRes.data);
        if (Array.isArray(typesData)) setServices(typesData);
        if (Array.isArray(addonsData)) setAllAddons(addonsData.filter((a: AcuityAddon) => a.id !== 584093));
        if (Array.isArray(calsData)) {
          const barberAvatars = barbersRes.data || [];
          setCalendars(calsData.map((cal: AcuityCalendar) => {
            const match = barberAvatars.find((b) => b.acuity_calendar_id === cal.id);
            return { ...cal, avatarUrl: match?.avatar_url || null, barberId: match?.id || null };
          }));
        }
      } catch {
        toast.error(language === "es" ? "Error al cargar datos" : "Error loading data");
      } finally {
        setLoadingData(false);
      }
    })();
  }, []);

  /* ─── Pre-populate for edit mode ─── */
  useEffect(() => {
    if (!isEditMode || !editApptId || loadingData || editDataLoaded.current) return;
    if (calendars.length === 0 || services.length === 0) return;
    editDataLoaded.current = true;

    (async () => {
      try {
        // Fetch appointment from Supabase
        const { data: appt } = await supabase
          .from("appointments")
          .select("*")
          .eq("id", editApptId)
          .single();
        if (!appt) { toast.error("Appointment not found"); navigate(backToCalendar(searchParams)); return; }

        setEditSupabaseId(appt.id);
        setEditAcuityId(appt.acuity_id);

        // Fetch acuity data for full details
        let acuityData: any = null;
        try {
          acuityData = await acuityProxy(`/appointments/${appt.acuity_id}`, "GET");
        } catch { /* non-blocking */ }

        // Match calendar (barber)
        const matchedCal = calendars.find((c) => {
          if (acuityData?.calendarID) return c.id === acuityData.calendarID;
          return c.barberId === appt.barber_id;
        });
        if (matchedCal) setSelectedCalendar(matchedCal);

        // Match service
        const matchedService = services.find((s) => {
          if (acuityData?.appointmentTypeID) return s.id === acuityData.appointmentTypeID;
          return s.name === appt.service_name;
        });
        if (matchedService) {
          setSelectedType(matchedService);
          // Set add-ons from acuity data
          if (acuityData?.addonIDs?.length) {
            setSelectedAddons(acuityData.addonIDs);
          } else if (appt.addons?.length) {
            // Try to match addon names to IDs
            const matchedIds = allAddons
              .filter((a) => appt.addons.includes(a.name))
              .map((a) => a.id);
            setSelectedAddons(matchedIds);
          }
        }

        // Set date & time
        const apptDate = new Date(appt.starts_at);
        setSelectedDate(apptDate);
        setWeekStart(startOfWeek(apptDate, { weekStartsOn: 0 }));
        setSelectedTime(acuityData?.datetime || appt.starts_at);

        // Set client info
        const nameParts = (appt.client_name || "").split(" ");
        setClientFirst(nameParts[0] || "");
        setClientLast(nameParts.slice(1).join(" ") || "");
        setClientPhone(appt.client_phone || acuityData?.phone || "");
        setClientEmail(contactEmail(appt.client_email) || contactEmail(acuityData?.email) || "");
        if (appt.client_id) setSupabaseClientId(appt.client_id);

        // Set notes
        setNotes(appt.notes || "");

        // Go directly to summary
        setStep("summary");
      } catch (err: any) {
        toast.error(err.message || "Error loading appointment");
      } finally {
        setEditLoading(false);
      }
    })();
  }, [isEditMode, editApptId, loadingData, calendars, services, allAddons]);

  /* ─── Pre-fill client from query params (e.g. from AppointmentDetail "Book New") ─── */
  useEffect(() => {
    if (isEditMode) return;
    const qName = searchParams.get("clientName");
    const qPhone = searchParams.get("clientPhone");
    const qEmail = searchParams.get("clientEmail");
    if (qName) {
      const parts = qName.split(" ");
      setClientFirst(parts[0] || "");
      setClientLast(parts.slice(1).join(" ") || "");
    }
    if (qPhone) setClientPhone(qPhone);
    if (qEmail) setClientEmail(contactEmail(qEmail) || "");
  }, []);

  /* ─── Repeat-flow: prefill addons from names once Acuity addons load ─── */
  const naddonNamesAppliedRef = useRef(false);
  useEffect(() => {
    if (isEditMode || naddonNamesAppliedRef.current) return;
    const raw = searchParams.get("naddonNames");
    if (!raw) { naddonNamesAppliedRef.current = true; return; }
    if (allAddons.length === 0) return;
    const wanted = raw.split("|").map((n) => n.trim()).filter(Boolean);
    const ids = allAddons.filter((a) => wanted.includes(a.name)).map((a) => a.id);
    if (ids.length > 0) setSelectedAddons(ids);
    naddonNamesAppliedRef.current = true;
  }, [isEditMode, allAddons, searchParams]);

  /* ─── Repeat-flow: jump to summary once a time slot is tapped ─── */
  const autoAdvanceFiredRef = useRef(false);
  const autoAdvanceEnabled = searchParams.get("nautobook") === "1";
  useEffect(() => {
    if (!autoAdvanceEnabled || autoAdvanceFiredRef.current) return;
    if (isEditMode) return;
    if (!selectedTime || !selectedType || !selectedCalendar) return;
    autoAdvanceFiredRef.current = true;
    setRecurrencePattern(null);
    // Strip the nautobook flag so back-nav doesn't re-fire.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("nautobook");
      return next;
    }, { replace: true });
    setStep("summary");
    if (!hasClient) setClientExpanded(true);
  }, [autoAdvanceEnabled, isEditMode, selectedTime, selectedType, selectedCalendar, hasClient]);

  /* ─── Phase 1B.UX.3.B Window 1 — hardClear() ─────────────────────────────
   * Wipes all 6 URL persistence params. Called after successful create. */
  const hardClear = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        ["nstep", "ncal", "nsvc", "naddons", "ndate", "ntime"].forEach((k) =>
          next.delete(k),
        );
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  /* ─── T2: hydrate calendar + service + addons from URL once Acuity loads ── */
  useEffect(() => {
    if (isEditMode) return;
    if (idsHydrated) return;
    if (loadingData) return;
    if (calendars.length === 0) return;

    // Calendar
    let cal: AcuityCalendar | null = null;
    if (calParam) {
      const calId = parseInt(calParam, 10);
      cal = calendars.find((c) => c.id === calId) || null;
      if (cal) setSelectedCalendar(cal);
    }

    // Service — match by Acuity type id only when this is a repeat/prefill
    // flow (nautobook=1). Trust the historical pairing even if Acuity later
    // unlinked the service from this calendar. For other flows keep the
    // strict calendar-binding check so picker stays consistent.
    let svc: AcuityType | null = null;
    if (svcParam && cal) {
      const svcId = parseInt(svcParam, 10);
      const isRepeatFlow = searchParams.get("nautobook") === "1";
      svc = isRepeatFlow
        ? (services.find((s) => s.id === svcId) || null)
        : (services.find((s) => s.id === svcId && s.calendarIDs?.includes(cal!.id)) || null);
      if (svc) {
        setSelectedType(svc);
      } else if (svcId >= 0) {
        toast.info(language === "es" ? "Servicio no disponible" : "Service unavailable");
      }
    }

    // Addons — intersect saved ids with the service's allowed addon set
    if (addonsParam && svc) {
      const wantedIds = addonsParam.split(",").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
      const allowed = new Set(svc.addonIDs || []);
      const validIds = wantedIds.filter((id) => allowed.has(id));
      if (validIds.length > 0) setSelectedAddons(validIds);
    }

    setIdsHydrated(true);
  }, [isEditMode, idsHydrated, loadingData, calendars, services, calParam, svcParam, addonsParam, language]);

  /* ─── T3: hydrate date from URL (within booking-rule window) ─── */
  const ndateAppliedRef = useRef(false);
  useEffect(() => {
    if (isEditMode) return;
    if (ndateAppliedRef.current) return;
    if (!dateParam) { ndateAppliedRef.current = true; return; }
    const parsed = parse(dateParam, "yyyy-MM-dd", new Date());
    if (!isValid(parsed)) { ndateAppliedRef.current = true; return; }
    if (isDateAllowed(parsed)) {
      setSelectedDate(parsed);
      setWeekStart(startOfWeek(parsed, { weekStartsOn: 0 }));
    }
    ndateAppliedRef.current = true;
  }, [isEditMode, dateParam, isDateAllowed]);

  /* ─── T3 (cont.): validate ?ntime against loaded slots ─── */
  const ntimeAppliedRef = useRef(false);
  useEffect(() => {
    if (isEditMode) return;
    if (ntimeAppliedRef.current) return;
    if (!timeParam) { ntimeAppliedRef.current = true; setDateTimeHydrated(true); return; }
    if (!selectedType || !selectedCalendar) return;
    if (loadingTimes) return;
    const found = timeSlots.find((s) => s.time === timeParam);
    if (found) setSelectedTime(timeParam);
    ntimeAppliedRef.current = true;
    setDateTimeHydrated(true);
  }, [isEditMode, timeParam, selectedType, selectedCalendar, timeSlots, loadingTimes]);

  /* ─── T5: validate ?nstep then unblock URL writes ─── */
  useEffect(() => {
    if (isEditMode) return;
    if (hydrated) return;
    if (!idsHydrated) return;
    if (!dateTimeHydrated) return;

    const target = stepParam;
    if (target) {
      let valid: Step = "barber";
      if (selectedCalendar) valid = "service";
      if (selectedCalendar && selectedType) valid = "datetime";
      if (selectedCalendar && selectedType && selectedTime) valid = "summary";

      const order: Step[] = ["barber", "service", "addons", "datetime", "summary"];
      const targetIdx = order.indexOf(target);
      const validIdx = order.indexOf(valid);
      const final = targetIdx <= validIdx ? target : valid;
      if (final !== step) setStep(final);
    }
    setHydrated(true);
  }, [isEditMode, hydrated, idsHydrated, dateTimeHydrated, stepParam, selectedCalendar, selectedType, selectedTime, step]);

  /* ─── Write effects: state → URL (gated by hydrated) ─────────────────── */
  // Single consolidated effect — replaces 6 per-field URL syncs + initial backfill.
  // Fires once on hydration flip and on any subsequent state change.
  useEffect(() => {
    if (isEditMode || !hydrated) return;
    setStepParam(step);
    setCalParam(selectedCalendar ? String(selectedCalendar.id) : null);
    setSvcParam(selectedType ? String(selectedType.id) : null);
    setAddonsParam(selectedAddons.length > 0 ? selectedAddons.join(",") : null);
    setDateParam(format(selectedDate, "yyyy-MM-dd"));
    setTimeParam(selectedTime);
  }, [
    isEditMode,
    hydrated,
    step,
    selectedCalendar,
    selectedType,
    selectedAddons,
    selectedDate,
    selectedTime,
    setStepParam,
    setCalParam,
    setSvcParam,
    setAddonsParam,
    setDateParam,
    setTimeParam,
  ]);


  /* ─── Services for selected barber (Acuity types + local DB overrides + local-only) ─── */
  const barberServices = useMemo(() => {
    if (!selectedCalendar) return [];
    const acuityForCal = services.filter((t) => t.calendarIDs?.includes(selectedCalendar.id));
    const barberId = selectedCalendar.barberId;

    // Build override map for this barber
    const overrides = new Map<number, DbService>();
    if (barberId) {
      for (const ds of dbServices) {
        if (ds.barber_id === barberId) overrides.set(ds.acuity_type_id, ds);
      }
    }

    // Apply local edits (when locally_edited) to Acuity-backed services + capture sort_order
    const acuityIds = new Set(acuityForCal.map((s) => s.id));
    const merged: Array<AcuityType & { _sortOrder: number }> = acuityForCal.map((s) => {
      const ov = overrides.get(s.id);
      const useLocal = ov?.locally_edited;
      return {
        ...s,
        name: useLocal ? ov!.name : s.name,
        duration: useLocal ? ov!.duration_minutes : s.duration,
        price: useLocal ? (ov!.price_cents / 100).toFixed(2) : s.price,
        _sortOrder: ov?.sort_order ?? 999999,
      };
    });

    // Local-only services intentionally NOT included.
    // Reason: appointments booked against them never appear in Acuity, so the public
    // scheduler shows those time slots as available — risk of double-bookings.
    // Every appointment must be created through Acuity. (See: Anthony Borrero recurring incident)

    merged.sort((a, b) => (a._sortOrder - b._sortOrder) || a.name.localeCompare(b.name));
    return merged;
  }, [services, dbServices, selectedCalendar]);

  // Helper: is the selected service local-only (lives in our DB, not Acuity)?
  const isLocalService = (svc: AcuityType | null) => !!svc && svc.id < 0;

  /* ─── Available add-ons list filtered by selected type ─── */
  // Reset of selectedAddons + auto-skip happen inline at the setSelectedType setter
  // (see service step button). This memo only derives the available list from allAddons.
  const addons = useMemo<AcuityAddon[]>(() => {
    if (!selectedType) return [];
    const ids = selectedType.addonIDs || [];
    return ids.length > 0 ? allAddons.filter((a) => ids.includes(a.id)) : [];
  }, [selectedType, allAddons]);

  /* ─── Load available dates when type + calendar + week + browsed month change ─── */
  // Fetch BOTH the selected date's month AND the month being browsed in the picker,
  // so chevroning forward/back does not leave days greyed-out.
  const monthsToFetchKey = useMemo(() => {
    const set = new Set<string>();
    set.add(format(selectedDate, "yyyy-MM"));
    if (monthViewOpen) set.add(format(monthViewDate, "yyyy-MM"));
    return Array.from(set).sort().join("|");
  }, [selectedDate, monthViewOpen, monthViewDate]);

  useEffect(() => {
    if (step !== "datetime" || !selectedType || !selectedCalendar) return;
    if (isLocalService(selectedType)) {
      setAvailableDates([]);
      setLoadingDates(false);
      return;
    }
    setLoadingDates(true);
    const months = monthsToFetchKey.split("|").filter(Boolean);
    Promise.all(
      months.map((month) =>
        acuityProxy(`/availability/dates?appointmentTypeID=${selectedType.id}&calendarID=${selectedCalendar.id}&month=${month}`)
          .then((data) => (Array.isArray(data) ? data.map((d: any) => d.date as string) : []))
          .catch(() => [] as string[]),
      ),
    )
      .then((lists) => setAvailableDates(Array.from(new Set(lists.flat()))))
      .finally(() => setLoadingDates(false));
  }, [step, selectedType, selectedCalendar, monthsToFetchKey]);

  /* ─── Total duration (service + selected add-ons) in minutes ─── */
  const totalDurationMinutes = useMemo(() => {
    let dur = selectedType?.duration || 0;
    addons.filter((a) => selectedAddons.includes(a.id)).forEach((a) => { dur += a.duration || 0; });
    return dur;
  }, [selectedType, addons, selectedAddons]);

  /* ─── Extra duration from add-ons (beyond the base service) ─── */
  const addonExtraMinutes = useMemo(() => {
    let extra = 0;
    addons.filter((a) => selectedAddons.includes(a.id)).forEach((a) => { extra += a.duration || 0; });
    return extra;
  }, [addons, selectedAddons]);

  /* ─── Load time slots: Acuity base, OR locally generated for DB-only services ─── */
  useEffect(() => {
    if (step !== "datetime" || !selectedType || !selectedCalendar) return;
    setLoadingTimes(true);
    setSelectedTime(null);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const bId = selectedCalendar.barberId;
    const local = isLocalService(selectedType);
    const needsLocalFilter = addonExtraMinutes > 0 || local;

    const slotsPromise = local
      ? Promise.resolve([] as AcuityTimeSlot[])
      : acuityProxy(
          `/availability/times?appointmentTypeID=${selectedType.id}&calendarID=${selectedCalendar.id}&date=${dateStr}`
        );

    // Local-only services need working_hours + existing-appointment overlap data
    const workingHoursPromise = local && bId
      ? supabase
          .from("working_hours")
          .select("day_of_week, start_time, end_time, is_active")
          .eq("barber_id", bId)
          .eq("is_active", true)
      : Promise.resolve({ data: [] as any[] });

    const localApptsPromise = needsLocalFilter
      ? (() => {
          const q = supabase
            .from("appointments")
            .select("starts_at, ends_at")
            .neq("status", "cancelled")
            .gte("starts_at", `${dateStr}T00:00:00`)
            .lte("starts_at", `${dateStr}T23:59:59`);
          if (bId) q.eq("barber_id", bId);
          return q;
        })()
      : Promise.resolve({ data: [] as { starts_at: string; ends_at: string }[] });

    Promise.all([slotsPromise, localApptsPromise, workingHoursPromise])
      .then(([slotsData, apptRes, whRes]) => {
        const cutoff = addMinutes(new Date(), minAdvanceMinutes).getTime();
        const existingAppts = (('data' in apptRes ? apptRes.data : apptRes) || []) as { starts_at: string; ends_at: string }[];

        // 1) Build base slot list
        let baseSlots: AcuityTimeSlot[];
        if (local) {
          // Generate 15-min slots from working hours windows for the selected day
          const dow = selectedDate.getDay(); // 0=Sun..6=Sat
          const windows = (whRes.data || []).filter((w: any) => w.day_of_week === dow);
          const generated: AcuityTimeSlot[] = [];
          for (const w of windows) {
            const [sh, sm] = String(w.start_time).split(":").map(Number);
            const [eh, em] = String(w.end_time).split(":").map(Number);
            let t = new Date(selectedDate);
            t.setHours(sh, sm, 0, 0);
            const end = new Date(selectedDate);
            end.setHours(eh, em, 0, 0);
            // last slot must allow full duration to fit before window end
            const lastStart = end.getTime() - totalDurationMinutes * 60_000;
            while (t.getTime() <= lastStart) {
              const iso = toAcuityDatetimeInTz(
                t.getFullYear(),
                t.getMonth() + 1,
                t.getDate(),
                t.getHours(),
                t.getMinutes(),
                shopTz,
              );
              generated.push({ time: iso, slotsAvailable: 1 });
              t = addMinutes(t, 15);
            }
          }
          baseSlots = generated;
        } else {
          baseSlots = Array.isArray(slotsData) ? (slotsData as AcuityTimeSlot[]) : [];
        }

        // 2) Apply min-advance cutoff
        const advanceFiltered = baseSlots.filter((s) => new Date(s.time).getTime() >= cutoff);

        // 3) For local services or when add-ons extend duration, filter against existing appts
        if (!needsLocalFilter) {
          setTimeSlots(advanceFiltered);
          return;
        }

        const filtered = advanceFiltered.filter((slot) => {
          const slotStart = new Date(slot.time).getTime();
          const slotEnd = slotStart + totalDurationMinutes * 60 * 1000;
          return !existingAppts.some((appt) => {
            const apptStart = new Date(appt.starts_at).getTime();
            const apptEnd = new Date(appt.ends_at).getTime();
            return slotStart < apptEnd && slotEnd > apptStart;
          });
        });

        setTimeSlots(filtered);
      })
      .catch(() => setTimeSlots([]))
      .finally(() => setLoadingTimes(false));
  }, [step, selectedType, selectedCalendar, format(selectedDate, "yyyy-MM-dd"), totalDurationMinutes, addonExtraMinutes, minAdvanceMinutes]);

  /* ─── Current authorized AgendaOS client suggestions ─── */
  const handleClientFieldChange = (field: "first" | "last" | "phone" | "email", value: string) => {
    setSelectedClient(null);
    setSupabaseClientId(null);
    if (field === "first") setClientFirst(value);
    else if (field === "last") setClientLast(value);
    else if (field === "phone") setClientPhone(value);
    else setClientEmail(value);
    triggerClientSearch(value);
  };

  const selectClient = (client: ClientSuggestion) => {
    clearClientSearch();
    setSelectedClient(client);
    setSupabaseClientId(client.id);
    setClientFirst(client.firstName);
    setClientLast(client.lastName);
    setClientPhone(client.phone);
    setClientEmail(contactEmail(client.email) || "");
  };

  /* ─── Total ─── */
  const serviceTotal = useMemo(() => {
    let sum = parseFloat(selectedType?.price || "0");
    addons.filter((a) => selectedAddons.includes(a.id)).forEach((a) => { sum += parseFloat(a.price || "0"); });
    return sum;
  }, [selectedType, addons, selectedAddons]);

  const productTotal = useMemo(() => {
    return cartProducts.reduce((s, p) => s + (p.price_cents * p.qty) / 100, 0);
  }, [cartProducts]);

  const total = serviceTotal + productTotal;

  /* ─── Submit ─── */
  const canSubmit = selectedType && selectedCalendar && selectedDate && selectedTime && hasClient;

  const handleSubmit = async (opts?: { skipConflictCheck?: boolean }) => {
    // Synchronous lock: blocks a 2nd tap that lands before React re-renders
    // the disabled button (root of duplicate Acuity bookings).
    if (!canSubmit || submitting || Date.now() - submitLockRef.current < 1500) return;
    submitLockRef.current = Date.now();
    const skipConflictCheck = opts?.skipConflictCheck === true;
    if ((skipConflictCheck || recurrencePattern?.overrideConflicts) && !mayOverride) return;

    // Instant tactile + visual feedback so the button doesn't feel dead
    // while we run pre-checks (identity match, conflict probe) over the network.
    tapFeedback();
    setSubmitting(true);

    // Unified identity match pre-check (only when no client linked yet & not editing).
    if (!isEditMode && !supabaseClientId && !matchAck && (clientPhone.trim() || clientEmail.trim())) {
      setMatchChecking(true);
      try {
        const match = await findMatchingClient(clientPhone, clientEmail);
        if (match.clientId) {
          if (match.matchType === "both") {
            setSupabaseClientId(match.clientId); // silent attach
          } else {
            setMatchPrompt(match); // partial → ask
            setMatchChecking(false);
            setSubmitting(false);
            return;
          }
        }
      } finally {
        setMatchChecking(false);
      }
    }

    const validation = validateStaffClientInput({
      firstName: clientFirst,
      lastName: clientLast,
      phone: clientPhone,
      email: clientEmail,
    });
    if (validation.ok === false) {
      if (validation.reason === "missing_phone") {
        toast.error(language === "es" ? "El teléfono es requerido" : "Phone number is required");
      } else if (validation.reason === "missing_first_name") {
        toast.error(language === "es" ? "El nombre es requerido" : "First name is required");
      } else if (validation.reason === "invalid_phone") {
        toast.error(language === "es" ? "Teléfono inválido" : "Invalid phone number");
      } else if (validation.reason === "invalid_email") {
        toast.error(language === "es" ? "Email inválido" : "Invalid email");
      }
      setSubmitting(false);
      return;
    }

    // ── Conflict pre-check (single occurrence only; recurring handles per-date) ──
    try {
    if (!skipConflictCheck && !recurrencePattern && selectedTime && selectedCalendar?.barberId) {
      const startsAt = selectedTime;
      const durMin = totalDurationMinutes;
      if (durMin <= 0) throw new Error(language === "es" ? "No se pudo verificar la duración." : "Could not verify duration.");
      const endsAtMs = new Date(startsAt).getTime() + durMin * 60_000;
      const endsAt = new Date(endsAtMs).toISOString();
      const found = await checkAppointmentConflicts(
        selectedCalendar.barberId,
        startsAt,
        endsAt,
        isEditMode ? (editSupabaseId || null) : null,
      );
      if (found.length > 0) {
        setConflicts(found);
        setSubmitting(false);
        return; // Wait for user to confirm via modal
      }
    }
    } catch (error) {
      setSubmitting(false);
      toast.error(language === "es" ? "No se pudo verificar el horario. Intenta nuevamente." : "Could not verify the slot. Try again.");
      return;
    }

    try {
      // A profile can be merged/deleted while this form is open. Stop before
      // creating anything externally rather than resurrecting the old profile.
      if (selectedClient) {
        const { data: current, error } = await supabase.rpc("get_clients_barber_safe")
          .select("id, first_name, last_name, phone, email")
          .eq("id", selectedClient.id).maybeSingle();
        if (error || !current || current.first_name !== clientFirst
          || (current.last_name || "") !== clientLast
          || (current.phone || "") !== clientPhone
          || (contactEmail(current.email) || "") !== (contactEmail(clientEmail) || "")) {
          clearClientSearch();
          setSelectedClient(null);
          setSupabaseClientId(null);
          throw new Error(language === "es"
            ? "El perfil cambió o no se pudo verificar. Busca y selecciona el cliente nuevamente."
            : "The profile changed or could not be verified. Search and select the client again.");
        }
      }
      let acuityResult: any;

      // ── LOCAL-ONLY service path: never touches Acuity, persists straight to our DB ──
      if (!isEditMode && isLocalService(selectedType)) {
        const barberId = selectedCalendar?.barberId;
        if (!barberId) throw new Error("Barber not found for calendar");

        // Find or create client in Supabase
        let clientIdLocal = supabaseClientId;
        if (!clientIdLocal) {
          clientIdLocal = await findOrCreateClient({
            firstName: clientFirst,
            lastName: clientLast,
            phone: clientPhone,
            email: clientEmail,
            acuityClientId: selectedClient?.acuityClientId ?? null,
          });
        }

        const startsAt = selectedTime!; // already AST ISO with -0400 offset
        const endsAtMs = new Date(startsAt).getTime() + (selectedType!.duration || 30) * 60_000;
        const endsAt = new Date(endsAtMs).toISOString();
        // Synthetic acuity_id (negative timestamp) keeps NOT NULL satisfied without colliding with real Acuity IDs
        const syntheticAcuityId = -Date.now();
        if (skipConflictCheck) {
          await authorizeStaffOverlap(syntheticAcuityId, "Staff confirmed book anyway (local)");
        }

        const { data: inserted, error: insertErr } = await supabase.from("appointments").insert({
          acuity_id: syntheticAcuityId,
          barber_id: barberId,
          client_name: `${clientFirst.trim()} ${clientLast.trim()}`.trim(),
          client_email: clientEmail.trim() || null,
          client_phone: clientPhone.trim() || null,
          client_id: clientIdLocal,
          service_name: selectedType!.name,
          service_id: selectedType!.id, // negative synthetic id
          addons: [],
          starts_at: startsAt,
          ends_at: endsAt,
          duration_minutes: selectedType!.duration || 30,
          price_cents: Math.round(parseFloat(selectedType!.price || "0") * 100),
          status: "scheduled",
          paid: false,
          created_by_role: createdByRole,
          created_by_user_id: createdByUserId,
          booking_source: createdByRole === "barber" ? "barber_manual" : "admin_manual",
        }).select("id").single();

        if (insertErr) throw new Error(insertErr.message);
        setCreatedAppointmentId(inserted?.id || null);
        toast.success(language === "es" ? "Cita agendada" : "Appointment scheduled");
        hardClear();
        setSuccessSheetOpen(true);
        return;
      }

      if (isEditMode && editAcuityId) {
        // ── UPDATE existing appointment in Acuity ──
        const updateBody: any = {
          appointmentTypeID: selectedType!.id,
          calendarID: selectedCalendar!.id,
          datetime: selectedTime,
          firstName: clientFirst.trim(),
          lastName: clientLast.trim() || clientFirst.trim(),
          email: clientEmail.trim() || `${clientPhone.trim().replace(/\D/g, "")}@placeholder.local`,
          phone: clientPhone.trim(),
          notes,
          addonIDs: selectedAddons,
        };
        if (!sendConfirmation) updateBody.noEmail = true;

        if (skipConflictCheck) {
          await authorizeStaffOverlap(editAcuityId, "Staff confirmed book anyway (reschedule)");
        }
        acuityResult = await acuityProxy(`/appointments/${editAcuityId}/reschedule`, "PUT", {
          datetime: selectedTime,
          calendarID: selectedCalendar!.id,
          admin: true,
        });
        if (acuityResult.error || acuityResult.status_code >= 400) throw new Error(acuityResult.message || "Acuity reschedule failed");

        // Update service/addons separately if changed
        await acuityProxy(`/appointments/${editAcuityId}`, "PUT", {
          appointmentTypeID: selectedType!.id,
          addonIDs: selectedAddons,
          firstName: clientFirst.trim(),
          lastName: clientLast.trim() || clientFirst.trim(),
          email: clientEmail.trim() || `${clientPhone.trim().replace(/\D/g, "")}@placeholder.local`,
          phone: clientPhone.trim(),
          notes,
        });

        // Re-fetch to get updated data
        acuityResult = await acuityProxy(`/appointments/${editAcuityId}`, "GET");
      } else {
        // ── CREATE new appointment(s) ──
        // For recurring: generate all dates, attempt each in Acuity. Skip ones that fail.
        const baseDateTime = selectedTime ? new Date(selectedTime) : new Date();
        const recurringDates = recurrencePattern
          ? generateRecurrenceDates(baseDateTime, recurrencePattern)
          : [baseDateTime];

        // Build a deterministic recurring_group_id if recurring (UUID via crypto.randomUUID)
        const recurringGroupId =
          recurrencePattern && recurringDates.length > 1
            ? (typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
            : null;

        const skipped: Date[] = [];
        const createdAcuityResults: any[] = [];
        let firstCreateError: string | null = null;

        // Show progress modal for recurring (more than 1 date)
        const isBulk = recurringDates.length > 1;
        if (isBulk) {
          setProgressAction("create");
          setProgressTotal(recurringDates.length);
          setProgressCurrent(0);
          setProgressOpen(true);
        }

        for (let i = 0; i < recurringDates.length; i++) {
          const occurrenceDate = recurringDates[i];
          // Build Acuity ISO with the shop timezone offset (replaces hardcoded -0400).
          const occurrenceIso = toAcuityDatetimeInTz(
            occurrenceDate.getFullYear(),
            occurrenceDate.getMonth() + 1,
            occurrenceDate.getDate(),
            occurrenceDate.getHours(),
            occurrenceDate.getMinutes(),
            shopTz,
          );

          const shouldRespectAvailability = isBulk && !recurrencePattern?.overrideConflicts;
          const appointmentBody: any = {
            appointmentTypeID: selectedType!.id,
            calendarID: selectedCalendar!.id,
            datetime: occurrenceIso,
            firstName: clientFirst.trim(),
            lastName: clientLast.trim() || clientFirst.trim(),
            email: clientEmail.trim() || `${clientPhone.trim().replace(/\D/g, "")}@placeholder.local`,
            phone: clientPhone.trim(),
            notes,
            addonIDs: selectedAddons,
            admin: true,
            // Only recurring bulk creation should skip unavailable occurrences.
            // Single admin/barber appointments must keep the Acuity admin override.
            ...(shouldRespectAvailability ? { respectAvailability: true } : {}),
          };
          if (!sendConfirmation) appointmentBody.noEmail = true;

          try {
            if (shouldRespectAvailability) {
              const availableTimes = await acuityProxy(
                `/availability/times?appointmentTypeID=${selectedType!.id}&calendarID=${selectedCalendar!.id}&date=${format(occurrenceDate, "yyyy-MM-dd")}`
              );
              const hasAvailableSlot = Array.isArray(availableTimes)
                && availableTimes.some((slot: AcuityTimeSlot) => sameMinute(slot.time, occurrenceIso));
              if (!hasAvailableSlot) {
                skipped.push(occurrenceDate);
                if (isBulk) setProgressCurrent(i + 1);
                continue;
              }
            }
            const result = await acuityProxy("/appointments", "POST", appointmentBody);
            if (result.error || result.status_code >= 400) {
              firstCreateError ||= result.message || result.error || null;
              skipped.push(occurrenceDate);
            } else {
              createdAcuityResults.push(result);
            }
          } catch (err: any) {
            firstCreateError ||= err?.message || String(err);
            skipped.push(occurrenceDate);
          }
          if (isBulk) setProgressCurrent(i + 1);
        }

        if (isBulk) setProgressOpen(false);

        if (createdAcuityResults.length === 0) {
          if (!isBulk && firstCreateError) {
            throw new Error(language === "es" ? `No se pudo crear cita: ${firstCreateError}` : `Could not create appointment: ${firstCreateError}`);
          }
          throw new Error(language === "es" ? "No se pudo crear ninguna cita" : "Could not create any appointment");
        }

        // First created result drives the rest of the flow (client matching, navigation)
        acuityResult = createdAcuityResults[0];

        // Find or create client in Supabase (once)
        let clientIdShared = supabaseClientId;
        if (!clientIdShared) {
          clientIdShared = await findOrCreateClient({
            firstName: clientFirst,
            lastName: clientLast,
            phone: clientPhone,
            email: clientEmail,
            acuityClientId: selectedClient?.acuityClientId ?? null,
          });
        }

        // Match barber once (by stable Acuity calendar ID)
        const { data: barberRows } = await supabase.from("barbers_public").select("id, acuity_calendar_id").not("acuity_calendar_id", "is", null);
        const matchedBarber = barberRows?.find((b) => b.acuity_calendar_id === selectedCalendar!.id);
        if (!matchedBarber?.id) throw new Error("Barber not found for calendar");

        // Upsert each created appointment, sharing recurring_group_id if applicable
        for (const r of createdAcuityResults) {
          // Staff confirmed "Book anyway": authorize this slot to share time with others.
          if (skipConflictCheck || recurrencePattern?.overrideConflicts) {
            await authorizeStaffOverlap(r.id, "Staff confirmed book anyway");
          }
          const addonNames = r.addons?.map((a: any) => a.name) || [];
          // Never persist the synthetic placeholder email Acuity required.
          const cleanEmail =
            r.email && !String(r.email).toLowerCase().endsWith("@placeholder.local")
              ? r.email
              : null;
          // Server verifies same shop + that this user created it in Acuity, and records who booked.
          const { error: persistError } = await (supabase.rpc as any)("staff_record_created_appointment", {
            _acuity_id: r.id,
            _barber_id: matchedBarber.id,
            _client_id: clientIdShared ?? null,
            _client_name: `${r.firstName} ${r.lastName}`.trim(),
            _client_email: cleanEmail,
            _client_phone: r.phone || null,
            _service_name: r.type,
            _service_id: r.appointmentTypeID,
            _addons: addonNames,
            _starts_at: r.datetime,
            _ends_at: new Date(new Date(r.datetime).getTime() + (r.duration || 30) * 60_000).toISOString(),
            _duration_minutes: r.duration,
            _price_cents: Math.round(parseFloat(r.price || "0") * 100),
            _is_recurring: !!recurringGroupId,
            _recurring_group_id: recurringGroupId ?? null,
          });
          if (persistError) throw persistError;
        }

        // Surface summary if recurring
        if (recurringGroupId) {
          setRecurringSummary({ created: createdAcuityResults.length, skipped });
          if (skipped.length > 0) {
            const dfLocale = language === "es" ? es : enUS;
            const list = skipped.slice(0, 3).map((d) => format(d, "d MMM", { locale: dfLocale })).join(", ");
            const more = skipped.length > 3 ? ` (+${skipped.length - 3})` : "";
            toast.warning(
              language === "es"
                ? `Se omitieron ${skipped.length} fecha(s) sin disponibilidad: ${list}${more}`
                : `Skipped ${skipped.length} date(s) with no availability: ${list}${more}`,
              { duration: 6000 }
            );
          }
        }
      }

      // For edit mode (no recurring loop), upsert the single result here
      if (isEditMode) {
        // Find or create client in Supabase
        let clientId = supabaseClientId;
        if (!clientId) {
          clientId = await findOrCreateClient({
            firstName: clientFirst,
            lastName: clientLast,
            phone: clientPhone,
            email: clientEmail,
            acuityClientId: selectedClient?.acuityClientId ?? null,
          });
        }

        const { data: barberRows } = await supabase.from("barbers_public").select("id, acuity_calendar_id").not("acuity_calendar_id", "is", null);
        const matchedBarber = barberRows?.find((b) => b.acuity_calendar_id === selectedCalendar!.id);
        if (!matchedBarber?.id) throw new Error("Barber not found for calendar");

        const addonNames = acuityResult.addons?.map((a: any) => a.name) || [];
        const { error: editPersistError } = await supabase.from("appointments").upsert({
          acuity_id: acuityResult.id,
          barber_id: matchedBarber.id,
          client_name: `${acuityResult.firstName} ${acuityResult.lastName}`.trim(),
          client_email: acuityResult.email && !String(acuityResult.email).toLowerCase().endsWith("@placeholder.local") ? acuityResult.email : null,
          client_phone: acuityResult.phone || null,
          client_id: clientId,
          service_name: acuityResult.type,
          service_id: acuityResult.appointmentTypeID,
          addons: addonNames,
          starts_at: acuityResult.datetime,
          ends_at: new Date(new Date(acuityResult.datetime).getTime() + (acuityResult.duration || 30) * 60_000).toISOString(),
          duration_minutes: acuityResult.duration,
          price_cents: Math.round(parseFloat(acuityResult.price || "0") * 100),
          status: "scheduled",
          paid: false,
          created_by_role: createdByRole,
          created_by_user_id: createdByUserId,
        }, { onConflict: "acuity_id" });
        if (editPersistError) throw editPersistError;
      }

      const { data: createdAppt } = await supabase.from("appointments").select("id").eq("acuity_id", acuityResult.id).maybeSingle();
      setCreatedAppointmentId(createdAppt?.id || null);

      if (isEditMode) {
        toast.success(language === "es" ? "Cita actualizada" : "Appointment updated");
      } else if (recurrencePattern) {
        toast.success(language === "es" ? "Citas recurrentes creadas" : "Recurring appointments created");
      } else {
        toast.success(language === "es" ? "Cita agendada" : "Appointment scheduled");
      }
      hardClear();
      setSuccessSheetOpen(true);
    } catch (err: any) {
      setProgressOpen(false);
      toast.error(err.message || (isEditMode ? "Error updating appointment" : "Error scheduling appointment"));
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Navigation helpers ─── */
  const goBack = () => {
    if (step === "barber") {
      if (isEditMode && editApptId) navigate(`/admin/appointment/${editApptId}`);
      else navigate(backToCalendar(searchParams));
    }
    else if (step === "service") setStep("barber");
    else if (step === "addons") setStep("service");
    else if (step === "datetime") setStep(hasSelectedTypeAddons ? "addons" : "service");
    else if (step === "summary") setStep("datetime");
  };

  const stepTitle = () => {
    switch (step) {
      case "barber": return language === "es" ? "Seleccionar Barbero" : "Select Barber";
      case "service": return language === "es" ? "Servicios" : "Services";
      case "addons": return language === "es" ? "Complementos" : "Add-ons";
      case "datetime": return language === "es" ? "Fecha y Hora" : "Date & Time";
      case "summary": return language === "es" ? "Resumen" : "Summary";
    }
  };

  const jumpToStep = (target: Step) => {
    if (target === step) return;
    setStep(target);
  };

  const hasSelectedTypeAddons = addons.length > 0;
  const nextAfterService: Step = hasSelectedTypeAddons ? "addons" : "datetime";

  const flowSteps = useMemo<Step[]>(() => {
    const list: Step[] = ["barber", "service"];
    if (hasSelectedTypeAddons) list.push("addons");
    list.push("datetime", "summary");
    return list;
  }, [hasSelectedTypeAddons]);
  const progress = useMemo(() => {
    const idx = flowSteps.indexOf(step);
    if (idx < 0) return 0;
    return idx / Math.max(1, flowSteps.length - 1);
  }, [flowSteps, step]);

  const chips = useMemo<BookingProgressChip[]>(() => {
    const list: BookingProgressChip[] = [];
    if (selectedCalendar) list.push({ stepKey: "barber", label: selectedCalendar.name.split(" ")[0] });
    if (selectedType) {
      list.push({ stepKey: "service", label: selectedType.name, detail: selectedType.price ? `$${selectedType.price}` : undefined });
    }
    if (selectedAddons.length > 0) {
      list.push({
        stepKey: "addons",
        label: language === "es" ? `+${selectedAddons.length} complemento${selectedAddons.length > 1 ? "s" : ""}` : `+${selectedAddons.length} add-on${selectedAddons.length > 1 ? "s" : ""}`,
      });
    }
    if (cartProducts.length > 0) {
      const totalQty = cartProducts.reduce((sum, p) => sum + p.qty, 0);
      list.push({
        stepKey: "summary",
        label: language === "es" ? `${totalQty} producto${totalQty > 1 ? "s" : ""}` : `${totalQty} product${totalQty > 1 ? "s" : ""}`,
        detail: `$${productTotal.toFixed(2)}`,
      });
    }
    if (selectedTime) {
      list.push({ stepKey: "datetime", label: format(new Date(selectedTime), "EEE d · h:mm a", { locale: dateFnsLocale }) });
    }
    return list;
  }, [selectedCalendar, selectedType, selectedAddons.length, cartProducts, productTotal, selectedTime, dateFnsLocale, language]);

  // Auto-skip from "addons" step is handled inline at the setSelectedType setter
  // (see service step button) — no effect needed.

  /* ─── Edit client drawer helpers ─── */
  const openEditClientDrawer = () => {
    setEditClientFirstDraft(clientFirst);
    setEditClientLastDraft(clientLast);
    setEditClientPhoneDraft(clientPhone);
    setEditClientEmailDraft(clientEmail);
    setEditClientDrawerOpen(true);
  };

  const saveEditClient = async () => {
    if (savingClientEdit || !editClientFirstDraft.trim()) return;
    setSavingClientEdit(true);
    try {
      const fullName = `${editClientFirstDraft.trim()} ${editClientLastDraft.trim()}`.trim();

      // Update Acuity if in edit mode
      if (isEditMode && editAcuityId) {
        await acuityProxy(`/appointments/${editAcuityId}`, "PUT", {
          firstName: editClientFirstDraft.trim(),
          lastName: editClientLastDraft.trim(),
          phone: editClientPhoneDraft.trim(),
          email: editClientEmailDraft.trim(),
        });
      }

      // Update appointment record if in edit mode
      if (editSupabaseId) {
        await supabase.from("appointments").update({
          client_name: fullName,
          client_phone: editClientPhoneDraft.trim() || null,
          client_email: editClientEmailDraft.trim() || null,
        }).eq("id", editSupabaseId);
      }

      // Update clients table if linked
      if (supabaseClientId) {
        await supabase.from("clients").update({
          first_name: editClientFirstDraft.trim(),
          last_name: editClientLastDraft.trim() || null,
          phone: editClientPhoneDraft.trim() || null,
          email: editClientEmailDraft.trim() || null,
        }).eq("id", supabaseClientId);
      }

      // Update local form state
      setClientFirst(editClientFirstDraft.trim());
      setClientLast(editClientLastDraft.trim());
      setClientPhone(editClientPhoneDraft.trim());
      setClientEmail(editClientEmailDraft.trim());

      setEditClientDrawerOpen(false);
      toast.success(language === "es" ? "Cliente actualizado" : "Client updated");
    } catch (err: any) {
      toast.error(err.message || "Error updating client");
    } finally {
      setSavingClientEdit(false);
    }
  };

  /* ─── Render ─── */
  if (editLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col mx-auto w-full"
      style={{ maxWidth: 430, background: "var(--bg-base)", color: "var(--text-primary)", paddingTop: "env(safe-area-inset-top, 0px)" }}>

      {/* Header */}
      <header className="sticky top-0 z-30 px-4 pt-3 pb-2"
        style={{ background: "var(--bg-base)" }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={goBack} className="p-1 -ml-1">
            <ChevronLeft size={24} style={{ color: "var(--text-primary)" }} />
          </button>
          <button onClick={() => navigate(backToCalendar(searchParams))} className="p-1 -mr-1">
            <X size={20} style={{ color: "var(--text-tertiary)" }} />
          </button>
        </div>
        <BookingProgress
          progress={progress}
          chips={chips}
          onChipClick={(key) => jumpToStep(key as Step)}
          accent="var(--accent-color)"
        />
        <h1 className="text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{stepTitle()}</h1>
      </header>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">

        {/* ═══ STEP 1: BARBER ═══ */}
        {step === "barber" && (
          <div className="px-4 pt-4 pb-32">
            {loadingData ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {calendars.map((cal) => (
                  <BarberPickerRow
                    key={cal.id}
                    name={cal.name}
                    avatarUrl={cal.avatarUrl || null}
                    isSelected={selectedCalendar?.id === cal.id}
                    subtitle={language === "es" ? "Barbero" : "Barber"}
                    selectLabel={language === "es" ? "Elegir" : "Select"}
                    onClick={() => { if (selectedCalendar?.id === cal.id) { setSelectedCalendar(null); } else { setSelectedCalendar(cal); setStep("service"); } }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 2: SERVICE ═══ */}
        {step === "service" && (
          <div className="px-4 pt-2 pb-32">
            {barberServices.length === 0 ? (
              <p className="text-center py-12 text-sm" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "No hay servicios disponibles" : "No services available"}
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {barberServices.map((type) => {
                  const isSelected = selectedType?.id === type.id;
                  const bColor = selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)";
                  const durationLabel = type.duration >= 60
                    ? `${Math.floor(type.duration / 60)} hr${type.duration % 60 > 0 ? `, ${type.duration % 60} min` : ""}`
                    : `${type.duration} min`;
                  return (
                    <button key={type.id} onClick={() => { if (isSelected) { setSelectedType(null); } else { setSelectedType(type); setSelectedAddons([]); const hasAddons = (type.addonIDs || []).some((id) => allAddons.some((a) => a.id === id)); setTimeout(() => setStep(hasAddons ? "addons" : "datetime"), 350); } }}
                      className="w-full flex items-start gap-3 py-5 px-1 transition-all text-left">
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{type.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{durationLabel}</p>
                        {type.description && (
                          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>{type.description}</p>
                        )}
                        <p className="text-sm font-bold mt-1.5" style={{ color: "var(--text-primary)" }}>${type.price}</p>
                      </div>
                      {isSelected ? (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1"
                          style={{ background: bColor }}>
                          <Check className="icon-extrabold" size={18} color="#fff" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1"
                          style={{ border: "1.5px solid var(--border)" }}>
                          <Plus size={18} style={{ color: "var(--text-tertiary)" }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 3: ADD-ONS ═══ */}
        {step === "addons" && (() => {
          const bColor = selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)";
          const typeAddons = allAddons.filter((a) => (selectedType?.addonIDs || []).includes(a.id));
          return (
            <div className="px-4 pt-2 pb-32">
              {/* Selected service chip */}
              <div className="flex items-center gap-2 mb-4 px-1">
                <Scissors size={14} style={{ color: "var(--text-secondary)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {selectedType?.name}
                </span>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  ${selectedType?.price}
                </span>
              </div>

              {typeAddons.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {language === "es" ? "No hay complementos disponibles para este servicio" : "No add-ons available for this service"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {typeAddons.map((addon) => {
                    const isChecked = selectedAddons.includes(addon.id);
                    return (
                      <button key={addon.id}
                        onClick={() => setSelectedAddons((prev) =>
                          isChecked ? prev.filter((id) => id !== addon.id) : [...prev, addon.id]
                        )}
                        className="w-full flex items-center justify-between py-3 px-4 rounded-xl text-sm transition-all"
                        style={{
                          background: isChecked ? `${bColor}15` : "var(--bg-surface)",
                          border: isChecked ? `1.5px solid ${bColor}40` : "1.5px solid transparent",
                        }}>
                        <div className="flex-1 text-left">
                          <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{addon.name}</span>
                          {addon.duration > 0 && (
                            <span className="text-[11px] ml-2" style={{ color: "var(--text-tertiary)" }}>+{addon.duration} min</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                            {parseFloat(addon.price) > 0 ? `+$${addon.price}` : language === "es" ? "Gratis" : "Free"}
                          </span>
                          {isChecked ? (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center"
                              style={{ background: bColor }}>
                              <Check className="icon-extrabold" size={14} color="#fff" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center"
                              style={{ border: "1.5px solid var(--border)" }}>
                              <Plus size={12} style={{ color: "var(--text-tertiary)" }} />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Next button */}
              <button
                onClick={() => setStep("datetime")}
                className="w-full mt-6 py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
              >
                {selectedAddons.length > 0
                  ? (language === "es" ? "Siguiente" : "Next")
                  : (language === "es" ? "Omitir" : "Skip")}
              </button>
            </div>
          );
        })()}

        {/* ═══ STEP 4: DATE & TIME ═══ */}
        {step === "datetime" && (
          <div className="pb-32">
            {/* Barber chip + Calendar icon */}
            <div className="flex items-center justify-between px-4 pt-2 pb-3">
              {selectedCalendar && (
                <button onClick={() => setStep("barber")}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                  style={{ border: "1px solid var(--border)" }}>
                  {selectedCalendar.avatarUrl ? (
                    <img loading="lazy" decoding="async" src={selectedCalendar.avatarUrl} alt={selectedCalendar.name}
                      className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: `${getBarberColor(selectedCalendar.name)}20` }}>
                      <User size={12} style={{ color: getBarberColor(selectedCalendar.name) }} />
                    </div>
                  )}
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {selectedCalendar.name.split(" ")[0]}
                  </span>
                  <ChevronDown size={14} style={{ color: "var(--text-tertiary)" }} />
                </button>
              )}
              <button onClick={() => { goToDate(new Date()); setMonthViewOpen(false); }}
                className="w-10 h-10 flex items-center justify-center rounded-full"
                style={{ border: "1px solid var(--border)" }}>
                <CalendarCheck size={18} style={{ color: "var(--text-secondary)" }} />
              </button>
            </div>

            {/* Month title */}
            <div className="px-4 pb-2">
              <button onClick={() => { setMonthViewOpen(!monthViewOpen); if (!monthViewOpen) setMonthViewDate(selectedDate); }}
                className="flex items-center gap-1.5">
                <span className="text-lg font-bold capitalize" style={{ color: "var(--text-primary)" }}>
                  {format(selectedDate, "MMMM yyyy", { locale: dateFnsLocale })}
                </span>
                <ChevronDown size={16} className="transition-transform duration-200"
                  style={{ color: "var(--text-tertiary)", transform: monthViewOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
              </button>
            </div>

            {/* Month Grid (expandable) */}
            <AnimatePresence>
              {monthViewOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden px-4">
                  <MonthGrid
                    monthDate={monthViewDate}
                    selectedDate={selectedDate}
                    availableDates={availableDates}
                    onSelectDate={(d) => { goToDate(d); setMonthViewOpen(false); }}
                    onChangeMonth={setMonthViewDate}
                    language={language}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Week Row - Fresha style with large circles and day names below */}
            {!monthViewOpen && (
              <div className="px-2 pb-4"
                style={{ borderBottom: "1px solid var(--divider)" }}>
                <div className="flex items-center gap-1">
                  <button onClick={() => goToWeek(-1)} aria-label="Semana anterior"
                    className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                    <ChevronLeft size={20} style={{ color: "var(--text-secondary)" }} />
                  </button>
                  <div className="flex-1 overflow-hidden"
                    onTouchStart={(e) => { weekTouchRef.current = { startX: e.touches[0].clientX }; }}
                    onTouchEnd={(e) => {
                      const diff = (e.changedTouches[0]?.clientX || 0) - weekTouchRef.current.startX;
                      if (Math.abs(diff) > 50) {
                        if (diff > 0) goToWeek(-1); else goToWeek(1);
                      }
                    }}>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div key={weekStart.toISOString()}
                        initial={{ x: swipeDir * 120, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: swipeDir * -120, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 600, damping: 22, mass: 0.6 }}
                        className="flex items-center justify-around">
                        {weekDays.map((day, i) => {
                          const selected = isSameDay(day, selectedDate);
                          const todayDay = isToday(day);
                          const past = !isDateAllowed(day);
                          const dateStr = format(day, "yyyy-MM-dd");
                          const available = (availableDates.length === 0 || availableDates.includes(dateStr)) && !past;
                          const bColor = selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)";
                          const dayName = format(day, "EEEE", { locale: dateFnsLocale });
                          return (
                            <button key={i} onClick={() => setSelectedDate(day)}
                              className="flex flex-col items-center gap-1.5 py-1"
                              style={{ opacity: available ? 1 : 0.4, flex: 1 }}>
                              <span className="flex items-center justify-center text-base font-bold rounded-full"
                                style={{
                                  width: 44, height: 44,
                                  background: selected ? bColor : "transparent",
                                  color: selected ? "#fff" : todayDay ? bColor : "var(--text-primary)",
                                  border: todayDay && !selected ? `2px solid var(--text-tertiary)` : "2px solid transparent",
                                }}>
                                {format(day, "d")}
                              </span>
                              <span className="text-[10px] font-medium capitalize"
                                style={{ color: selected ? bColor : past ? "var(--text-tertiary)" : "var(--text-secondary)" }}>
                                {dayName}
                              </span>
                            </button>
                          );
                        })}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <button onClick={() => goToWeek(1)} aria-label="Semana siguiente"
                    className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                    <ChevronRight size={20} style={{ color: "var(--text-secondary)" }} />
                  </button>
                </div>
              </div>
            )}

            {/* Time Slots - full width cards */}
            <div className="px-4 pt-4 space-y-2">
              {loadingTimes || loadingDates ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                </div>
              ) : timeSlots.length === 0 && !customTimeOpen ? (
                <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {language === "es" ? "No hay horarios disponibles para este día" : "No available times for this day"}
                </p>
              ) : !customTimeOpen ? (
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((slot) => {
                    const isSelectedSlot = selectedTime === slot.time;
                    const bColor = selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)";
                    return (
                      <button key={slot.time}
                        onClick={() => {
                          // Just select the time — user must tap Single or Recurring to advance
                          setSelectedTime(slot.time);
                        }}
                        className="py-3 rounded-xl text-[14px] font-semibold text-center active:scale-[0.96]"
                        style={{
                          border: isSelectedSlot ? `1.5px solid ${bColor}` : "1.5px solid var(--border)",
                          background: isSelectedSlot ? `${bColor}15` : "transparent",
                          color: "var(--text-primary)",
                        }}>
                        {format(new Date(slot.time), "h:mm a")}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* Custom Time */}
              {!loadingTimes && !loadingDates && (
                <AnimatePresence mode="wait">
                  {!customTimeOpen ? (
                    <motion.button
                      key="custom-btn"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setCustomTimeOpen(true)}
                      className="w-full mt-3 py-3 rounded-xl text-[14px] font-semibold text-center flex items-center justify-center gap-2 transition-all active:scale-[0.96]"
                      style={{ border: "1.5px dashed var(--border)", color: "var(--text-secondary)" }}>
                      <Clock size={14} />
                      <span>{language === "es" ? "Hora personalizada" : "Custom Time"}</span>
                    </motion.button>
                  ) : (
                    <motion.div
                      key="custom-picker"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="mt-3 rounded-2xl p-4"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                          {language === "es" ? "Hora personalizada" : "Custom Time"}
                        </p>
                        <button onClick={() => setCustomTimeOpen(false)}
                          className="p-1 rounded-full" style={{ color: "var(--text-tertiary)" }}>
                          <X size={16} />
                        </button>
                      </div>
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <select
                          value={customHour}
                          onChange={(e) => setCustomHour(Number(e.target.value))}
                          className="text-[14px] font-semibold text-center rounded-xl py-2.5 px-3 appearance-none"
                          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)", width: 72 }}>
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{String(i % 12 || 12).padStart(2, "0")}</option>
                          ))}
                        </select>
                        <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>:</span>
                        <select
                          value={customMinute}
                          onChange={(e) => setCustomMinute(Number(e.target.value))}
                          className="text-[14px] font-semibold text-center rounded-xl py-2.5 px-3 appearance-none"
                          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)", width: 72 }}>
                          {[0, 15, 30, 45].map((m) => (
                            <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                          ))}
                        </select>
                        <span className="text-sm font-semibold ml-1" style={{ color: "var(--text-secondary)" }}>
                          {customHour < 12 ? "AM" : "PM"}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const dt = buildCustomDatetime(selectedDate, customHour, customMinute, shopTz);
                          setSelectedTime(dt);
                          setCustomTimeOpen(false);
                          // Stay on time step so user can choose Single vs Recurring (same as preset slots)
                        }}
                        className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.97]"
                        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
                        {language === "es" ? "Confirmar hora" : "Confirm Time"} - {customHour % 12 || 12}:{String(customMinute).padStart(2, "0")} {customHour < 12 ? "AM" : "PM"}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}

              {/* ─── Single vs Recurring (admin/barber only — this whole route is admin) ─── */}
              {!loadingTimes && !loadingDates && (
                <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "Tipo de cita" : "Appointment type"}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        // If custom-time picker is open, confirm it first
                        let timeToUse = selectedTime;
                        if (customTimeOpen) {
                          timeToUse = buildCustomDatetime(selectedDate, customHour, customMinute, shopTz);
                          setSelectedTime(timeToUse);
                          setCustomTimeOpen(false);
                        }
                        if (!timeToUse) {
                          toast.info(language === "es" ? "Elige una hora primero" : "Pick a time first");
                          return;
                        }
                        setRecurrencePattern(null);
                        setStep("summary");
                        if (!hasClient) setClientExpanded(true);
                      }}
                      className="py-3 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
                      style={{
                        background: !recurrencePattern && selectedTime ? "var(--bg-surface-2)" : "transparent",
                        border: !recurrencePattern && selectedTime
                          ? `1.5px solid ${selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)"}`
                          : "1.5px solid var(--border)",
                        color: "var(--text-primary)",
                        opacity: selectedTime || customTimeOpen ? 1 : 0.5,
                      }}
                    >
                      <Clock size={13} />
                      {language === "es" ? "Una sola" : "Single"}
                    </button>
                    <button
                      onClick={() => {
                        // If custom-time picker is open, auto-confirm it so the recurrence has an anchor
                        let timeToUse = selectedTime;
                        if (customTimeOpen) {
                          timeToUse = buildCustomDatetime(selectedDate, customHour, customMinute, shopTz);
                          setSelectedTime(timeToUse);
                          setCustomTimeOpen(false);
                        }
                        if (!timeToUse) {
                          toast.info(language === "es" ? "Elige una hora primero" : "Pick a time first");
                          return;
                        }
                        setRecurringPickerOpen(true);
                      }}
                      className="py-3 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
                      style={{
                        background: recurrencePattern ? "var(--bg-surface-2)" : "transparent",
                        border: recurrencePattern
                          ? `1.5px solid ${selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)"}`
                          : "1.5px solid var(--border)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <Repeat size={13} />
                      {language === "es" ? "Recurrente" : "Recurring"}
                    </button>
                  </div>
                  {recurrencePattern && selectedTime && (
                    <button
                      onClick={() => setRecurringPickerOpen(true)}
                      className="w-full mt-2 px-3 py-2.5 rounded-xl flex items-center gap-2 text-left active:scale-[0.98] transition-transform"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
                    >
                      <Repeat size={14} style={{ color: selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {describePattern(new Date(selectedTime), recurrencePattern.id, language as "es" | "en")}
                        </p>
                        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          {recurrencePattern.count} {language === "es" ? `cita${recurrencePattern.count !== 1 ? "s" : ""}` : `appointment${recurrencePattern.count !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                        {language === "es" ? "Editar" : "Edit"}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 4: SUMMARY ═══ */}
        {step === "summary" && (
          <div className="px-4 pt-4 pb-40">
            {/* Receipt card */}
            <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-surface)", border: "0.5px solid var(--border)" }}>
              {/* Barber row */}
              {selectedCalendar && (
                <button onClick={() => setStep("barber")} className="w-full flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid var(--divider)" }}>
                  {selectedCalendar.avatarUrl ? (
                    <img loading="lazy" decoding="async" src={selectedCalendar.avatarUrl} alt={selectedCalendar.name}
                      className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: `${getBarberColor(selectedCalendar.name)}20` }}>
                      <User size={14} style={{ color: getBarberColor(selectedCalendar.name) }} />
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{selectedCalendar.name}</span>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Edit</span>
                </button>
              )}

              {/* Service row */}
              {selectedType && (
                <button onClick={() => setStep("service")} className="w-full px-4 py-3 text-left" style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Scissors size={14} style={{ color: "var(--text-tertiary)" }} />
                      <span className="text-[14px]" style={{ color: "var(--text-primary)" }}>{selectedType.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>${selectedType.price}</span>
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Edit</span>
                    </div>
                  </div>
                  <p className="text-[12px] mt-0.5 ml-6" style={{ color: "var(--text-tertiary)" }}>{selectedType.duration} min</p>
                </button>
              )}

              {/* Selected add-ons */}
              {addons.filter((a) => selectedAddons.includes(a.id)).map((addon) => (
                <div key={addon.id} className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Plus size={12} style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{addon.name}</span>
                  </div>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {parseFloat(addon.price) > 0 ? `+$${addon.price}` : language === "es" ? "Gratis" : "Free"}
                  </span>
                </div>
              ))}

              {/* Date & Time */}
              {selectedTime && (
                <button onClick={() => setStep("datetime")} className="w-full px-4 py-3 flex items-center justify-between"
                  style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex items-center gap-2">
                    <Clock size={14} style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {format(selectedDate, "EEE, d MMM", { locale: dateFnsLocale })} · {format(new Date(selectedTime), "h:mm a")}
                    </span>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>Edit</span>
                </button>
              )}

              {/* Total */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>Total</span>
                  <span className="text-xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Cart Products */}
            {cartProducts.map((cp) => (
              <div key={cp.id} className="rounded-2xl px-4 py-3 mb-2 flex items-center gap-3"
                style={{ background: "var(--bg-surface)", border: "0.5px solid var(--border)" }}>
                {cp.image_url ? (
                  <img loading="lazy" decoding="async" src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/product-images/${cp.image_url}`} alt={cp.name} className="w-9 h-9 rounded-lg object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}>
                    <ShoppingBag size={16} style={{ color: "var(--text-tertiary)" }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{cp.name}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>${(cp.price_cents / 100).toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCartProducts(prev => {
                    const existing = prev.find(p => p.id === cp.id);
                    if (existing && existing.qty > 1) return prev.map(p => p.id === cp.id ? { ...p, qty: p.qty - 1 } : p);
                    return prev.filter(p => p.id !== cp.id);
                  })} className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ border: "1px solid var(--border)" }}>
                    <Minus size={14} style={{ color: "var(--text-secondary)" }} />
                  </button>
                  <span className="text-sm font-bold w-5 text-center" style={{ color: "var(--text-primary)" }}>{cp.qty}</span>
                  <button onClick={() => setCartProducts(prev => prev.map(p => p.id === cp.id ? { ...p, qty: p.qty + 1 } : p))}
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ border: "1px solid var(--border)" }}>
                    <Plus size={14} style={{ color: "var(--text-secondary)" }} />
                  </button>
                </div>
              </div>
            ))}

            {/* Add Service */}
            <button
              onClick={() => setStep("service")}
              className="w-full rounded-2xl p-4 mb-2 flex items-center gap-3 transition-all active:scale-[0.98]"
              style={{ border: "1.5px dashed var(--border)" }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}>
                <Plus size={18} style={{ color: "var(--text-secondary)" }} />
              </div>
              <div className="text-left">
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {language === "es" ? "Agregar Servicio" : "Add Service"}
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {language === "es" ? "Cambiar servicio o add-ons" : "Change service or add-ons"}
                </p>
              </div>
            </button>

            {/* Add Product */}
            <button
              onClick={() => setProductDrawerOpen(true)}
              className="w-full rounded-2xl p-4 mb-4 flex items-center gap-3 transition-all active:scale-[0.98]"
              style={{ border: "1.5px dashed var(--border)" }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}>
                <Plus size={18} style={{ color: "var(--text-secondary)" }} />
              </div>
              <div className="text-left">
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {language === "es" ? "Agregar Producto" : "Add Product"}
                </p>
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {language === "es" ? "Productos del inventario" : "Products from inventory"}
                </p>
              </div>
            </button>

            {/* Client */}
            <div ref={clientSectionRef} className="rounded-2xl overflow-hidden mb-3 scroll-mt-24" style={{ background: "var(--bg-surface)", border: "0.5px solid var(--border)" }}>
              <div className="w-full flex items-center justify-between px-4 py-3">
                <button className="flex items-center gap-2 flex-1 min-w-0" onClick={() => setClientExpanded(!clientExpanded)}>
                  <User size={14} style={{ color: "var(--text-tertiary)" }} />
                  <p className="text-[13px] font-semibold text-left truncate" style={{ color: "var(--text-primary)" }}>
                    {hasClient ? `${clientFirst} ${clientLast}`.trim() : language === "es" ? "Agregar cliente" : "Add client"}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  {hasClient && (
                    <button onClick={openEditClientDrawer} className="p-1.5 rounded-lg active:scale-95 transition-transform" style={{ background: "var(--bg-surface-2)" }}>
                      <Pencil size={13} style={{ color: "var(--text-tertiary)" }} />
                    </button>
                  )}
                  <button onClick={() => setClientExpanded(!clientExpanded)}>
                    {clientExpanded
                      ? <ChevronUp size={16} style={{ color: "var(--text-tertiary)" }} />
                      : <ChevronDown size={16} style={{ color: "var(--text-tertiary)" }} />}
                  </button>
                </div>
              </div>
              {clientExpanded && (
                <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid var(--divider)" }}>
                  {searchingClients && (
                    <div className="flex justify-center py-2">
                      <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent-color)" }} />
                    </div>
                  )}
                  {clientSearchFailed && (
                    <p role="status" className="pt-2 text-xs text-muted-foreground">
                      {language === "es" ? "No se pudieron cargar las sugerencias. Intenta buscar nuevamente." : "Suggestions could not be loaded. Try searching again."}
                    </p>
                  )}
                  {clientResults.length > 0 && (
                    <div className="rounded-lg overflow-hidden mt-2" style={{ background: "var(--bg-surface-2)" }}>
                      <p className="text-xs font-medium px-3 py-1.5" style={{ color: "var(--text-tertiary)" }}>
                        {language === "es" ? "Sugerencias" : "Suggestions"}
                      </p>
                      {clientResults.map((c) => (
                        <Button key={c.id} variant="ghost" onClick={() => selectClient(c)}
                          className="h-auto min-h-11 w-full flex-col items-start gap-0 whitespace-normal rounded-none border-t border-border px-3 py-2.5 text-left">
                          <span className="text-sm font-medium">{c.firstName} {c.lastName}</span>
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                            {[c.email, c.phone].filter(Boolean).join(" · ")}
                          </span>
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="pt-3">
                    <Input value={clientFirst} onChange={(e) => handleClientFieldChange("first", e.target.value)}
                      placeholder={language === "es" ? "Nombre *" : "First Name *"} autoFocus
                      autoComplete="given-name" name="given-name" />
                  </div>
                  <Input value={clientLast} onChange={(e) => handleClientFieldChange("last", e.target.value)}
                    placeholder={language === "es" ? "Apellido" : "Last Name"}
                    autoComplete="family-name" name="family-name" />
                  <Input value={clientPhone} onChange={(e) => handleClientFieldChange("phone", e.target.value)}
                    placeholder={language === "es" ? "Teléfono *" : "Phone *"} type="tel" inputMode="tel"
                    autoComplete="tel" name="tel" required />
                  <Input value={clientEmail} onChange={(e) => handleClientFieldChange("email", e.target.value)}
                    placeholder={language === "es" ? "Email (opcional)" : "Email (optional)"} type="email" inputMode="email"
                    autoComplete="email" name="email" />
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="rounded-2xl overflow-hidden mb-3 px-4 py-3" style={{ background: "var(--bg-surface)", border: "0.5px solid var(--border)" }}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={language === "es" ? "Notas opcionales..." : "Optional notes..."}
                className="bg-transparent border-0 p-0 resize-none min-h-[50px] focus-visible:ring-0 text-[13px]"
                style={{ color: "var(--text-primary)" }} />
            </div>

            {/* Send Confirmation */}
            <div className="rounded-2xl overflow-hidden px-4 py-3 flex items-center justify-between" style={{ background: "var(--bg-surface)", border: "0.5px solid var(--border)" }}>
              <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                {language === "es" ? "Enviar confirmación" : "Send Confirmation"}
              </p>
              <Switch checked={sendConfirmation} onCheckedChange={setSendConfirmation} />
            </div>
          </div>
        )}
      </div>

      {/* ═══ BOTTOM CTA ═══ */}
      {step !== "datetime" || (recurrencePattern && selectedTime) ? (
        step === "datetime" ? (
          <div className="fixed bottom-0 left-0 right-0 p-4 z-30"
            style={{ background: "var(--bg-base)", borderTop: "1px solid var(--divider)" }}>
            <button
              onClick={() => { setStep("summary"); if (!hasClient) setClientExpanded(true); }}
              className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
              <Repeat size={14} />
              {language === "es"
                ? `Continuar con ${recurrencePattern!.count} citas`
                : `Continue with ${recurrencePattern!.count} appointments`}
            </button>
          </div>
        ) : (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-30"
          style={{ background: "var(--bg-base)", borderTop: "1px solid var(--divider)" }}>
          {step === "service" && selectedType && (
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>${total.toFixed(2)}</span>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {1 + selectedAddons.length} {selectedAddons.length > 0 ? (language === "es" ? "items" : "items") : (language === "es" ? "servicio" : "service")} · {selectedType.duration + addons.filter(a => selectedAddons.includes(a.id)).reduce((s, a) => s + (a.duration || 0), 0)} min
                </p>
              </div>
            </div>
          )}
          {step === "summary" && selectedType && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total</span>
              <span className="font-black" style={{ color: "var(--accent-color)", fontFamily: "Montserrat, sans-serif" }}>
                ${total.toFixed(2)}
              </span>
            </div>
          )}
          <button
            onClick={() => {
              if (step === "barber" && selectedCalendar) setStep("service");
              else if (step === "service" && selectedType) setStep(nextAfterService);
              else if (step === "summary") handleSubmit();
            }}
            disabled={
              (step === "barber" && !selectedCalendar) ||
              (step === "service" && !selectedType) ||
              (step === "summary" && (!canSubmit || submitting))
            }
            className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
            style={{
              background:
                (step === "barber" && selectedCalendar) ||
                (step === "service" && selectedType) ||
                (step === "summary" && canSubmit)
                  ? "var(--cta-bg)" : "var(--bg-surface-2)",
              color:
                (step === "barber" && selectedCalendar) ||
                (step === "service" && selectedType) ||
                (step === "summary" && canSubmit)
                  ? "var(--cta-fg)" : "var(--text-tertiary)",
              opacity: submitting ? 0.7 : 1,
            }}>
            {submitting && <Loader2 size={18} className="animate-spin" />}
            {step === "summary"
              ? (isEditMode
                ? (language === "es" ? "Actualizar Cita" : "Update Appointment")
                : (language === "es" ? "Agendar Cita" : "Schedule Appointment"))
              : (language === "es" ? "Continuar" : "Continue")}
          </button>
        </div>
        )
      ) : null}

      {/* Recurring Picker Drawer */}
      {selectedTime && (
        <RecurringPicker
          open={recurringPickerOpen}
          onOpenChange={setRecurringPickerOpen}
          baseDate={new Date(selectedTime)}
          language={language as "es" | "en"}
          accentColor={selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)"}
          availability={
            selectedType && selectedCalendar && selectedCalendar.barberId
              ? {
                  appointmentTypeId: selectedType.id,
                  calendarId: selectedCalendar.id,
                  barberId: selectedCalendar.barberId,
                  durationMinutes: selectedType.duration || 30,
                  acuityProxy,
                }
              : undefined
          }
          onConfirm={(p) => {
            setRecurrencePattern(p);
            setStep("summary");
            if (!hasClient) setClientExpanded(true);
          }}
        />
      )}

      {/* Unified client identity match prompt (partial match only) */}
      <ClientMatchConfirmDialog
        open={!!matchPrompt}
        match={matchPrompt}
        busy={matchChecking || submitting}
        onConfirm={() => {
          if (matchPrompt?.clientId) setSupabaseClientId(matchPrompt.clientId);
          setMatchPrompt(null);
          setMatchAck(true);
          setTimeout(() => { handleSubmit(); }, 0);
        }}
        onKeepSeparate={() => {
          setMatchPrompt(null);
          setMatchAck(true);
          setTimeout(() => { handleSubmit(); }, 0);
        }}
      />

      {/* Recurring bulk-create progress modal */}
      <RecurringProgressModal
        open={progressOpen}
        action={progressAction}
        current={progressCurrent}
        total={progressTotal}
        language={language as "es" | "en"}
        accentColor={selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)"}
      />

      {/* Product Picker Drawer (shared mini-shop) */}
      <Drawer open={productDrawerOpen} onOpenChange={setProductDrawerOpen}>
        <DrawerContent>
          <div className="px-4 py-4 max-h-[80vh] overflow-y-auto">
            <p className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>
              {language === "es" ? "Agregar productos" : "Add products"}
            </p>
            <ProductsStep
              cart={Object.fromEntries(cartProducts.map((p) => [p.id, p.qty])) as ProductCart}
              onChange={(next) => {
                // Merge against latest products list to keep name/price/image
                setCartProducts((prev) => {
                  const byId = new Map(prev.map((p) => [p.id, p]));
                  const merged: CartProduct[] = [];
                  for (const [id, qty] of Object.entries(next)) {
                    if (qty <= 0) continue;
                    const existing = byId.get(id);
                    if (existing) {
                      merged.push({ ...existing, qty });
                    } else {
                      const meta = products.find((p) => p.id === id);
                      if (meta) merged.push({ id, name: meta.name, price_cents: meta.price_cents, image_url: meta.image_url, qty });
                    }
                  }
                  return merged;
                });
              }}
              onContinue={() => setProductDrawerOpen(false)}
              accent={selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)"}
              isEs={language === "es"}
            />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Success Popup */}
      <AnimatePresence>
        {successSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
            onClick={() => { setSuccessSheetOpen(false); navigate(backToCalendar(searchParams)); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] flex flex-col items-center gap-3 px-6 py-7"
              style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)" }}
            >
              {/* Pill badge */}
              <span className="text-[11px] font-semibold tracking-wide uppercase"
                style={{ background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)", borderRadius: 10, padding: "4px 14px" }}>
                {language === "es" ? "Confirmación" : "Confirmation"}
              </span>

              {/* Animated checkmark */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: [0, 1.2, 1], rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, duration: 0.6 }}
                className="my-2"
              >
                <CheckCircle className="icon-bold" size={56} color="#22c55e" />
              </motion.div>

              {/* Title */}
              <motion.p
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="text-[22px] font-black text-center uppercase"
                style={{ color: "#111111", letterSpacing: "-1px" }}
              >
                {isEditMode
                  ? (language === "es" ? "Cita Actualizada" : "Updated")
                  : (language === "es" ? "Agendada" : "Scheduled")}
              </motion.p>

              {/* Subtitle */}
              <p className="text-[13px] text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
                {isEditMode
                  ? (language === "es" ? "Los cambios fueron guardados" : "Changes have been saved")
                  : (language === "es" ? "La cita fue creada exitosamente" : "Appointment created successfully")}
              </p>

              {/* Buttons */}
              <div className="w-full flex flex-col gap-3 mt-3">
                {createdAppointmentId && (
                  <button onClick={() => { setSuccessSheetOpen(false); navigate(`/admin/appointment/${createdAppointmentId}`); }}
                    className="w-full py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
                    style={{ background: "#111111", color: "#ffffff", borderRadius: "var(--radius-control)" }}>
                    {language === "es" ? "Ir a Cobrar" : "Go to Payment"}
                  </button>
                )}
                <button onClick={() => { setSuccessSheetOpen(false); navigate(backToCalendar(searchParams)); }}
                  className="w-full py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
                  style={{ background: "transparent", color: "#111111", borderRadius: "var(--radius-control)", border: "1px solid rgba(0,0,0,0.1)" }}>
                  {language === "es" ? "Volver al Calendario" : "Back to Calendar"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ═══ EDIT CLIENT DRAWER ═══ */}
      <Drawer open={editClientDrawerOpen} onOpenChange={setEditClientDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "Editar cliente" : "Edit client"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                  {language === "es" ? "Nombre" : "First name"}
                </label>
                <Input
                  value={editClientFirstDraft}
                  onChange={(e) => setEditClientFirstDraft(e.target.value)}
                  className="text-sm"
                  style={{ background: "var(--bg-surface-2)", borderColor: "var(--border)" }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                  {language === "es" ? "Apellido" : "Last name"}
                </label>
                <Input
                  value={editClientLastDraft}
                  onChange={(e) => setEditClientLastDraft(e.target.value)}
                  className="text-sm"
                  style={{ background: "var(--bg-surface-2)", borderColor: "var(--border)" }}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Teléfono" : "Phone"}
              </label>
              <Input
                value={editClientPhoneDraft}
                onChange={(e) => setEditClientPhoneDraft(e.target.value)}
                type="tel"
                className="text-sm"
                style={{ background: "var(--bg-surface-2)", borderColor: "var(--border)" }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                Email
              </label>
              <Input
                value={editClientEmailDraft}
                onChange={(e) => setEditClientEmailDraft(e.target.value)}
                type="email"
                className="text-sm"
                style={{ background: "var(--bg-surface-2)", borderColor: "var(--border)" }}
              />
            </div>
            <button
              onClick={saveEditClient}
              disabled={savingClientEdit || !editClientFirstDraft.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              {savingClientEdit ? (
                <Loader2 size={18} className="animate-spin mx-auto" />
              ) : (
                language === "es" ? "Guardar cambios" : "Save changes"
              )}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Conflict exits completely before submission and its success popup. */}
      <StaffOverlapPopup
        open={conflicts.length > 0}
        conflicts={conflicts}
        isEs={language === "es"}
        mayOverride={mayOverride}
        onCancel={() => {
          overlapContinueRef.current = false;
          setConflicts([]);
        }}
        onConfirm={() => {
          if (!mayOverride || overlapContinueRef.current) return;
          overlapContinueRef.current = true;
          setConflicts([]);
        }}
        onExitComplete={() => {
          if (!overlapContinueRef.current) return;
          overlapContinueRef.current = false;
          setConflictAck(true);
          void handleSubmit({ skipConflictCheck: true }).finally(() => setConflictAck(false));
        }}
      />
    </div>
  );
}

/* ─── Summary Row ─── */
function SummaryRow({ label, value, icon, color, onEdit }: {
  label: string; value: string; icon: React.ReactNode; color?: string; onEdit: () => void;
}) {
  return (
    <div className="rounded-xl p-4 card-elevated flex items-center gap-3">
      <span style={{ color: color || "var(--accent-color)" }}>{icon}</span>
      {color && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
      <button onClick={onEdit} className="text-xs font-medium px-2 py-1 rounded-lg"
        style={{ color: "var(--accent-color)", background: "var(--bg-surface-2)" }}>
        Edit
      </button>
    </div>
  );
}

/* ─── Month Grid ─── */
function MonthGrid({ monthDate, selectedDate, availableDates, onSelectDate, onChangeMonth, language }: {
  monthDate: Date; selectedDate: Date; availableDates: string[];
  onSelectDate: (d: Date) => void; onChangeMonth: (d: Date) => void; language: string;
}) {
  const dateFnsLocale = language === "es" ? es : enUS;
  const dayLabels = language === "es" ? ["D", "L", "M", "M", "J", "V", "S"] : ["S", "M", "T", "W", "T", "F", "S"];

  const days = useMemo(() => {
    const start = startOfWeek(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthDate]);

  return (
    <div className="pb-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onChangeMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} className="p-1">
          <ChevronLeft size={18} style={{ color: "var(--text-tertiary)" }} />
        </button>
        <span className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
          {format(monthDate, "MMMM yyyy", { locale: dateFnsLocale })}
        </span>
        <button onClick={() => onChangeMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} className="p-1">
          <ChevronRight size={18} style={{ color: "var(--text-tertiary)" }} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {dayLabels.map((l, i) => (
          <div key={i} className="text-center text-[10px] font-semibold py-1" style={{ color: "var(--text-tertiary)" }}>{l}</div>
        ))}
        {days.map((day, i) => {
          const inMonth = day.getMonth() === monthDate.getMonth();
          const selected = isSameDay(day, selectedDate);
          const todayDay = isToday(day);
          const dateStr = format(day, "yyyy-MM-dd");
          const available = availableDates.length === 0 || availableDates.includes(dateStr);
          return (
            <button key={i} onClick={() => { if (inMonth && available) onSelectDate(day); }}
              className="flex items-center justify-center py-1.5"
              style={{ opacity: inMonth ? (available ? 1 : 0.3) : 0.15 }}>
              <span className="flex items-center justify-center text-xs font-medium rounded-full"
                style={{
                  width: 30, height: 30,
                  background: selected ? "var(--accent-color)" : "transparent",
                  color: selected ? "var(--bg-base)" : todayDay ? "var(--accent-color)" : "var(--text-primary)",
                  border: todayDay && !selected ? "2px solid var(--accent-color)" : "2px solid transparent",
                }}>
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
