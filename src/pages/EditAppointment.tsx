import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { editServiceBalance, readEditItems, resolveEditReplacement, totalEditItems, type AppointmentEditItem } from "../../supabase/functions/_shared/appointmentEditItems";
import { backToCalendar } from "@/lib/navHelpers";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canConfirmStaffOverlap, confirmStaffOverlap } from "@/lib/staffOverlap";
import { SubpageHeader } from "@/components/SubpageHeader";
import { ClientBirthdayField } from "@/components/ClientBirthdayField";
import { useTranslation } from "@/hooks/useTranslation";
import { useBookingRules } from "@/hooks/useBookingRules";
import { toast } from "sonner";
import { format, parseISO, addDays, addMinutes, startOfWeek, isSameDay, isToday, isBefore, startOfDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { es as esLocale, enUS } from "date-fns/locale";
import { getShopTimezone, toAcuityDatetimeInTz } from "@/lib/timezone";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Loader2,
  ShoppingBag,
  FileText,
  Check,
  X,
  Search,
  Clock,
  User,
  Scissors,
  PlusCircle,
  CalendarDays,
  CalendarCheck,
  CreditCard,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { motion, AnimatePresence } from "motion/react";
import RecurringScopeDialog, { type RecurringScope } from "@/components/RecurringScopeDialog";
import RecurringProgressModal, { type ProgressAction } from "@/components/RecurringProgressModal";
import { findMatchingClient, relinkAppointment, type ClientMatch } from "@/lib/clientMatching";
import { ClientMatchConfirmDialog } from "@/components/ClientMatchConfirmDialog";
import { schedulingProxy as acuityProxy, appointmentRef } from "@/lib/scheduling";

/* ─── barber identity colors ─── */
const BARBER_COLORS: Record<string, string> = {
  charlie: "#c9a882",
  pito: "#8aaec9",
  joseph: "#7ab893",
};
function getBarberColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(BARBER_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "var(--accent-color)";
}

/* ─── acuity proxy helper ─── */
const isSyntheticAcuityId = (id: number | null | undefined): boolean =>
  typeof id === "number" && id < 0;

function toAcuityFromStoredIso(storedIso: string, timeSourceIso: string, tz: string): string {
  const dateSource = parseISO(storedIso);
  const timeSource = parseISO(timeSourceIso);
  return toAcuityDatetimeInTz(
    Number(formatInTimeZone(dateSource, tz, "yyyy")),
    Number(formatInTimeZone(dateSource, tz, "M")),
    Number(formatInTimeZone(dateSource, tz, "d")),
    Number(formatInTimeZone(timeSource, tz, "H")),
    Number(formatInTimeZone(timeSource, tz, "m")),
    tz,
  );
}

function sameMinute(a: string, b: string): boolean {
  return Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000);
}

interface AcuityTimeSlot { time: string; slotsAvailable: number; }
interface AcuityType { id: number; name: string; duration: number; price: string; calendarIDs: number[]; category: string; addonIDs: number[]; private?: boolean; }
interface AcuityCalendar { id: number; name: string; }
interface AcuityAddon { id: number; name: string; duration: number; price: string; }

type ModalType = "service" | "addons" | "barber" | "datetime" | "client" | "addServicePicker" | "addServiceFlow" | "addServiceAddons" | null;

/* ─── Summary Row component ─── */
function SummaryRow({
  icon,
  label,
  value,
  subValue,
  onClick,
  colorDot,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  onClick?: () => void;
  colorDot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3.5 rounded-2xl text-left transition-all active:scale-[0.99]"
      style={{
        color: "var(--text-primary)",
        background: "var(--bg-surface)",
        border: "var(--card-border)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "var(--bg-surface-2)" }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-tertiary)" }}>
          {label}
        </p>
        <div className="flex items-center gap-2">
          {colorDot && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorDot }} />}
          <p className="text-[15px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{value}</p>
        </div>
        {subValue && (
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{subValue}</p>
        )}
      </div>
      <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
    </button>
  );
}

export default function EditAppointment() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language } = useTranslation();
  const { isOwner, isBarber } = useAuth();
  const mayOverride = canConfirmStaffOverlap(isOwner, isBarber);
  const { getMinAdvance, maxAdvanceDays } = useBookingRules();
  const dateFnsLocale = language === "es" ? esLocale : enUS;

  // Core data
  const [appt, setAppt] = useState<any>(null);
  const [acuityData, setAcuityData] = useState<any>(null);
  const [barber, setBarber] = useState<any>(null);
  const [allBarbers, setAllBarbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Saved card on the client (for one-tap charge from this screen)
  const [savedCard, setSavedCard] = useState<{ brand: string; last4: string } | null>(null);

  // Acuity reference data
  const [acuityServices, setAcuityServices] = useState<AcuityType[]>([]);
  const [dbServices, setDbServices] = useState<Array<{ id: string; acuity_type_id: number; name: string; duration_minutes: number; price_cents: number; barber_id: string | null; sort_order: number; locally_edited: boolean }>>([]);
  const [acuityCalendars, setAcuityCalendars] = useState<AcuityCalendar[]>([]);
  const [acuityAddons, setAcuityAddons] = useState<AcuityAddon[]>([]);

  // Editable fields (working state)
  const [editService, setEditService] = useState<AcuityType | null>(null);
  // True only after the operator manually re-picks a service in this session.
  // Guards price-drift recompute so simply opening an old appointment never
  // re-prices it to today's Acuity price.
  const [servicePicked, setServicePicked] = useState(false);
  const [editAddonIds, setEditAddonIds] = useState<number[]>([]);
  const [editBarber, setEditBarber] = useState<any>(null);
  const [editCalendar, setEditCalendar] = useState<AcuityCalendar | null>(null);
  const [editStartsAt, setEditStartsAt] = useState<string>("");
  const [editClientFirstName, setEditClientFirstName] = useState("");
  const [editClientLastName, setEditClientLastName] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [notesValue, setNotesValue] = useState("");
  const [editMethodOpen, setEditMethodOpen] = useState(false);
  const [savingMethod, setSavingMethod] = useState(false);
  // Added products/services are always folded into the appointment balance on save.
  // The payment method is chosen later at checkout, not here.

  // Unified client matching: prompt + pending re-link target
  // NOTE: relink target lives in a ref because runSave is called in the same
  // tick as the matcher resolves — React state would still be stale.
  const [matchPrompt, setMatchPrompt] = useState<ClientMatch | null>(null);
  const pendingRelinkRef = useRef<{ clientId: string; syncFields: boolean } | null>(null);
  const [matchChecking, setMatchChecking] = useState(false);

  // Client autocomplete
  const [allClients, setAllClients] = useState<{ id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null }[]>([]);
  const [sendConfirmation, setSendConfirmation] = useState(false);

  // Modal state
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [clientKeyboardOffset, setClientKeyboardOffset] = useState(0);

  // Recurring scope handling
  const [scopeOpen, setScopeOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressAction, setProgressAction] = useState<ProgressAction>("edit");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  // Date/time picker state
  const [pickerDate, setPickerDate] = useState<Date>(new Date());
  const [pickerTime, setPickerTime] = useState<string | null>(null);
  const [pickerSlots, setPickerSlots] = useState<AcuityTimeSlot[]>([]);
  const [pickerLoadingSlots, setPickerLoadingSlots] = useState(false);
  const [pickerCustomOpen, setPickerCustomOpen] = useState(false);
  const [pickerCustomHour, setPickerCustomHour] = useState(9);
  const [pickerCustomMinute, setPickerCustomMinute] = useState(0);
  const [pickerAvailDates, setPickerAvailDates] = useState<string[]>([]);
  const [pickerLoadingDates, setPickerLoadingDates] = useState(false);
  const [pickerWeekStart, setPickerWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [pickerSwipeDir, setPickerSwipeDir] = useState<1 | -1>(1);
  const [pickerMonthOpen, setPickerMonthOpen] = useState(false);
  const [pickerMonthDate, setPickerMonthDate] = useState(new Date());
  const pickerTouchRef = useRef<{ startX: number }>({ startX: 0 });

  const pickerWeekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(pickerWeekStart, i)), [pickerWeekStart]);

  useEffect(() => {
    if (activeModal !== "client") {
      setClientKeyboardOffset(0);
      return;
    }
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateOffset = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setClientKeyboardOffset(offset > 80 ? Math.round(offset) : 0);
    };
    updateOffset();
    viewport.addEventListener("resize", updateOffset);
    viewport.addEventListener("scroll", updateOffset);
    return () => {
      viewport.removeEventListener("resize", updateOffset);
      viewport.removeEventListener("scroll", updateOffset);
    };
  }, [activeModal]);

  // Service-aware booking rules
  const minAdvanceMinutes = useMemo(() => getMinAdvance(editService?.id ?? null), [getMinAdvance, editService]);
  const pickerMinDate = useMemo(() => addMinutes(new Date(), minAdvanceMinutes), [minAdvanceMinutes]);
  const pickerMaxDate = useMemo(() => addDays(new Date(), maxAdvanceDays), [maxAdvanceDays]);
  const isPickerDateAllowed = useCallback((day: Date) => {
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59);
    return dayEnd >= startOfDay(pickerMinDate) && day <= pickerMaxDate;
  }, [pickerMinDate, pickerMaxDate]);

  const pickerGoToWeek = useCallback((dir: -1 | 1) => {
    setPickerSwipeDir(dir);
    setPickerWeekStart((prev) => addDays(prev, dir * 7));
  }, []);

  const pickerGoToDate = useCallback((date: Date) => {
    setPickerDate(date);
    setPickerWeekStart(startOfWeek(date, { weekStartsOn: 0 }));
  }, []);

  // Product picker
  const [products, setProducts] = useState<any[]>([]);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  // Products added in this edit session (persisted on Save)
  const [addedProducts, setAddedProducts] = useState<{ id: string; name: string; price_cents: number; image_url: string | null; stock_count: number; quantity: number }[]>([]);

  // Add service picker (asks which barber's list)
  const [addServiceCalendar, setAddServiceCalendar] = useState<AcuityCalendar | null>(null);

  // Added service & add-ons (separate from the main service row)
  const [addedService, setAddedService] = useState<AcuityType | null>(null);
  const [addedAddonIds, setAddedAddonIds] = useState<number[]>([]);

  // Find calendar for a barber (by stable Acuity calendar ID)
  const findCalendarForBarber = useCallback((b: any): AcuityCalendar | null => {
    if (!b?.acuity_calendar_id) return null;
    return acuityCalendars.find((c) => c.id === b.acuity_calendar_id) || null;
  }, [acuityCalendars]);

  // Services filtered by the active calendar context (addServiceCalendar overrides editCalendar)
  // Merges Acuity-driven services with local DB-only services, applies admin local edits, and sorts by sort_order.
  const barberServices = useMemo(() => {
    const cal = addServiceCalendar || editCalendar;
    // Filter Acuity types by calendar; if filter returns nothing (some calendars have no
    // explicitly-assigned types), fall back to ALL Acuity types so barbers can still pick.
    let baseAcuity = cal ? acuityServices.filter((t) => t.calendarIDs?.includes(cal.id)) : acuityServices;
    if (cal && baseAcuity.length === 0) baseAcuity = acuityServices;
    const activeBarberId = (addServiceCalendar
      ? allBarbers.find((b: any) => findCalendarForBarber(b)?.id === addServiceCalendar.id)?.id
      : (editBarber?.id || barber?.id)) as string | undefined;
    if (!activeBarberId) return baseAcuity;

    // Build override map for this barber
    const overrides = new Map<number, typeof dbServices[number]>();
    for (const ds of dbServices) {
      if (ds.barber_id === activeBarberId) overrides.set(ds.acuity_type_id, ds);
    }

    const acuityIds = new Set(baseAcuity.map((s) => s.id));
    const merged: Array<AcuityType & { _sortOrder: number }> = baseAcuity.map((s) => {
      const ov = overrides.get(s.id);
      const useLocal = ov?.locally_edited;
      return {
        ...s,
        name: useLocal && ov ? ov.name : s.name,
        duration: useLocal && ov ? ov.duration_minutes : s.duration,
        price: useLocal && ov ? (ov.price_cents / 100).toFixed(2) : s.price,
        _sortOrder: ov?.sort_order ?? 999999,
      };
    });

    const localExtras = dbServices
      .filter((s) => s.barber_id === activeBarberId && !acuityIds.has(s.acuity_type_id))
      .map((s) => ({
        id: s.acuity_type_id,
        name: s.name,
        duration: s.duration_minutes,
        price: (s.price_cents / 100).toFixed(2),
        calendarIDs: cal ? [cal.id] : [],
        category: "Local",
        addonIDs: [],
        _sortOrder: s.sort_order ?? 999999,
      } as AcuityType & { _sortOrder: number }));
    merged.push(...localExtras);

    merged.sort((a, b) => (a._sortOrder - b._sortOrder) || a.name.localeCompare(b.name));
    return merged;
  }, [editCalendar, addServiceCalendar, acuityServices, dbServices, allBarbers, editBarber, barber, findCalendarForBarber]);

  // Addons filtered by current edit service
  const serviceAddons = useMemo(() => {
    if (!editService?.addonIDs?.length) return [];
    return acuityAddons.filter((a) => editService.addonIDs.includes(a.id));
  }, [editService, acuityAddons]);

  // Addons filtered by added service (for the add-service flow)
  const addedServiceAddons = useMemo(() => {
    if (!addedService?.addonIDs?.length) return [];
    return acuityAddons.filter((a) => addedService.addonIDs.includes(a.id));
  }, [addedService, acuityAddons]);

  // Addon display names
  const editAddonNames = useMemo(() => {
    return acuityAddons
      .filter((a) => editAddonIds.includes(a.id))
      .map((a) => a.name);
  }, [editAddonIds, acuityAddons]);

  // Added addon display names
  const addedAddonNames = useMemo(() => {
    return acuityAddons
      .filter((a) => addedAddonIds.includes(a.id))
      .map((a) => a.name);
  }, [addedAddonIds, acuityAddons]);

  const originalAddonIds = useMemo(
    () => {
      const saved = readEditItems(appt?.edit_line_items);
      return saved ? saved.filter((i) => i.kind === "addon").map((i) => Number(i.id)).sort()
        : Array.isArray(acuityData?.addonIDs) ? [...acuityData.addonIDs].sort() : [];
    },
    [appt?.edit_line_items, acuityData?.addonIDs]
  );
  const currentAddonIds = useMemo(() => [...editAddonIds].sort(), [editAddonIds]);
  const mainServiceChanged = !!(editService && appt && editService.id !== appt.service_id);
  const mainAddonsChanged =
    originalAddonIds.length !== currentAddonIds.length ||
    originalAddonIds.some((v, i) => v !== currentAddonIds[i]);
  const selectedMainServiceCents = editService ? Math.round(parseFloat(String(editService.price || "0")) * 100) : 0;
  const selectedMainAddonCents = acuityAddons
    .filter((a) => editAddonIds.includes(a.id))
    .reduce((sum, a) => sum + Math.round(parseFloat(a.price) * 100), 0);
  const originalMainServiceCents = readEditItems(appt?.edit_line_items)?.find((i) => i.kind === "service")?.price_cents
    ?? Math.round(parseFloat(String(!mainServiceChanged ? editService?.price : acuityServices.find((s) => s.id === appt?.service_id)?.price ?? 0)) * 100);
  const toItem = (value: AcuityType | AcuityAddon, kind: AppointmentEditItem["kind"]): AppointmentEditItem => ({
    kind, id: value.id, name: value.name,
    price_cents: Math.round(Number(value.price) * 100),
    duration_minutes: Number(value.duration), quantity: 1,
  });
  const resolveSavedItems = (target: any): AppointmentEditItem[] | null => {
    const snapshot = readEditItems(target.edit_line_items);
    if (snapshot) return snapshot;
    const service = acuityServices.find((s) => s.id === target.service_id);
    if (!service) return null;
    const items = [toItem(service, "service")];
    for (const name of target.addons || []) {
      const addon = acuityAddons.find((a) => a.name === name);
      const extra = acuityServices.find((a) => a.name === name);
      if (addon) items.push(toItem(addon, "addon"));
      else if (extra) items.push(toItem(extra, "extra_service"));
      else return null;
    }
    // Never invent a residual amount, erase a discount, or reprice an old booking.
    return totalEditItems(items).priceCents === target.price_cents ? items : null;
  };
  const mainServicePriceChanged = servicePicked && !!editService && selectedMainServiceCents !== originalMainServiceCents;
  const compositionChanged = servicePicked || mainServiceChanged || mainAddonsChanged || mainServicePriceChanged || !!addedService;
  const itemsForTarget = (target: any, primary: boolean): AppointmentEditItem[] | null => {
    const saved = resolveSavedItems(target);
    if (!editService) return null;
    let items = saved;
    if (servicePicked || mainServiceChanged || mainAddonsChanged || mainServicePriceChanged) {
      const main = mainServiceChanged || servicePicked || !saved ? toItem(editService, "service") : saved.find((i) => i.kind === "service");
      if (!main) return null;
      if (editAddonIds.some((id) => !acuityAddons.some((a) => a.id === id))) return null;
      const addons = acuityAddons.filter((a) => editAddonIds.includes(a.id)).map((a) =>
        !mainServiceChanged && !servicePicked ? saved?.find((i) => i.kind === "addon" && i.id === a.id) || toItem(a, "addon") : toItem(a, "addon"));
      items = resolveEditReplacement(saved, main, addons, true);
    }
    if (!items) return null;
    if (primary && addedService) {
      if (addedAddonIds.some((id) => !acuityAddons.some((a) => a.id === id))) return null;
      items = [...items, toItem(addedService, "extra_service"),
        ...acuityAddons.filter((a) => addedAddonIds.includes(a.id)).map((a) => toItem(a, "extra_addon"))];
    }
    return items;
  };
  const workingItems = appt ? itemsForTarget(appt, true) : null;
  const workingTotals = workingItems ? totalEditItems(workingItems) : null;
  const serviceTotalCents = compositionChanged && workingTotals ? workingTotals.priceCents : (appt?.price_cents ?? 0);
  const totalDurationMinutes = compositionChanged && workingTotals ? workingTotals.durationMinutes : (appt?.duration_minutes ?? 0);


  const addedProductsCents = useMemo(
    () => addedProducts.reduce((sum, p) => sum + p.price_cents * p.quantity, 0),
    [addedProducts]
  );

  // Display total (used for outstanding balance shown to user) — includes products.
  const totalPriceCents = serviceTotalCents + addedProductsCents;

  // Outstanding balance — respects payments already collected on this appointment
  const amountPaidCents = Math.max(0, (appt?.amount_paid_cents ?? 0) - (appt?.tip_cents ?? 0));
  const balanceCents = Math.max(0, totalPriceCents - amountPaidCents);

  // True when local state has price-affecting changes not yet persisted to the DB.
  // Used by the "Cobrar" CTA to auto-save (folding products into balance) before navigating to checkout,
  // otherwise the checkout would read stale appointments.price_cents and undercharge.
  const hasPendingPriceChanges = !!appt && (
    compositionChanged || totalPriceCents !== (appt.price_cents ?? 0) || addedProducts.length > 0
  );

  // Flag set when user pressed "Guardar y Cobrar" — runSave will navigate to checkout instead of detail.
  const cobrarAfterSaveRef = useRef(false);

  // Client autocomplete suggestions — match name, phone, or email
  const clientSuggestions = useMemo(() => {
    const fnQ = (editClientFirstName || "").toLowerCase().trim();
    const lnQ = (editClientLastName || "").toLowerCase().trim();
    const phQ = (editClientPhone || "").replace(/\D/g, "");
    const emQ = (editClientEmail || "").toLowerCase().trim();
    const nameTokens = [fnQ, lnQ].filter((t) => t.length >= 1);
    const hasName = nameTokens.length > 0;
    const hasPhone = phQ.length >= 3;
    const hasEmail = emQ.length >= 2;
    if (!hasName && !hasPhone && !hasEmail) return [];
    return allClients.filter((c) => {
      const fn = (c.first_name || "").toLowerCase();
      const ln = (c.last_name || "").toLowerCase();
      const full = `${fn} ${ln}`.trim();
      const ph = (c.phone || "").replace(/\D/g, "");
      const em = (c.email || "").toLowerCase();
      if (hasName && nameTokens.every((t) => fn.includes(t) || ln.includes(t) || full.includes(t))) return true;
      if (hasPhone && ph.includes(phQ)) return true;
      if (hasEmail && em.includes(emQ)) return true;
      return false;
    }).slice(0, 6);
  }, [editClientFirstName, editClientLastName, editClientPhone, editClientEmail, allClients]);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const [apptRes, barbersRes, prodsRes, clientsRes] = await Promise.all([
        supabase.from("appointments").select("*").eq("id", id).maybeSingle(),
        supabase.from("barbers_public").select("id, name, color, is_active, acuity_calendar_id").eq("is_active", true).order("name"),
        supabase.from("products").select("id, name, price_cents, image_url, stock_count").eq("is_active", true).gt("stock_count", 0).order("name"),
        (supabase.rpc as any)("get_clients_barber_safe"),
      ]);
      if (clientsRes.data) setAllClients(clientsRes.data as any);

      if (!apptRes.data) {
        toast.error(language === "es" ? "Cita no encontrada" : "Appointment not found");
        navigate(backToCalendar(searchParams));
        return;
      }

      const a = apptRes.data;
      setAppt(a);
      setNotesValue(a.notes || "");
      const nameParts = (a.client_name || "").split(" ");
      setEditClientFirstName(nameParts[0] || "");
      setEditClientLastName(nameParts.slice(1).join(" ") || "");
      setEditClientPhone(a.client_phone || "");
      setEditClientEmail(a.client_email || "");
      setEditStartsAt(a.starts_at || "");

      if (barbersRes.data) setAllBarbers(barbersRes.data);
      if (prodsRes.data) setProducts(prodsRes.data);

      const b = barbersRes.data?.find((x: any) => x.id === a.barber_id);
      if (b) {
        setBarber(b);
        setEditBarber(b);
      }

      // Load Acuity data + local DB services
      try {
        const [acuity, typesData, calsData, addonsData, dbSvcRes] = await Promise.all([
          acuityProxy(`/appointments/${appointmentRef(a, false)}`),
          acuityProxy("/appointment-types"),
          acuityProxy("/calendars"),
          acuityProxy("/appointment-addons"),
          supabase.from("services").select("id, acuity_type_id, name, duration_minutes, price_cents, barber_id, sort_order, locally_edited").eq("is_active", true),
        ]);
        setAcuityData(acuity);
        if (Array.isArray(typesData)) setAcuityServices(typesData);
        if (dbSvcRes.data) setDbServices(dbSvcRes.data as any);
        if (Array.isArray(calsData)) {
          setAcuityCalendars(calsData);
          // Set initial calendar
          const cal = calsData.find((c: AcuityCalendar) => c.id === acuity?.calendarID);
          if (cal) setEditCalendar(cal);
        }
        if (Array.isArray(addonsData)) setAcuityAddons(addonsData.filter((ad: AcuityAddon) => ad.name.trim().length > 0));

        // Pre-select service (Acuity first; otherwise fall back to local DB service by service_id)
        if (Array.isArray(typesData)) {
          let svc: AcuityType | undefined = typesData.find((t: AcuityType) => t.id === a.service_id)
            || typesData.find((t: AcuityType) => t.id === acuity?.appointmentTypeID);
          if (!svc && dbSvcRes.data) {
            const local = (dbSvcRes.data as any[]).find((s) => s.acuity_type_id === a.service_id);
            if (local) {
              svc = {
                id: local.acuity_type_id,
                name: local.name,
                duration: local.duration_minutes,
                price: (local.price_cents / 100).toFixed(2),
                calendarIDs: [],
                category: "Local",
                addonIDs: [],
              } as AcuityType;
            }
          }
          const snapshotMain = readEditItems(a.edit_line_items)?.find((i) => i.kind === "service");
          if (svc) setEditService(snapshotMain ? { ...svc, price: (snapshotMain.price_cents / 100).toFixed(2), duration: snapshotMain.duration_minutes } : svc);
        }

        // Pre-select addons
        const savedItems = readEditItems(a.edit_line_items);
        if (savedItems) {
          setEditAddonIds(savedItems.filter((i) => i.kind === "addon").map((i) => Number(i.id)));
        } else if (acuity?.addonIDs?.length) {
          setEditAddonIds(acuity.addonIDs);
        }
      } catch (err) {
        console.error("[EditAppointment] Acuity load failed:", err);
      }

      setLoading(false);
    };
    load();
  }, [id]);

  // Fetch saved card for this appointment's client (used by the "Cobrar" CTA)
  useEffect(() => {
    const cid = appt?.client_id;
    if (!cid) { setSavedCard(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await (supabase.rpc as any)("get_client_payment_details", { _client_id: cid });
      const row = (data as any[])?.[0];
      if (cancelled) return;
      if (row?.card_brand && row?.card_last4) {
        setSavedCard({ brand: row.card_brand, last4: row.card_last4 });
      } else {
        setSavedCard(null);
      }
    })().catch(() => { if (!cancelled) setSavedCard(null); });
    return () => { cancelled = true; };
  }, [appt?.client_id]);

  // Load available dates: BOTH selected date's month AND the month being browsed in the picker.
  const editMonthsKey = useMemo(() => {
    const set = new Set<string>();
    set.add(format(pickerDate, "yyyy-MM"));
    if (pickerMonthDate) set.add(format(pickerMonthDate, "yyyy-MM"));
    return Array.from(set).sort().join("|");
  }, [pickerDate, pickerMonthDate]);

  useEffect(() => {
    if (activeModal !== "datetime" || !editService || !editCalendar) return;
    setPickerLoadingDates(true);
    const months = editMonthsKey.split("|").filter(Boolean);
    Promise.all(
      months.map((month) =>
        acuityProxy(`/availability/dates?appointmentTypeID=${editService.id}&calendarID=${editCalendar.id}&month=${month}`)
          .then((data) => (Array.isArray(data) ? data.map((d: any) => d.date as string) : []))
          .catch(() => [] as string[]),
      ),
    )
      .then((lists) => setPickerAvailDates(Array.from(new Set(lists.flat()))))
      .finally(() => setPickerLoadingDates(false));
  }, [activeModal, editService, editCalendar, editMonthsKey]);

  // Load time slots when datetime modal date changes
  useEffect(() => {
    if (activeModal !== "datetime" || !editService || !editCalendar) return;
    setPickerLoadingSlots(true);
    setPickerTime(null);
    setPickerCustomOpen(false);
    const dateStr = format(pickerDate, "yyyy-MM-dd");
    acuityProxy(
      `/availability/times?appointmentTypeID=${editService.id}&calendarID=${editCalendar.id}&date=${dateStr}`
    )
      .then((data) => {
        const raw: AcuityTimeSlot[] = Array.isArray(data) ? data : [];
        const cutoff = addMinutes(new Date(), minAdvanceMinutes).getTime();
        setPickerSlots(raw.filter((s) => new Date(s.time).getTime() >= cutoff));
      })
      .catch(() => setPickerSlots([]))
      .finally(() => setPickerLoadingSlots(false));
  }, [activeModal, pickerDate, editService, editCalendar, minAdvanceMinutes]);

  // Continues the existing save flow after the identity-match check has been resolved.
  // Added products/services are ALWAYS folded into the appointment balance here —
  // the payment method is chosen later at checkout time, not while editing.
  const proceedAfterMatch = async () => {
    if (!appt) return;
    if (cobrarAfterSaveRef.current) {
      await runSave("this_only", "balance");
      return;
    }
    if (appt.recurring_group_id) { setScopeOpen(true); return; }
    await runSave("this_only", "balance");
  };

  // Cobrar handler — auto-saves pending additions (products/added service) before navigating,
  // so the checkout sees the updated appointments.price_cents and never undercharges.
  const handleCobrar = async () => {
    if (!appt) return;
    if (!hasPendingPriceChanges) {
      navigate(`/admin?tab=checkout&checkout=appointment&apptId=${appt.id}`);
      return;
    }
    cobrarAfterSaveRef.current = true;
    try {
      await saveChanges();
    } catch {
      cobrarAfterSaveRef.current = false;
      toast.error(language === "es"
        ? "No se pudo guardar antes de cobrar. Intenta de nuevo."
        : "Could not save before charging. Try again.");
    }
  };



  // Entry point: identity-match check → recurring scope → product method → save
  const saveChanges = async () => {
    if (!appt || saving) return;

    // Pre-flight: if client identity changed, run the unified matcher.
    const editClientFullName = [editClientFirstName, editClientLastName].filter(Boolean).join(" ");
    const nameChanged = editClientFullName !== (appt.client_name || "");
    const phoneChanged = (editClientPhone || "") !== (appt.client_phone || "");
    const emailChanged = (editClientEmail || "") !== (appt.client_email || "");
    if (nameChanged || phoneChanged || emailChanged) {
      setMatchChecking(true);
      try {
        const match = await findMatchingClient(editClientPhone, editClientEmail);
        if (match.clientId && match.clientId !== appt.client_id) {
          if (match.matchType === "both") {
            // Silent auto-allocate.
            pendingRelinkRef.current = { clientId: match.clientId, syncFields: true };
          } else {
            // Partial match → ask before saving.
            setMatchPrompt(match);
            return;
          }
        }
      } finally {
        setMatchChecking(false);
      }
    }

    await proceedAfterMatch();
  };

  // Actual mutation. Loops over targets when scope === "all_future".
  // productPaymentMethod is used only when addedProducts.length > 0.
  const runSave = async (scope: RecurringScope, productPaymentMethod: "cash" | "stripe" | "ath_movil" | "paypal" | "balance" = "cash") => {
    if (!appt || saving) return;
    if (compositionChanged && !workingItems) {
      toast.error(language === "es" ? "Selecciona el servicio y los complementos completos antes de guardar." : "Select the complete service and add-ons before saving.");
      cobrarAfterSaveRef.current = false;
      return;
    }
    setSaving(true);

    // Determine which fields are being changed
    const editClientFullName = [editClientFirstName, editClientLastName].filter(Boolean).join(" ");
    const serviceChanged = mainServiceChanged;
    // Same-service price drift (e.g. Acuity price bumped after booking). Treated like a change
    // so per-target price recomputes below.
    const servicePriceChanged = !!(servicePicked && editService && selectedMainServiceCents !== originalMainServiceCents);

    // Composition is stored locally; only contact/notes and rescheduling go to Acuity.
    const currentAddonIds: number[] = [...editAddonIds].sort();
    const addonsChanged =
      originalAddonIds.length !== currentAddonIds.length ||
      originalAddonIds.some((v, i) => v !== currentAddonIds[i]);
    const clientChanged = editClientFullName !== appt.client_name || editClientPhone !== appt.client_phone || editClientEmail !== appt.client_email;
    const timeChanged = editStartsAt !== appt.starts_at;
    const calendarChanged = editCalendar?.id !== acuityData?.calendarID;
    const notesChanged = notesValue !== (appt.notes || "");
    // Total changed if service swap or added service/addons bumped the service price.
    // Note: added products do NOT change appointments.price_cents — they become their own product_sale transactions.

    // Build target list
    let targets: any[] = [appt];
    if (scope === "all_future" && appt.recurring_group_id) {
      const { data: siblings } = await supabase
        .from("appointments")
        .select("*")
        .eq("recurring_group_id", appt.recurring_group_id)
        .gte("starts_at", appt.starts_at)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true });
      if (siblings && siblings.length) targets = siblings;
    }

    // Show progress modal for bulk ops
    if (targets.length > 1) {
      setProgressAction(timeChanged || calendarChanged ? "reschedule" : "edit");
      setProgressTotal(targets.length);
      setProgressCurrent(0);
      setProgressOpen(true);
    }

    let okCount = 0;
    let errCount = 0;

    // Suppress change notifications on bulk recurring edits to avoid spamming the client
    const isBulkRecurring = targets.length > 1;

    try {
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        try {
          const isPrimary = target.id === appt.id;
          const targetCompositionChanged = servicePicked || serviceChanged || addonsChanged || servicePriceChanged || (isPrimary && !!addedService);
          let targetItems = itemsForTarget(target, isPrimary);
          if (targetCompositionChanged && !targetItems) throw new Error(language === "es" ? "No se pudo verificar el desglose de esta cita." : "Could not verify this appointment's itemized total.");
          const productsAddToBalance = isPrimary && addedProducts.length > 0 && productPaymentMethod === "balance";
          if (productsAddToBalance) {
            if (!targetItems) throw new Error(language === "es" ? "Verifica el desglose antes de añadir productos." : "Verify the itemized total before adding products.");
            targetItems = [...targetItems, ...addedProducts.map((p): AppointmentEditItem => ({ kind: "product", id: p.id, name: p.name, price_cents: p.price_cents, duration_minutes: 0, quantity: p.quantity }))];
          }
          const totals = targetItems ? totalEditItems(targetItems) : null;
          const finalPriceCents = targetCompositionChanged || productsAddToBalance ? totals?.priceCents : target.price_cents;
          const finalDuration = targetCompositionChanged ? totals?.durationMinutes : target.duration_minutes;
          if (finalPriceCents == null || !finalDuration || finalDuration < 1) throw new Error("Invalid appointment total or duration");
          const proposedStart = isPrimary ? editStartsAt : (timeChanged ? toAcuityFromStoredIso(target.starts_at, editStartsAt, await getShopTimezone()) : target.starts_at);
          const proposedEnd = new Date(new Date(proposedStart).getTime() + finalDuration * 60000).toISOString();
          let overlapAuthorized = false;
          if (targetCompositionChanged || timeChanged || calendarChanged) {
            const [conflicts, blocks] = await Promise.all([
              supabase.from("appointments").select("id").eq("barber_id", editBarber?.id || target.barber_id).neq("id", target.id).not("status", "in", "(cancelled,no_show)").lt("starts_at", proposedEnd).gt("ends_at", proposedStart),
              supabase.from("block_times").select("id").eq("barber_id", editBarber?.id || target.barber_id).lt("starts_at", proposedEnd).gt("ends_at", proposedStart),
            ]);
            if (conflicts.error) throw conflicts.error;
            if (blocks.error) throw blocks.error;
            if (blocks.data?.length) throw new Error(language === "es" ? "La duración completa choca con un bloqueo. Selecciona otro horario." : "The full duration overlaps a block. Choose another time.");
            if (conflicts.data?.length) {
              overlapAuthorized = await confirmStaffOverlap(mayOverride, () => window.confirm(
                language === "es"
                  ? "Este barbero ya tiene una cita durante la duración completa. ¿Guardar igual? Ambas citas se verán en el mismo horario."
                  : "This barber already has an appointment during the full duration. Save anyway? Both appointments will appear in the same slot."
              ), target.acuity_id, "Staff confirmed book anyway (edit full duration)");
              if (!overlapAuthorized) {
                cobrarAfterSaveRef.current = false;
                if (!isBulkRecurring) return;
                errCount++;
                setProgressCurrent(i + 1);
                continue;
              }
            }
          }
          // Acuity only accepts contact/notes edits here, not service, price or duration.
          const acuityBody: any = { admin: true };
          if (clientChanged) {
            acuityBody.firstName = editClientFirstName;
            acuityBody.lastName = editClientLastName;
            acuityBody.phone = editClientPhone;
            acuityBody.email = editClientEmail;
          }
          if (notesChanged) acuityBody.notes = notesValue;
          if (isBulkRecurring) acuityBody.noEmail = true;
          if (Object.keys(acuityBody).length > 1) {
            await acuityProxy(`/appointments/${appointmentRef(target, false)}`, "PUT", acuityBody);
          }

          // Reschedule (compute the matching datetime per occurrence so siblings keep their date and just shift time-of-day if changed)
          let newStartsAt = target.starts_at;
          let newEndsAt = target.ends_at;
          if (timeChanged || calendarChanged) {
            const tz = await getShopTimezone();
            const perTargetDatetime = target.id === appt.id
              ? toAcuityFromStoredIso(editStartsAt, editStartsAt, tz)
              : toAcuityFromStoredIso(target.starts_at, timeChanged ? editStartsAt : target.starts_at, tz);
            const rescheduleBody: any = { datetime: perTargetDatetime, admin: true };
            if (editCalendar) rescheduleBody.calendarID = editCalendar.id;
            if (!sendConfirmation || isBulkRecurring) rescheduleBody.noEmail = true;
            try {
              const availabilityDate = formatInTimeZone(parseISO(perTargetDatetime), tz, "yyyy-MM-dd");
              const availability = await acuityProxy(
                `/availability/times?appointmentTypeID=${editService?.id}&calendarID=${(editCalendar || acuityData)?.calendarID || editCalendar?.id}&date=${availabilityDate}`
              );
              const targetIsOriginalSlot = !calendarChanged && sameMinute(target.starts_at, perTargetDatetime);
              const slotAvailable = Array.isArray(availability)
                && availability.some((slot: AcuityTimeSlot) => sameMinute(slot.time, perTargetDatetime));
              if (!targetIsOriginalSlot && !slotAvailable && !overlapAuthorized) {
                // Staff override: single edits may book over a conflict after explicit confirmation.
                const bookAnyway = await confirmStaffOverlap(mayOverride && !isBulkRecurring, () => window.confirm(
                  language === "es"
                    ? "Este horario choca con otra cita. ¿Reservar igual? Ambas citas se verán en el mismo horario."
                    : "This time overlaps another appointment. Book anyway? Both will show in the same slot."
                ), target.acuity_id, "Staff confirmed book anyway (edit)");
                if (!bookAnyway) {
                  cobrarAfterSaveRef.current = false;
                  if (!isBulkRecurring) return;
                  errCount++;
                  setProgressCurrent(i + 1);
                  continue;
                }
              }
              const result = await acuityProxy(`/appointments/${appointmentRef(target, false)}/reschedule`, "PUT", rescheduleBody);
              const durationMs = finalDuration * 60000;
              newStartsAt = result?.datetime || new Date(perTargetDatetime).toISOString();
              newEndsAt = new Date(new Date(newStartsAt).getTime() + durationMs).toISOString();
            } catch (rerr) {
              // Slot conflict or Acuity rejection, skip this occurrence per protocol.
              errCount++;
              setProgressCurrent(i + 1);
              continue;
            }
          }

          newEndsAt = new Date(new Date(newStartsAt).getTime() + finalDuration * 60000).toISOString();
          const finalAddonNames = targetItems
            ? targetItems.filter((i) => i.kind !== "service" && i.kind !== "product").map((i) => i.name)
            : target.addons;
          const newPaid = target.payment_confirmed && editServiceBalance(finalPriceCents, target.amount_paid_cents || 0, target.tip_cents || 0) === 0;

          // Supabase update — per-row so all attached math (transactions, payroll) stays consistent
          const { error: saveError } = await supabase.from("appointments").update({
            client_id: pendingRelinkRef.current?.clientId || target.client_id,
            barber_id: editBarber?.id || target.barber_id,
            service_name: editService?.name || target.service_name,
            service_id: editService?.id || target.service_id,
            duration_minutes: finalDuration,
            edit_line_items: targetItems ? JSON.parse(JSON.stringify(targetItems)) : target.edit_line_items,
            price_cents: finalPriceCents,
            paid: newPaid,
            addons: finalAddonNames,
            starts_at: newStartsAt,
            ends_at: newEndsAt,
            client_name: clientChanged ? editClientFullName : target.client_name,
            client_phone: clientChanged ? editClientPhone : target.client_phone,
            client_email: clientChanged ? editClientEmail : target.client_email,
            notes: notesChanged ? (notesValue || null) : target.notes,
            // Echo-loop guard: marks this row as just-pushed so the Acuity webhook
            // (which fires back with its own price that does NOT include added
            // products/services) cannot clobber price_cents/addons within 30s.
            last_pushed_at: new Date().toISOString(),
          }).eq("id", target.id);
          if (saveError) throw saveError;

          // Create product_sale transactions ONLY for the primary appointment AND when
          // the operator collected payment now (cash / stripe / ath / paypal). When the
          // method is "balance", products were folded into appointments.price_cents above
          // and will be reconciled when the next payment lands.
          if (isPrimary && addedProducts.length > 0 && productPaymentMethod !== "balance") {
            const productBarberId = editBarber?.id || target.barber_id;
            let addedProductsTotalCents = 0;
            for (const p of addedProducts) {
              const lineTotal = p.price_cents * p.quantity;
              const { data: prodTx, error: prodTxErr } = await supabase.from("transactions").insert({
                barber_id: productBarberId,
                appointment_id: target.id,
                type: "product",
                payment_method: productPaymentMethod,
                subtotal_cents: lineTotal,
                tip_cents: 0,
                total_cents: lineTotal,
                status: "completed",
                notes: `Producto añadido en edición de cita - ${p.name}`,
              }).select("id").single();

              if (prodTxErr || !prodTx) {
                console.error("Failed to insert product transaction:", prodTxErr);
                continue;
              }

              await supabase.from("transaction_items").insert({
                transaction_id: prodTx.id,
                item_type: "product",
                item_id: p.id,
                name: p.name,
                quantity: p.quantity,
                unit_price_cents: p.price_cents,
                total_cents: lineTotal,
              });

              await supabase.from("products")
                .update({ stock_count: Math.max(0, (p.stock_count || 0) - p.quantity) })
                .eq("id", p.id);

              addedProductsTotalCents += lineTotal;
            }

            // If the appointment was already paid, the product charges are immediate top-ups.
            if (target.payment_confirmed && addedProductsTotalCents > 0) {
              await supabase.from("appointments")
                .update({ amount_paid_cents: (target.amount_paid_cents || 0) + addedProductsTotalCents })
                .eq("id", target.id);
            }
          } else if (productsAddToBalance) {
            // Decrement stock manually since no transaction trigger fires.
            for (const p of addedProducts) {
              await supabase.from("products")
                .update({ stock_count: Math.max(0, (p.stock_count || 0) - p.quantity) })
                .eq("id", p.id);
            }
          }


          okCount++;
        } catch (err) {
          errCount++;
          toast.error(err instanceof Error ? err.message : (language === "es" ? "No se pudo guardar la cita." : "Could not save appointment."));
        } finally {
          setProgressCurrent(i + 1);
        }
      }

      setProgressOpen(false);
      if (errCount === 0) {
        toast.success(language === "es"
          ? (targets.length > 1 ? `${okCount} citas actualizadas` : "Cita actualizada")
          : (targets.length > 1 ? `${okCount} appointments updated` : "Appointment updated"));
      } else {
        toast.warning(language === "es"
          ? `${okCount} actualizadas, ${errCount} con conflicto`
          : `${okCount} updated, ${errCount} skipped (conflict)`);
      }

      if (errCount > 0) { cobrarAfterSaveRef.current = false; return; }

      // Unified client matching: re-link the primary appt to the matched profile.
      if (pendingRelinkRef.current && appt) {
        const pendingRelink = pendingRelinkRef.current;
        const r = await relinkAppointment(appt.id, pendingRelink.clientId);
        if (!r.ok) {
          console.error("[EditAppointment] relink failed:", r.error);
        } else if (!pendingRelink.syncFields) {
          await supabase.from("appointments").update({
            client_name: editClientFullName,
            client_phone: editClientPhone || null,
            client_email: editClientEmail || null,
          }).eq("id", appt.id);
        }
        pendingRelinkRef.current = null;
      }

      // If user pressed "Guardar y Cobrar", jump straight to checkout with the freshly persisted price.
      if (cobrarAfterSaveRef.current) {
        cobrarAfterSaveRef.current = false;
        navigate(`/admin?tab=checkout&checkout=appointment&apptId=${appt.id}`);
      } else {
        navigate(`/admin/appointment/${appt.id}`);
      }
    } catch (err: any) {
      cobrarAfterSaveRef.current = false;
      setProgressOpen(false);
      toast.error(err.message || "Error updating appointment");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !appt) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  const startDate = editStartsAt ? parseISO(editStartsAt) : new Date();
  const bColor = editBarber?.color || getBarberColor(editBarber?.name || "");

  return (
    <div className="min-h-screen flex flex-col mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)", color: "var(--text-primary)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <SubpageHeader
        sticky
        title={language === "es" ? "Editar Cita" : "Edit Appointment"}
        onBack={() => navigate(`/admin/appointment/${appt.id}`)}
      />

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-32">
        {/* ─── INLINE EDITABLE SUMMARY ─── */}

        {/* Service */}
        <SummaryRow
          icon={<Scissors size={16} style={{ color: "var(--text-secondary)" }} />}
          label={language === "es" ? "Servicio" : "Service"}
          value={editService?.name || appt.service_name}
          subValue={editService ? `${editService.duration}min · $${editService.price}` : `${appt.duration_minutes}min`}
          onClick={() => { setAddServiceCalendar(null); setActiveModal("service"); }}
        />
        <div className="h-2" />

        {/* Compliments / Add-ons */}
        <SummaryRow
          icon={<PlusCircle size={16} style={{ color: "var(--text-secondary)" }} />}
          label={language === "es" ? "Complementos" : "Add-ons"}
          value={editAddonNames.length > 0 ? editAddonNames.join(", ") : (language === "es" ? "Ninguno" : "None")}
          subValue={editAddonIds.length > 0 ? `${acuityAddons.filter((a) => editAddonIds.includes(a.id)).reduce((s, a) => s + a.duration, 0)}min · $${(selectedMainAddonCents / 100).toFixed(2)}` : undefined}
          onClick={() => setActiveModal("addons")}
        />
        <div className="h-2" />

        {/* Added Service (conditional) */}
        {addedService && (
          <>
            <SummaryRow
              icon={<Plus size={16} style={{ color: "var(--text-secondary)" }} />}
              label={language === "es" ? "Servicio añadido" : "Added Service"}
              value={addedService.name}
              subValue={`${addedService.duration}min · $${addedService.price}`}
              onClick={() => { setAddedService(null); setAddedAddonIds([]); }}
            />
            <div className="h-2" />
          </>
        )}

        {/* Added Add-ons (conditional) */}
        {addedAddonNames.length > 0 && (
          <>
            <SummaryRow
              icon={<PlusCircle size={16} style={{ color: "var(--text-secondary)" }} />}
              label={language === "es" ? "Complemento añadido" : "Added Add-on"}
              value={addedAddonNames.join(", ")}
              subValue={`${addedAddonIds.length} ${language === "es" ? "seleccionado(s)" : "selected"}`}
            />
            <div className="h-2" />
          </>
        )}

        {/* Barber */}
        <SummaryRow
          icon={<User size={16} style={{ color: "var(--text-secondary)" }} />}
          label={language === "es" ? "Barbero" : "Barber"}
          value={editBarber?.name || barber?.name || ""}
          colorDot={bColor}
          onClick={() => setActiveModal("barber")}
        />
        <div className="h-2" />

        {/* Date & Time */}
        <SummaryRow
          icon={<CalendarDays size={16} style={{ color: "var(--text-secondary)" }} />}
          label={language === "es" ? "Fecha y Hora" : "Date & Time"}
          value={format(startDate, "EEEE, d MMMM", { locale: dateFnsLocale })}
          subValue={format(startDate, "h:mm a") + ` - ${totalDurationMinutes}min`}
          onClick={() => {
            pickerGoToDate(startDate);
            setPickerTime(null);
            setPickerCustomOpen(false);
            setPickerMonthOpen(false);
            setActiveModal("datetime");
          }}
        />
        <div className="h-2" />

        {/* Client */}
        <SummaryRow
          icon={<User size={16} style={{ color: "var(--text-secondary)" }} />}
          label={language === "es" ? "Cliente" : "Client"}
          value={[editClientFirstName, editClientLastName].filter(Boolean).join(" ")}
          subValue={[editClientPhone, editClientEmail].filter(Boolean).join(" - ")}
          onClick={() => setActiveModal("client")}
        />
        <div className="h-2" />

        {/* ─── ADD SERVICE / PRODUCT BUTTONS ─── */}
        <div className="flex gap-2 py-4">
          <button
            onClick={() => setActiveModal("addServicePicker")}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
            style={{ border: "1.5px dashed var(--border)", color: "var(--text-secondary)" }}
          >
            <Plus size={16} />
            {language === "es" ? "Servicio" : "Service"}
          </button>
          <button
            onClick={() => { setProductSearch(""); setProductDrawerOpen(true); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
            style={{ border: "1.5px dashed var(--border)", color: "var(--text-secondary)" }}
          >
            <ShoppingBag size={16} />
            {language === "es" ? "Producto" : "Product"}
          </button>
        </div>

        {/* ─── TOTAL / PAGADO / BALANCE ─── */}
        <div className="py-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Total</span>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              ${(totalPriceCents / 100).toFixed(2)}
            </span>
          </div>
          {amountPaidCents > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Pagado" : "Paid"}
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--success, #22c55e)" }}>
                −${(amountPaidCents / 100).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between px-1 pt-2" style={{ borderTop: amountPaidCents > 0 ? "1px solid var(--divider)" : "none" }}>
            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {language === "es" ? "Balance" : "Balance"}
            </span>
            <span
              className="text-xl font-black tracking-tight"
              style={{ color: balanceCents === 0 ? "#22c55e" : "var(--text-primary)", letterSpacing: "-0.04em" }}
            >
              ${(balanceCents / 100).toFixed(2)}
            </span>
          </div>
          {balanceCents > 0 && (
            <div className="pt-3 space-y-2">
              {savedCard && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
                >
                  <CreditCard size={16} style={{ color: "var(--text-primary)" }} />
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {language === "es" ? "Tarjeta guardada" : "Saved card"}:
                  </span>
                  <span className="capitalize">{savedCard.brand}</span>
                  <span style={{ color: "var(--text-tertiary)" }}>•••• {savedCard.last4}</span>
                </div>
              )}
              <button
                onClick={handleCobrar}
                disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-60"
                style={{ background: "var(--cta-bg, var(--accent-color))", color: "var(--cta-fg, #fff)" }}
              >
                {saving && cobrarAfterSaveRef.current ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CreditCard size={16} />
                )}
                {hasPendingPriceChanges
                  ? (language === "es" ? "Guardar y Cobrar" : "Save and Charge")
                  : (language === "es" ? "Cobrar" : "Charge")}{" "}
                ${(balanceCents / 100).toFixed(2)}
              </button>
            </div>
          )}
          {amountPaidCents > 0 && (() => {
            const methodLabel: Record<string, string> = {
              cash: language === "es" ? "Efectivo" : "Cash",
              stripe: language === "es" ? "Tarjeta" : "Card",
              paypal: "PayPal",
              ath_movil: "ATH Móvil",
            };
            const current = appt?.payment_method as string | null | undefined;
            return (
              <button
                onClick={() => setEditMethodOpen(true)}
                className="w-full flex items-center justify-between px-1 pt-2 active:opacity-60 transition-opacity"
                style={{ borderTop: "1px solid var(--divider)" }}
              >
                <span className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                  <CreditCard size={14} />
                  {language === "es" ? "Método de pago" : "Payment method"}
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {current ? (methodLabel[current] || current) : (language === "es" ? "Seleccionar" : "Select")}
                  <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
                </span>
              </button>
            );
          })()}
          {compositionChanged && (
            <p className="text-xs text-muted-foreground px-1">
              {language === "es" ? "Total y duración actualizados en AgendaOS. Revisa también la cita en Acuity; su API no permite cambiar el servicio ni la duración." : "Total and duration updated in AgendaOS. Also review the appointment in Acuity; its API cannot change the service or duration."}
            </p>
          )}
          {addedProducts.length > 0 && (
            <div className="mt-2 space-y-1">
              {addedProducts.map((p, idx) => (
                <div key={`${p.id}-${idx}`} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg" style={{ background: "var(--bg-surface-2)" }}>
                  <span className="text-xs flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
                    + {p.name}{p.quantity > 1 ? ` ×${p.quantity}` : ""}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    ${((p.price_cents * p.quantity) / 100).toFixed(2)}
                  </span>
                  <button
                    onClick={() => setAddedProducts((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-xs px-1.5 rounded-md"
                    style={{ color: "var(--text-tertiary)" }}
                    aria-label={language === "es" ? "Quitar" : "Remove"}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-2" />

        {appt?.client_id && <ClientBirthdayField key={appt.client_id} clientId={appt.client_id} appointmentId={appt.id} />}

        {/* ─── NOTES ─── */}
        <div className="py-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} style={{ color: "var(--text-secondary)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {language === "es" ? "Notas" : "Notes"}
            </span>
          </div>
          <Textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={3}
            className="text-sm"
            placeholder={language === "es" ? "Añadir notas..." : "Add notes..."}
            style={{ background: "var(--bg-surface-2)", borderColor: "var(--border)" }}
          />
        </div>

        {/* ─── SEND CONFIRMATION ─── */}
        <div className="flex items-center justify-between py-3">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            {language === "es" ? "Enviar confirmación al cliente" : "Send confirmation to client"}
          </span>
          <Switch checked={sendConfirmation} onCheckedChange={setSendConfirmation} />
        </div>
      </div>

      {/* ─── FIXED BOTTOM CTA ─── */}
      <div
        className="fixed bottom-0 left-0 right-0 p-4 z-20"
        style={{ background: "var(--bg-base)", borderTop: "1px solid var(--divider)" }}
      >
        <div className="mx-auto" style={{ maxWidth: 430 }}>
          <button
            onClick={saveChanges}
            disabled={saving}
            className="w-full py-3.5 rounded-xl text-sm font-bold transition-opacity disabled:opacity-50"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
          >
            {saving ? <Loader2 size={18} className="animate-spin mx-auto" /> : (language === "es" ? "Actualizar Cita" : "Update Appointment")}
          </button>
        </div>
      </div>

      {/* ═══════════════════ MODALS ═══════════════════ */}

      {/* ── SERVICE MODAL (direct edit — tap to select & close) ── */}
      <Drawer open={activeModal === "service"} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DrawerContent className="max-h-[85vh] flex flex-col">
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "Servicio" : "Service"}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {barberServices.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
                {language === "es" ? "No hay servicios disponibles" : "No services available"}
              </p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {barberServices.map((svc) => {
                  const isSelected = editService?.id === svc.id;
                  const durationLabel = svc.duration >= 60
                    ? `${Math.floor(svc.duration / 60)} hr${svc.duration % 60 > 0 ? `, ${svc.duration % 60} min` : ""}`
                    : `${svc.duration} min`;
                  return (
                    <button
                      key={svc.id}
                      onClick={() => {
                        setEditService(svc);
                        setEditAddonIds([]);
                        setAddServiceCalendar(null);
                        setActiveModal(null);
                        setServicePicked(true);
                      }}
                      className="w-full flex items-start gap-3 py-5 px-1 transition-all text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{svc.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{durationLabel}</p>
                        <p className="text-sm font-bold mt-1.5" style={{ color: "var(--text-primary)" }}>${svc.price}</p>
                      </div>
                      {isSelected ? (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1"
                          style={{ background: "var(--accent-color)" }}>
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
        </DrawerContent>
      </Drawer>

      {/* ── ADD SERVICE FLOW: Step 1 — Service picker with Next button ── */}
      <Drawer open={activeModal === "addServiceFlow"} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DrawerContent className="max-h-[85vh] flex flex-col">
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "Agregar Servicio" : "Add Service"}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4">
            {barberServices.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
                {language === "es" ? "No hay servicios disponibles" : "No services available"}
              </p>
            ) : (
              <div className="divide-y pb-2" style={{ borderColor: "var(--border)" }}>
                {barberServices.map((svc) => {
                  const isSelected = addedService?.id === svc.id;
                  const durationLabel = svc.duration >= 60
                    ? `${Math.floor(svc.duration / 60)} hr${svc.duration % 60 > 0 ? `, ${svc.duration % 60} min` : ""}`
                    : `${svc.duration} min`;
                  return (
                    <button
                      key={svc.id}
                      onClick={() => {
                        setAddedService(isSelected ? null : svc);
                        if (!isSelected) setAddedAddonIds([]);
                      }}
                      className="w-full flex items-start gap-3 py-5 px-1 transition-all text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{svc.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{durationLabel}</p>
                        <p className="text-sm font-bold mt-1.5" style={{ color: "var(--text-primary)" }}>${svc.price}</p>
                      </div>
                      {isSelected ? (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1"
                          style={{ background: "var(--accent-color)" }}>
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
          <div className="px-4 pb-6 pt-3">
            <button
              onClick={() => {
                setAddServiceCalendar(null);
                setActiveModal("addServiceAddons");
              }}
              className="w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              {language === "es" ? "Continuar a complementos" : "Continue to add-ons"}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── ADD SERVICE FLOW: Step 2 — Add-ons then return to edit page ── */}
      <Drawer open={activeModal === "addServiceAddons"} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DrawerContent className="max-h-[85vh] flex flex-col">
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "Complementos" : "Add-ons"}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {addedServiceAddons.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
                {language === "es" ? "No hay complementos disponibles para este servicio" : "No add-ons available for this service"}
              </p>
            ) : (
              <div className="space-y-2">
                {addedServiceAddons.map((addon) => {
                  const isChecked = addedAddonIds.includes(addon.id);
                  return (
                    <button
                      key={addon.id}
                      onClick={() => setAddedAddonIds((prev) =>
                        isChecked ? prev.filter((x) => x !== addon.id) : [...prev, addon.id]
                      )}
                      className="w-full flex items-center justify-between py-3 px-4 rounded-xl text-sm transition-all"
                      style={{
                        background: isChecked ? `${bColor}15` : "var(--bg-surface)",
                        border: isChecked ? `1.5px solid ${bColor}40` : "1.5px solid transparent",
                      }}
                    >
                      <div className="flex-1 text-left">
                        <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{addon.name}</span>
                        {addon.duration > 0 && (
                          <span className="text-[11px] ml-2" style={{ color: "var(--text-tertiary)" }}>+{addon.duration} min</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                          {parseFloat(addon.price) > 0 ? `+$${addon.price}` : (language === "es" ? "Gratis" : "Free")}
                        </span>
                        {isChecked ? (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: bColor }}>
                            <Check className="icon-extrabold" size={14} color="#fff" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ border: "1.5px solid var(--border)" }}>
                            <Plus size={12} style={{ color: "var(--text-tertiary)" }} />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="px-4 pb-6 pt-2">
            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-3.5 rounded-xl text-sm font-bold"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              {addedServiceAddons.length === 0
                ? (language === "es" ? "Omitir" : "Skip")
                : (language === "es" ? "Listo" : "Done")}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── ADDONS MODAL ── */}
      <Drawer open={activeModal === "addons"} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "Complementos" : "Add-ons"}</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="max-h-[60vh] px-4 pb-4">
            {serviceAddons.length === 0 ? (
              <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
                {language === "es" ? "No hay complementos disponibles para este servicio" : "No add-ons available for this service"}
              </p>
            ) : (
              <div className="space-y-2">
                {serviceAddons.map((addon) => {
                  const isChecked = editAddonIds.includes(addon.id);
                  return (
                    <button
                      key={addon.id}
                      onClick={() => setEditAddonIds((prev) =>
                        isChecked ? prev.filter((x) => x !== addon.id) : [...prev, addon.id]
                      )}
                      className="w-full flex items-center justify-between py-3 px-4 rounded-xl text-sm transition-all"
                      style={{
                        background: isChecked ? `${bColor}15` : "var(--bg-surface)",
                        border: isChecked ? `1.5px solid ${bColor}40` : "1.5px solid transparent",
                      }}
                    >
                      <div className="flex-1 text-left">
                        <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{addon.name}</span>
                        {addon.duration > 0 && (
                          <span className="text-[11px] ml-2" style={{ color: "var(--text-tertiary)" }}>+{addon.duration} min</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                          {parseFloat(addon.price) > 0 ? `+$${addon.price}` : (language === "es" ? "Gratis" : "Free")}
                        </span>
                        {isChecked ? (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: bColor }}>
                            <Check className="icon-extrabold" size={14} color="#fff" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ border: "1.5px solid var(--border)" }}>
                            <Plus size={12} style={{ color: "var(--text-tertiary)" }} />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <div className="px-4 pb-6 pt-2">
            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-3.5 rounded-xl text-sm font-bold"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              {language === "es" ? "Listo" : "Done"}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── BARBER MODAL ── */}
      <Drawer open={activeModal === "barber"} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "Asignar Barbero" : "Assign Barber"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-2">
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
              {language === "es"
                ? "Al cambiar el barbero, toda la cita (servicio, precio, hora, cliente) se migra a su calendario — aunque el servicio no esté asignado a ese barbero en Acuity."
                : "Changing the barber migrates the entire appointment (service, price, time, client) to their calendar — even if the service isn't normally assigned to that barber in Acuity."}
            </p>
            {allBarbers.filter((b) => b.acuity_calendar_id).map((b) => {
              const isSelected = editBarber?.id === b.id;
              const bc = b.color || getBarberColor(b.name);
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    setEditBarber(b);
                    const cal = findCalendarForBarber(b);
                    if (cal) setEditCalendar(cal);
                    setActiveModal(null);
                  }}
                  className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl text-left transition-all active:scale-[0.98]"
                  style={{ background: isSelected ? "var(--accent-dim)" : "var(--bg-surface-2)" }}
                >
                  <span className="w-4 h-4 rounded-full" style={{ background: bc }} />
                  <span className="text-sm font-semibold flex-1" style={{ color: "var(--text-primary)" }}>{b.name}</span>
                  {isSelected && <Check size={18} style={{ color: "var(--accent-color)" }} />}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── DATE/TIME MODAL ── */}
      <AnimatePresence>
        {activeModal === "datetime" && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 z-50 flex flex-col"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
          >
            <header className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: "1px solid var(--divider)" }}>
              <button onClick={() => setActiveModal(null)} className="p-1 -ml-1">
                <ChevronLeft size={24} style={{ color: "var(--accent-color)" }} />
              </button>
              <h1 className="text-lg font-semibold">{language === "es" ? "Fecha y Hora" : "Date & Time"}</h1>
            </header>

            <div className="flex-1 overflow-y-auto pb-32">
              {/* Barber chip + today button */}
              <div className="flex items-center justify-between px-4 pt-2 pb-3">
                {editBarber && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                    style={{ border: "1px solid var(--border)" }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: `${bColor}20` }}>
                      <User size={12} style={{ color: bColor }} />
                    </div>
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {editBarber.name.split(" ")[0]}
                    </span>
                  </div>
                )}
                <button onClick={() => { pickerGoToDate(new Date()); setPickerMonthOpen(false); }}
                  className="w-10 h-10 flex items-center justify-center rounded-full"
                  style={{ border: "1px solid var(--border)" }}>
                  <CalendarCheck size={18} style={{ color: "var(--text-secondary)" }} />
                </button>
              </div>

              {/* Month title */}
              <div className="px-4 pb-2">
                <button onClick={() => { setPickerMonthOpen(!pickerMonthOpen); if (!pickerMonthOpen) setPickerMonthDate(pickerDate); }}
                  className="flex items-center gap-1.5">
                  <span className="text-lg font-bold capitalize" style={{ color: "var(--text-primary)" }}>
                    {format(pickerDate, "MMMM yyyy", { locale: dateFnsLocale })}
                  </span>
                  <ChevronDown size={16} className="transition-transform duration-200"
                    style={{ color: "var(--text-tertiary)", transform: pickerMonthOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>
              </div>

              {/* Month Grid (expandable) */}
              <AnimatePresence>
                {pickerMonthOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden px-4">
                    <EditMonthGrid
                      monthDate={pickerMonthDate}
                      selectedDate={pickerDate}
                      availableDates={pickerAvailDates}
                      onSelectDate={(d) => { pickerGoToDate(d); setPickerMonthOpen(false); }}
                      onChangeMonth={setPickerMonthDate}
                      language={language}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Week Row */}
              {!pickerMonthOpen && (
                <div className="px-2 pb-4"
                  style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => pickerGoToWeek(-1)} aria-label="Semana anterior"
                      className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                      <ChevronLeft size={20} style={{ color: "var(--text-secondary)" }} />
                    </button>
                    <div className="flex-1 overflow-hidden"
                      onTouchStart={(e) => { pickerTouchRef.current = { startX: e.touches[0].clientX }; }}
                      onTouchEnd={(e) => {
                        const diff = (e.changedTouches[0]?.clientX || 0) - pickerTouchRef.current.startX;
                        if (Math.abs(diff) > 50) {
                          if (diff > 0) pickerGoToWeek(-1); else pickerGoToWeek(1);
                        }
                      }}>
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div key={pickerWeekStart.toISOString()}
                          initial={{ x: pickerSwipeDir * 120, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={{ x: pickerSwipeDir * -120, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 600, damping: 22, mass: 0.6 }}
                          className="flex items-center justify-around">
                          {pickerWeekDays.map((day, i) => {
                            const selected = isSameDay(day, pickerDate);
                            const todayDay = isToday(day);
                            const past = !isPickerDateAllowed(day);
                            const dateStr = format(day, "yyyy-MM-dd");
                            const available = (pickerAvailDates.length === 0 || pickerAvailDates.includes(dateStr)) && !past;
                            const dayName = format(day, "EEEE", { locale: dateFnsLocale });
                            return (
                              <button key={i} onClick={() => setPickerDate(day)}
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
                    <button onClick={() => pickerGoToWeek(1)} aria-label="Semana siguiente"
                      className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                      <ChevronRight size={20} style={{ color: "var(--text-secondary)" }} />
                    </button>
                  </div>
                </div>
              )}

              {/* Time Slots */}
              <div className="px-4 pt-4 space-y-2">
                {pickerLoadingSlots || pickerLoadingDates ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                  </div>
                ) : pickerSlots.length === 0 && !pickerCustomOpen ? (
                  <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "No hay horarios disponibles para este día" : "No available times for this day"}
                  </p>
                ) : !pickerCustomOpen ? (
                  <div className="grid grid-cols-3 gap-2">
                    {pickerSlots.map((slot, idx) => {
                      const selected = pickerTime === slot.time;
                      return (
                        <motion.button key={slot.time}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                          onClick={() => setPickerTime(slot.time)}
                          className="py-3 rounded-xl text-[14px] font-semibold text-center transition-all active:scale-[0.96]"
                          style={{
                            border: selected ? `2px solid ${bColor}` : "1.5px solid var(--border)",
                            background: selected ? `${bColor}15` : "transparent",
                            color: "var(--text-primary)",
                          }}>
                          {format(new Date(slot.time), "h:mm a")}
                        </motion.button>
                      );
                    })}
                  </div>
                ) : null}

                {/* Custom Time */}
                {!pickerLoadingSlots && !pickerLoadingDates && (
                  <AnimatePresence mode="wait">
                    {!pickerCustomOpen ? (
                      <motion.button
                        key="custom-btn"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setPickerCustomOpen(true)}
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
                          <button onClick={() => setPickerCustomOpen(false)}
                            className="p-1 rounded-full" style={{ color: "var(--text-tertiary)" }}>
                            <X size={16} />
                          </button>
                        </div>
                        <div className="flex items-center justify-center gap-2 mb-4">
                          <select
                            value={pickerCustomHour}
                            onChange={(e) => setPickerCustomHour(Number(e.target.value))}
                            className="text-[14px] font-semibold text-center rounded-xl py-2.5 px-3 appearance-none"
                            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)", width: 72 }}>
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i}>{String(i % 12 || 12).padStart(2, "0")}</option>
                            ))}
                          </select>
                          <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>:</span>
                          <select
                            value={pickerCustomMinute}
                            onChange={(e) => setPickerCustomMinute(Number(e.target.value))}
                            className="text-[14px] font-semibold text-center rounded-xl py-2.5 px-3 appearance-none"
                            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)", width: 72 }}>
                            {[0, 15, 30, 45].map((m) => (
                              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                            ))}
                          </select>
                          <span className="text-sm font-semibold ml-1" style={{ color: "var(--text-secondary)" }}>
                            {pickerCustomHour < 12 ? "AM" : "PM"}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            const d = pickerDate;
                            const tz = await getShopTimezone();
                            const iso = toAcuityDatetimeInTz(
                              d.getFullYear(),
                              d.getMonth() + 1,
                              d.getDate(),
                              pickerCustomHour,
                              pickerCustomMinute,
                              tz,
                            );
                            setPickerTime(iso);
                            setPickerCustomOpen(false);
                          }}
                          className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.97]"
                          style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
                          {language === "es" ? "Confirmar hora" : "Confirm Time"} - {pickerCustomHour % 12 || 12}:{String(pickerCustomMinute).padStart(2, "0")} {pickerCustomHour < 12 ? "AM" : "PM"}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            </div>

            {/* Apply button */}
            <div className="fixed bottom-0 left-0 right-0 p-4" style={{ background: "var(--bg-base)", borderTop: "1px solid var(--divider)" }}>
              <button
                onClick={() => {
                  if (pickerTime) setEditStartsAt(pickerTime);
                  setActiveModal(null);
                }}
                disabled={!pickerTime}
                className="w-full py-3.5 rounded-xl text-sm font-bold transition-opacity disabled:opacity-50"
                style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
              >
                {language === "es" ? "Aplicar" : "Apply"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CLIENT MODAL ── */}
      <Drawer open={activeModal === "client"} onOpenChange={(o) => !o && setActiveModal(null)} fixed>
        <DrawerContent
          className="max-h-[78vh] flex flex-col transition-[bottom] duration-150 ease-out"
          style={{
            bottom: clientKeyboardOffset,
            maxHeight: clientKeyboardOffset > 0 ? `calc(100vh - ${clientKeyboardOffset + 12}px)` : undefined,
          }}
        >
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "Cliente" : "Client"}</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 px-4 space-y-3 overflow-y-auto" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}>
            {/* Client suggestions */}
            <AnimatePresence>
              {clientSuggestions.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl overflow-hidden mb-1" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)" }}>
                    <p className="text-[11px] font-semibold px-3 pt-2 pb-1" style={{ color: "var(--text-tertiary)" }}>
                      {language === "es" ? "Clientes sugeridos" : "Suggested clients"}
                    </p>
                    {clientSuggestions.map((c, i) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setEditClientFirstName(c.first_name);
                          setEditClientLastName(c.last_name || "");
                          setEditClientPhone(c.phone || "");
                          setEditClientEmail(c.email || "");
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-black/5"
                        style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: "var(--accent-muted)", color: "var(--accent-color)" }}>
                          {c.first_name[0]}{(c.last_name || "")[0] || ""}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                            {c.first_name} {c.last_name || ""}
                          </p>
                          {(c.phone || c.email) && (
                            <p className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                              {[c.phone, c.email].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Nombre" : "First Name"}
              </label>
              <Input value={editClientFirstName} onChange={(e) => setEditClientFirstName(e.target.value)}
                autoComplete="given-name" name="given-name" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Apellido" : "Last Name"}
              </label>
              <Input value={editClientLastName} onChange={(e) => setEditClientLastName(e.target.value)}
                autoComplete="family-name" name="family-name" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Teléfono" : "Phone"}
              </label>
              <Input value={editClientPhone} onChange={(e) => setEditClientPhone(e.target.value)} type="tel" inputMode="tel"
                autoComplete="tel" name="tel" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: "var(--text-secondary)" }}>Email</label>
              <Input value={editClientEmail} onChange={(e) => setEditClientEmail(e.target.value)} type="email" inputMode="email"
                autoComplete="email" name="email" />
            </div>
            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-3.5 rounded-xl text-sm font-bold mt-2"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              {language === "es" ? "Listo" : "Done"}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ── ADD SERVICE PICKER (which barber's list?) ── */}
      <Drawer open={activeModal === "addServicePicker"} onOpenChange={(o) => !o && setActiveModal(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "¿De qué barbero?" : "Which barber's list?"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 space-y-2">
            {acuityCalendars.map((cal) => {
              const bc = getBarberColor(cal.name);
              return (
                <button
                  key={cal.id}
                  onClick={() => {
                    setAddServiceCalendar(cal);
                    setActiveModal(null);
                    setTimeout(() => setActiveModal("addServiceFlow"), 100);
                  }}
                  className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl text-left transition-all active:scale-[0.98]"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  <span className="w-4 h-4 rounded-full" style={{ background: bc }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{cal.name.trim()}</span>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* ═══ PRODUCT PICKER DRAWER ═══ */}
      <Drawer open={productDrawerOpen} onOpenChange={setProductDrawerOpen}>
        <DrawerContent>
          <div className="px-4 py-4 max-h-[70vh] flex flex-col">
            <p className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>
              {language === "es" ? "Agregar Producto" : "Add Product"}
            </p>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
              <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                placeholder={language === "es" ? "Buscar producto..." : "Search product..."}
                className="pl-9" />
            </div>
            <ScrollArea className="flex-1 max-h-[50vh]">
              <div className="space-y-1">
                {products
                  .filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                  .map((product) => (
                    <button key={product.id}
                      onClick={() => {
                        setProductDrawerOpen(false);
                        setAddedProducts((prev) => {
                          const existing = prev.find((p) => p.id === product.id);
                          if (existing) {
                            return prev.map((p) => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p);
                          }
                          return [...prev, {
                            id: product.id,
                            name: product.name,
                            price_cents: product.price_cents,
                            image_url: product.image_url,
                            stock_count: product.stock_count,
                            quantity: 1,
                          }];
                        });
                        toast.success(language === "es" ? `${product.name} agregado` : `${product.name} added`);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all active:scale-[0.98]"
                      style={{ background: "transparent" }}>
                      {product.image_url ? (
                        <img loading="lazy" decoding="async" src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/product-images/${product.image_url}`} alt={product.name} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}>
                          <ShoppingBag size={16} style={{ color: "var(--text-tertiary)" }} />
                        </div>
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{product.name}</p>
                        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>${(product.price_cents / 100).toFixed(2)}</p>
                      </div>
                      <Plus size={16} style={{ color: "var(--text-tertiary)" }} />
                    </button>
                  ))}
                {products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
                  <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "No se encontraron productos" : "No products found"}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Recurring scope dialog (shown only when editing a recurring appointment) */}
      <RecurringScopeDialog
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        action="edit"
        language={language === "es" ? "es" : "en"}
        onChoose={(scope) => {
          // Products always fold into the appointment balance; method is picked at checkout.
          void runSave(scope, "balance");
        }}
        accentColor={bColor}
      />

      {/* Unified client identity match prompt (partial match only) */}
      <ClientMatchConfirmDialog
        open={!!matchPrompt}
        match={matchPrompt}
        busy={matchChecking || saving}
        onConfirm={() => {
          if (matchPrompt?.clientId) pendingRelinkRef.current = { clientId: matchPrompt.clientId, syncFields: true };
          setMatchPrompt(null);
          void proceedAfterMatch();
        }}
        onKeepSeparate={() => {
          setMatchPrompt(null);
          void proceedAfterMatch();
        }}
      />


      {/* Bulk-edit progress modal */}
      <RecurringProgressModal
        open={progressOpen}
        action={progressAction}
        current={progressCurrent}
        total={progressTotal}
        language={language === "es" ? "es" : "en"}
        accentColor={bColor}
      />

      {/* ═══ EDIT PAYMENT METHOD MODAL — floats above the editing module ═══ */}
      <AnimatePresence>
        {editMethodOpen && (
          <>
            <motion.div
              key="edit-method-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60]"
              style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              onClick={() => !savingMethod && setEditMethodOpen(false)}
            />
            <motion.div
              key="edit-method-modal"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none px-6"
            >
              <div
                className="pointer-events-auto w-full max-w-[320px]"
                style={{
                  background: "#ffffff",
                  borderRadius: 28,
                  boxShadow: "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
                  padding: "28px 24px 24px",
                }}
              >
                <div className="flex justify-center mb-4">
                  <span className="text-[11px] font-semibold tracking-wide px-3.5 py-1" style={{ borderRadius: 10, background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)" }}>
                    {language === "es" ? "Cambiar Método" : "Change Method"}
                  </span>
                </div>
                <h2
                  className="text-center uppercase whitespace-pre-line mb-1"
                  style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}
                >
                  {language === "es" ? "MÉTODO\nDE PAGO" : "PAYMENT\nMETHOD"}
                </h2>
                <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                  {language === "es" ? "Selecciona el nuevo método" : "Select the new method"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 12 }}>
                  {([
                    { key: "cash", label: "Efectivo", labelEn: "Cash", color: "#4ade80" },
                    { key: "ath_movil", label: "ATH Móvil", labelEn: "ATH Móvil", color: "#f97316" },
                    { key: "stripe", label: "Tarjeta", labelEn: "Credit Card", color: "#a78bfa" },
                    { key: "paypal", label: "PayPal", labelEn: "PayPal", color: "#60a5fa" },
                  ] as const).map((opt) => {
                    const isCurrent = appt?.payment_method === opt.key;
                    return (
                      <button
                        key={opt.key}
                        disabled={savingMethod}
                        onClick={async () => {
                          if (isCurrent) { setEditMethodOpen(false); return; }
                          if (!appt?.id) return;
                          setSavingMethod(true);
                          const { error: aErr } = await supabase.from("appointments").update({ payment_method: opt.key }).eq("id", appt.id);
                          if (aErr) {
                            setSavingMethod(false);
                            toast.error(language === "es" ? "Error al actualizar" : "Update failed");
                            return;
                          }
                          // Sync any existing transactions tied to this appointment
                          await supabase.from("transactions").update({ payment_method: opt.key }).eq("appointment_id", appt.id);
                          setAppt((prev: any) => prev ? { ...prev, payment_method: opt.key } : prev);
                          setSavingMethod(false);
                          setEditMethodOpen(false);
                          toast.success(language === "es" ? "Método actualizado" : "Method updated");
                        }}
                        className="w-full text-center font-semibold transition-all active:scale-[0.97] disabled:opacity-60"
                        style={{
                          background: "#111111",
                          color: opt.color,
                          fontSize: 13,
                          padding: "10px 0",
                          borderRadius: "var(--radius-control)",
                          border: isCurrent ? `2px solid ${opt.color}` : "none",
                        }}
                      >
                        {language === "es" ? opt.label : opt.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Month Grid (matches NewAppointment style) ─── */
function EditMonthGrid({ monthDate, selectedDate, availableDates, onSelectDate, onChangeMonth, language }: {
  monthDate: Date; selectedDate: Date; availableDates: string[];
  onSelectDate: (d: Date) => void; onChangeMonth: (d: Date) => void; language: string;
}) {
  const dateFnsLocale = language === "es" ? esLocale : enUS;
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
