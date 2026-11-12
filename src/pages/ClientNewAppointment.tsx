import { slotTakenMessage } from "@/lib/slotTaken";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPendingBookingUrl } from "@/lib/pendingBooking";
import { useBookingRules } from "@/hooks/useBookingRules";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, CalendarCheck, Clock, User, Scissors,
  Loader2, Check, CheckCircle, X, ChevronDown, Plus, AlertTriangle,
} from "lucide-react";
import { format, addDays, startOfWeek, isToday, isSameDay, isBefore, startOfDay, addMinutes } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "motion/react";

import { BarberPickerRow, getBarberColor } from "@/components/BarberPickerRow";
import { BookingProgress, type BookingProgressChip } from "@/components/site/booking/BookingProgress";
import { PaymentStep } from "@/components/site/booking/PaymentStep";
import { ProductsStep, type ProductCart, type ProductLineItem } from "@/components/site/booking/ProductsStep";
import { normalizePhone10 } from "@/lib/phone";
import { useTranslation } from "@/hooks/useTranslation";
import { usePersistentState, writePersistent } from "@/lib/persistentState";

const BOOKING_KEY = "clientNewAppt.v1";
const clearBookingDraft = () => {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(`agendaos.${BOOKING_KEY}.`))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
};

/* ─── acuity proxy helper ─── */
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
  id: number; name: string; duration: number; price: string;
  color: string; calendarIDs: number[]; category: string;
  addonIDs: number[]; description: string; private?: boolean;
}
interface AcuityCalendar { id: number; name: string; avatarUrl?: string | null; barberId?: string | null; }
interface AcuityTimeSlot { time: string; slotsAvailable: number; }
interface AcuityAddon { id: number; name: string; duration: number; price: string; }

type Step = "barber" | "service" | "addons" | "products" | "datetime" | "summary" | "payment";

export default function ClientNewAppointment() {
  const navigate = useNavigate();
  useEffect(() => {
    const pendingUrl = getPendingBookingUrl();
    if (pendingUrl) navigate(pendingUrl, { replace: true });
  }, [navigate]);
  const [searchParams] = useSearchParams();
  const { getMinAdvance, maxAdvanceDays } = useBookingRules();
  const { t, language } = useTranslation();
  const dfLocale = language === "en" ? enUS : es;
  const preselectedBarber = searchParams.get("barber");
  const isRepeat = searchParams.get("repeat") === "true";
  const repeatServiceTypeId = searchParams.get("serviceTypeId");
  const repeatBarberId = searchParams.get("barberId");
  const { user } = useAuth();

  /* ─── Stale-payment guard (runs SYNCHRONOUSLY before usePersistentState reads) ───
     The payment step is the only step that ever leaves this page (Stripe /
     PayPal / ATH redirect to /citas/confirmando). After confirmation, the
     draft is committed/failed/refunded server-side and any persisted local
     state is stale. If a user navigates back to this page later, we must
     NEVER restore "payment" — otherwise they're sent to the last stage of a
     previous appointment with an unavailable date. We wipe the draft inside
     a useRef initialiser so it executes BEFORE the persistent state hooks
     below read from localStorage on the same render. */
  useRef(
    (() => {
      try {
        const persistedStep = window.localStorage.getItem(`agendaos.${BOOKING_KEY}.step`);
        if (persistedStep === '"payment"') clearBookingDraft();
      } catch { /* ignore */ }
      return null;
    })()
  );

  const [step, setStep] = usePersistentState<Step>(`${BOOKING_KEY}.step`, "barber");

  // Selections (persisted so a refresh / accidental nav doesn't reset progress)
  const [selectedCalendar, setSelectedCalendar] = usePersistentState<AcuityCalendar | null>(`${BOOKING_KEY}.calendar`, null);
  const [selectedType, setSelectedType] = usePersistentState<AcuityType | null>(`${BOOKING_KEY}.type`, null);
  const [selectedDateIso, setSelectedDateIso] = usePersistentState<string>(`${BOOKING_KEY}.date`, new Date().toISOString());
  const selectedDate = useMemo(() => new Date(selectedDateIso), [selectedDateIso]);
  const setSelectedDate = useCallback((d: Date) => setSelectedDateIso(d.toISOString()), [setSelectedDateIso]);
  const [selectedTime, setSelectedTime] = usePersistentState<string | null>(`${BOOKING_KEY}.time`, null);
  const [selectedAddons, setSelectedAddons] = usePersistentState<number[]>(`${BOOKING_KEY}.addons`, []);
  const [notes, setNotes] = usePersistentState<string>(`${BOOKING_KEY}.notes`, "");
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [editingContact, setEditingContact] = useState(false);

  // Mini-shop products (mirrors PublicBookingFlow). Persisted so a refresh
  // doesn't drop the cart between steps.
  const [productCart, setProductCart] = usePersistentState<ProductCart>(`${BOOKING_KEY}.productCart`, {});
  const [productLineItems, setProductLineItems] = useState<ProductLineItem[]>([]);
  const [productsTotalCents, setProductsTotalCents] = useState(0);
  // Smart-skip: null = unknown (treat as show), false = no inventory → bypass.
  const [hasProducts, setHasProducts] = useState<boolean | null>(null);

  // Client info (auto-filled from profile)
  const [clientFirst, setClientFirst] = useState("");
  const [clientLast, setClientLast] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [supabaseClientId, setSupabaseClientId] = useState<string | null>(null);
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [savedCardLast4, setSavedCardLast4] = useState<string | null>(null);
  const [savedCardBrand, setSavedCardBrand] = useState<string | null>(null);

  // Payment step state — holds DRAFT id (no Acuity row exists yet — created atomically after payment)
  const [paymentAppointment, setPaymentAppointment] = usePersistentState<{
    draftId: string;
    priceCents: number;
    serviceName: string;
  } | null>(`${BOOKING_KEY}.payment`, null);

  // Data
  const [services, setServices] = useState<AcuityType[]>([]);
  const [dbServices, setDbServices] = useState<Array<{ acuity_type_id: number; barber_id: string | null; name: string; duration_minutes: number; price_cents: number; sort_order: number; locally_edited: boolean; is_public: boolean }>>([]);
  const [calendars, setCalendars] = useState<AcuityCalendar[]>([]);
  const [allAddons, setAllAddons] = useState<AcuityAddon[]>([]);
  const [addons, setAddons] = useState<AcuityAddon[]>([]);
  const [timeSlots, setTimeSlots] = useState<AcuityTimeSlot[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);

  // Booking rules - derived from hook + selected service
  const minAdvanceMinutes = useMemo(() => getMinAdvance(selectedType?.id ?? null), [getMinAdvance, selectedType]);

  // Loading — barbers load fast (Supabase only); services/addons load lazily in background
  const [loadingBarbers, setLoadingBarbers] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Success
  const [successSheetOpen, setSuccessSheetOpen] = useState(false);

  /* ─── Clear draft on unmount when leaving via in-app navigation ───
     The X button and goBack() already clear, but if the user taps a
     bottom-nav tab or browser-back without going through our handlers,
     this ensures we don't restore them mid-flow next time. We DO NOT
     clear if the user is on the payment step (they may be redirected to
     Stripe/PayPal/ATH and need state when they return) or success. */
  useEffect(() => {
    return () => {
      let currentStep: string | null = null;
      try {
        currentStep = window.localStorage.getItem(`agendaos.${BOOKING_KEY}.step`);
      } catch { /* ignore */ }
      if (currentStep !== '"payment"') {
        clearBookingDraft();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1);
  const [monthViewOpen, setMonthViewOpen] = useState(false);
  const [monthViewDate, setMonthViewDate] = useState(new Date());
  const weekTouchRef = useRef<{ startX: number }>({ startX: 0 });

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const availabilityMonthKeys = useMemo(() => {
    const months = new Set<string>();
    months.add(format(selectedDate, "yyyy-MM"));
    weekDays.forEach((day) => months.add(format(day, "yyyy-MM")));
    if (monthViewOpen) months.add(format(monthViewDate, "yyyy-MM"));
    return Array.from(months).sort();
  }, [selectedDate, weekDays, monthViewOpen, monthViewDate]);
  const availabilityMonthKey = availabilityMonthKeys.join("|");

  const goToWeek = (dir: -1 | 1) => { setSwipeDir(dir); setWeekStart((prev) => addDays(prev, dir * 7)); };
  const goToDate = (date: Date) => { setSelectedDate(date); setWeekStart(startOfWeek(date, { weekStartsOn: 0 })); };

  const minDate = useMemo(() => addMinutes(new Date(), minAdvanceMinutes), [minAdvanceMinutes]);
  const maxDate = useMemo(() => addDays(new Date(), maxAdvanceDays), [maxAdvanceDays]);

  const isDateAllowed = useCallback((day: Date) => {
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59);
    return dayEnd >= startOfDay(minDate) && day <= maxDate;
  }, [minDate, maxDate]);


  /* ─── Load client profile ─── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      // Sensitive payment metadata (stripe_customer_id, card_brand, card_last4)
      // is column-revoked from `authenticated` and only reachable through the
      // security-definer RPC `get_client_payment_details` (allows own row).
      const { data: client } = await supabase
        .from("clients")
        .select("id,first_name,last_name,phone,email")
        .eq("auth_user_id", user.id)
        .single();
      if (client) {
        setClientFirst(client.first_name);
        setClientLast(client.last_name || "");
        setClientPhone(client.phone || "");
        setClientEmail(client.email || "");
        setSupabaseClientId(client.id);

        const { data: payData } = await (supabase.rpc as any)(
          "get_client_payment_details",
          { _client_id: client.id }
        );
        const pay = (payData as any[])?.[0] || {};
        setStripeCustomerId(pay.stripe_customer_id || null);
        setSavedCardBrand(pay.card_brand || null);
        setSavedCardLast4(pay.card_last4 || null);
      }
    })();
  }, [user]);

  /* ─── Load barbers FAST (Supabase only) — render barber picker immediately ─── */
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("barbers_public")
          .select("id, name, acuity_calendar_id, avatar_url")
          .eq("is_active", true)
          .not("acuity_calendar_id", "is", null)
          .order("name");
        const merged: AcuityCalendar[] = (data || []).map((b) => ({
          id: b.acuity_calendar_id as number,
          name: b.name,
          avatarUrl: b.avatar_url || null,
          barberId: b.id,
        }));
        setCalendars(merged);
      } catch {
        toast.error(t("portal.newAppt.loadError"));
      } finally {
        setLoadingBarbers(false);
      }
    })();
  }, []);

  /* ─── Load services + addons in BACKGROUND (slower Acuity proxy) ─── */
  useEffect(() => {
    (async () => {
      try {
        const [typesData, addonsData, dbSvcRes] = await Promise.all([
          acuityProxy("/appointment-types"),
          acuityProxy("/appointment-addons"),
          supabase.from("services").select("acuity_type_id, barber_id, name, duration_minutes, price_cents, sort_order, locally_edited, is_public").eq("is_active", true),
        ]);
        if (dbSvcRes.data) setDbServices(dbSvcRes.data as any);
        if (Array.isArray(typesData)) setServices(typesData.filter((t: AcuityType) => !t.private));
        if (Array.isArray(addonsData)) setAllAddons(addonsData.filter((a: AcuityAddon) => a.id !== 584093));
      } catch {
        toast.error(t("portal.newAppt.loadError"));
      } finally {
        setLoadingData(false);
      }
    })();
  }, []);

  /* ─── Mini-shop precheck (smart-skip) ───
     Mirrors PublicBookingFlow: if there's no in-stock inventory we bypass
     the products step entirely. ProductsStep itself remains the source of
     truth for cart UI; this only controls navigation. */
  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("public-booking-create", { body: { action: "list-products" } })
      .then(({ data }) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setHasProducts(list.some((p: any) => (p?.stock_count ?? 0) > 0));
      })
      .catch(() => { if (!cancelled) setHasProducts(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!preselectedBarber || calendars.length === 0 || selectedCalendar) return;
    const match = calendars.find((cal) =>
      cal.name.toLowerCase().includes(preselectedBarber.toLowerCase()) ||
      preselectedBarber.toLowerCase().includes(cal.name.toLowerCase().split(" ")[0])
    );
    if (match) {
      setSelectedCalendar(match);
      setStep("service");
    }
  }, [preselectedBarber, calendars]);

  /* ─── Repeat booking: auto-select barber + service, skip to datetime ─── */
  const repeatHandled = useRef(false);
  useEffect(() => {
    if (!isRepeat || repeatHandled.current || calendars.length === 0 || services.length === 0) return;
    // Match calendar by barberId from barbers table
    const calMatch = repeatBarberId
      ? calendars.find((c) => c.barberId === repeatBarberId)
      : null;
    if (!calMatch) return;
    setSelectedCalendar(calMatch);

    // Match service by acuity type id (id-only — trust historical pairing,
    // even if Acuity later unlinked the service from this calendar).
    const typeId = repeatServiceTypeId ? parseInt(repeatServiceTypeId, 10) : null;
    const svcMatch = typeId ? services.find((s) => s.id === typeId) : null;
    if (svcMatch) {
      setSelectedType(svcMatch);
      setStep("datetime");
      repeatHandled.current = true;
    } else {
      // Fallback: go to service selection with barber pre-selected
      setStep("service");
      repeatHandled.current = true;
    }
  }, [isRepeat, calendars, services, repeatBarberId, repeatServiceTypeId]);

  /* ─── Services for selected barber (Acuity + local DB overrides + local-only) ─── */
  const barberServices = useMemo(() => {
    if (!selectedCalendar) return [];
    const barberId = selectedCalendar.barberId;
    const acuityForCal = services.filter((t) => t.calendarIDs?.includes(selectedCalendar.id));

    // Build override map for this barber: acuity_type_id → local row
    const overrides = new Map<number, typeof dbServices[number]>();
    for (const ds of dbServices) {
      if (ds.barber_id === barberId) overrides.set(ds.acuity_type_id, ds);
    }

    // Apply overrides to Acuity-backed services. Hide if overridden as private.
    const acuityIds = new Set(acuityForCal.map((s) => s.id));
    const merged: Array<AcuityType & { _sortOrder: number }> = acuityForCal
      .filter((s) => {
        const ov = overrides.get(s.id);
        return !ov || ov.is_public !== false;
      })
      .map((s) => {
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

    // Local-only services intentionally NOT exposed to clients either.
    // They cannot be booked because they would not block the slot in Acuity's public scheduler.

    merged.sort((a, b) => (a._sortOrder - b._sortOrder) || a.name.localeCompare(b.name));
    return merged;
  }, [services, dbServices, selectedCalendar]);

  /* ─── Filter add-ons when type changes ─── */
  useEffect(() => {
    if (!selectedType) { setAddons([]); return; }
    setSelectedAddons([]);
    const ids = selectedType.addonIDs || [];
    setAddons(ids.length > 0 ? allAddons.filter((a) => ids.includes(a.id)) : []);
  }, [selectedType, allAddons]);

  /* ─── Load available dates ─── */
  useEffect(() => {
    if (step !== "datetime" || !selectedType || !selectedCalendar) return;
    setLoadingDates(true);
    const months = availabilityMonthKey.split("|").filter(Boolean);
    Promise.all(months.map((month) =>
      acuityProxy(`/availability/dates?appointmentTypeID=${selectedType.id}&calendarID=${selectedCalendar.id}&month=${month}`)
        .then((data) => Array.isArray(data) ? data.map((d: any) => d.date) : [])
        .catch(() => [])
    ))
      .then((monthDates) => setAvailableDates(Array.from(new Set(monthDates.flat())).sort()))
      .catch(() => setAvailableDates([]))
      .finally(() => setLoadingDates(false));
  }, [step, selectedType?.id, selectedCalendar?.id, availabilityMonthKey]);

  /* ─── Durations ─── */
  const totalDurationMinutes = useMemo(() => {
    let dur = selectedType?.duration || 0;
    addons.filter((a) => selectedAddons.includes(a.id)).forEach((a) => { dur += a.duration || 0; });
    return dur;
  }, [selectedType, addons, selectedAddons]);

  const addonExtraMinutes = useMemo(() => {
    let extra = 0;
    addons.filter((a) => selectedAddons.includes(a.id)).forEach((a) => { extra += a.duration || 0; });
    return extra;
  }, [addons, selectedAddons]);

  /* ─── Load time slots ─── */
  useEffect(() => {
    if (step !== "datetime" || !selectedType || !selectedCalendar) return;
    setLoadingTimes(true);
    setSelectedTime(null);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    // Server-side combined availability (Acuity minus local appointments/holds,
    // full service + add-on duration). Fails closed: errors show no times.
    supabase.functions.invoke("public-booking-create", {
      body: {
        action: "list-times",
        appointmentTypeID: selectedType.id,
        calendarID: selectedCalendar.id,
        date: dateStr,
        addonIDs: selectedAddons,
      },
    })
      .then(({ data, error }) => {
        if (error || !Array.isArray(data)) { setTimeSlots([]); return; }
        const cutoff = addMinutes(new Date(), minAdvanceMinutes).getTime();
        setTimeSlots((data as AcuityTimeSlot[]).filter((s) => new Date(s.time).getTime() >= cutoff));
      })
      .catch(() => setTimeSlots([]))
      .finally(() => setLoadingTimes(false));
  }, [step, selectedType, selectedCalendar, format(selectedDate, "yyyy-MM-dd"), selectedAddons.join(","), minAdvanceMinutes]);

  /* ─── Total ─── */
  const serviceTotal = useMemo(() => {
    let sum = parseFloat(selectedType?.price || "0");
    addons.filter((a) => selectedAddons.includes(a.id)).forEach((a) => { sum += parseFloat(a.price || "0"); });
    return sum;
  }, [selectedType, addons, selectedAddons]);

  const grandTotal = useMemo(
    () => serviceTotal + productsTotalCents / 100,
    [serviceTotal, productsTotalCents]
  );

  // Smart-skip products step when there's no inventory.
  const showProductsStep = hasProducts !== false;

  const selectedTypeAddons = useMemo(() => {
    if (!selectedType) return [];
    const ids = selectedType.addonIDs || [];
    return allAddons.filter((a) => ids.includes(a.id));
  }, [selectedType, allAddons]);

  const hasSelectedTypeAddons = selectedTypeAddons.length > 0;
  const nextAfterService: Step = hasSelectedTypeAddons ? "addons" : (showProductsStep ? "products" : "datetime");

  useEffect(() => {
    if (loadingData || step !== "addons" || !selectedType || hasSelectedTypeAddons) return;
    setStep(showProductsStep ? "products" : "datetime");
  }, [loadingData, step, selectedType, hasSelectedTypeAddons, showProductsStep, setStep]);

  /* ─── Submit ─── */
  const hasClient = clientFirst.trim().length > 0 && clientPhone.trim().length > 0;
  const canSubmit = selectedType && selectedCalendar && selectedDate && selectedTime && hasClient;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const servicePriceCents = Math.round(parseFloat(String(selectedType!.price || "0")) * 100);
      const addonsCents = addons
        .filter((a) => selectedAddons.includes(a.id))
        .reduce((s, a) => s + Math.round(parseFloat(a.price || "0") * 100), 0);
      // Server re-validates products + recomputes products_total_cents.
      // We send service+addons+products in totalCents (matches PublicBookingFlow contract).
      const totalCents = servicePriceCents + addonsCents + productsTotalCents;
      const productsPayload = Object.entries(productCart)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ id, qty }));

      // Step 1: ONLY create a draft — NO Acuity row, NO appointments row.
      // The atomic `commit-and-book` step (after payment verification) creates both.
      const { data: prep, error: prepErr } = await supabase.functions.invoke("pay-then-book", {
        body: {
          action: "prepare-draft",
          source: "client_app",
          appointmentTypeID: selectedType!.id,
          calendarID: selectedCalendar!.id,
          datetime: selectedTime,
          firstName: clientFirst.trim(),
          lastName: clientLast.trim(),
          phone: clientPhone.trim(),
          email: clientEmail.trim() || `${clientPhone.trim().replace(/\D/g, "")}@placeholder.local`,
          addonIDs: selectedAddons,
          notes,
          totalCents,
          tipCents: 0,
          clientId: supabaseClientId,
          createdByUserId: user?.id || null,
          products: productsPayload,
        },
      });
      if (prepErr) {
        const taken = await slotTakenMessage(prepErr, String(language || "es").startsWith("es"));
        if (taken) { setSelectedTime(null); setStep("datetime"); throw new Error(taken); }
      }
      if (prepErr || !prep?.draftId) throw new Error(prep?.error || prepErr?.message || t("portal.newAppt.prepError"));

      const nextPayment = {
        draftId: prep.draftId,
        priceCents: servicePriceCents,
        serviceName: selectedType!.name,
      };
      writePersistent(`${BOOKING_KEY}.payment`, nextPayment);
      writePersistent(`${BOOKING_KEY}.step`, "payment");
      setPaymentAppointment(nextPayment);
      setStep("payment");
    } catch (err: any) {
      toast.error(err.message || t("portal.newAppt.bookError"));
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Navigation ─── */
  const goBack = () => {
    if (step === "barber") { clearBookingDraft(); navigate("/app/cliente"); }
    else if (step === "service") setStep("barber");
    else if (step === "addons") setStep("service");
    else if (step === "products") setStep(hasSelectedTypeAddons ? "addons" : "service");
    else if (step === "datetime") {
      if (isRepeat) { clearBookingDraft(); navigate("/app/cliente"); }
      else if (showProductsStep) setStep("products");
      else setStep(hasSelectedTypeAddons ? "addons" : "service");
    }
    else if (step === "summary") setStep("datetime");
    else if (step === "payment") {
      setPaymentAppointment(null);
      toast.error(language === "es" ? "La sesión de pago expiró. Confirma el resumen de nuevo." : "Payment session expired. Confirm the summary again.");
      setStep("summary");
    }
  };

  const recoverStalePayment = () => {
    setPaymentAppointment(null);
    toast.error(language === "es" ? "La sesión de pago expiró. Confirma el resumen de nuevo." : "Payment session expired. Confirm the summary again.");
    setStep("summary");
  };

  const stepTitle = () => {
    switch (step) {
      case "barber": return t("portal.newAppt.stepBarber");
      case "service": return t("portal.newAppt.stepService");
      case "addons": return t("portal.newAppt.stepAddons");
      case "products": return language === "es" ? "¿Algo más?" : "Anything else?";
      case "datetime": return t("portal.newAppt.stepDateTime");
      case "summary": return t("portal.newAppt.stepSummary");
      case "payment": return t("portal.newAppt.stepPayment");
    }
  };

  const jumpToStep = (target: Step) => {
    if (target === step || target === "payment") return;
    setStep(target);
  };

  // Same visual progress + acumulative chips as PublicBookingFlow.
  const flowSteps = useMemo<Step[]>(() => {
    const list: Step[] = ["barber", "service"];
    if (hasSelectedTypeAddons) list.push("addons");
    if (showProductsStep) list.push("products");
    list.push("datetime", "summary", "payment");
    return list;
  }, [hasSelectedTypeAddons, showProductsStep]);

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
    if (productLineItems.length > 0) {
      const totalQty = productLineItems.reduce((sum, p) => sum + p.qty, 0);
      list.push({
        stepKey: "products",
        label: language === "es" ? `${totalQty} producto${totalQty > 1 ? "s" : ""}` : `${totalQty} product${totalQty > 1 ? "s" : ""}`,
        detail: `$${(productsTotalCents / 100).toFixed(2)}`,
      });
    }
    if (selectedTime) {
      list.push({ stepKey: "datetime", label: format(new Date(selectedTime), "EEE d · h:mm a", { locale: dfLocale }) });
    }
    return list;
  }, [selectedCalendar, selectedType, selectedAddons.length, productLineItems, productsTotalCents, selectedTime, dfLocale, language]);

  return (
    <div className="min-h-screen flex flex-col mx-auto w-full"
      style={{ maxWidth: 430, background: "var(--bg-base)", color: "var(--text-primary)", paddingTop: "env(safe-area-inset-top, 0px)" }}>

      {/* Header */}
      <header className="sticky top-0 z-30 px-4 pt-14 pb-3" style={{ background: "var(--bg-base)" }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={goBack} className="p-1 -ml-1">
            <ChevronLeft size={24} style={{ color: "var(--accent-color)" }} />
          </button>
          <button onClick={() => { clearBookingDraft(); navigate("/app/cliente"); }} className="p-1 -mr-1">
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

      <div className="flex-1 overflow-y-auto">

        {step === "barber" && (
          <div className="px-4 pt-4 pb-32">
            {loadingBarbers ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {calendars.map((cal) => (
                  <BarberPickerRow
                    key={cal.id}
                    name={cal.name}
                    avatarUrl={cal.avatarUrl || null}
                    isSelected={selectedCalendar?.id === cal.id}
                    subtitle={t("portal.newAppt.subtitleBarber")}
                    selectLabel={t("portal.newAppt.selectLabel")}
                    onClick={() => { if (selectedCalendar?.id === cal.id) setSelectedCalendar(null); else { setSelectedCalendar(cal); setStep("service"); } }}
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
              <p className="text-center py-12 text-sm" style={{ color: "var(--text-secondary)" }}>{t("portal.newAppt.noServices")}</p>
            ) : (
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {barberServices.map((type) => {
                  const isSelected = selectedType?.id === type.id;
                  const bColor = selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)";
                  const durationLabel = type.duration >= 60
                    ? `${Math.floor(type.duration / 60)} hr${type.duration % 60 > 0 ? `, ${type.duration % 60} min` : ""}`
                    : `${type.duration} min`;
                  return (
                    <button key={type.id} onClick={() => { if (isSelected) setSelectedType(null); else { setSelectedType(type); setSelectedAddons([]); const hasAddons = (type.addonIDs || []).some((id) => allAddons.some((a) => a.id === id)); const next: Step = hasAddons ? "addons" : (showProductsStep ? "products" : "datetime"); setTimeout(() => setStep(next), 350); } }}
                      className="w-full flex items-start gap-3 py-5 px-1 transition-all text-left">
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>{type.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{durationLabel}</p>
                        {type.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>{type.description}</p>}
                        <p className="text-sm font-bold mt-1.5" style={{ color: "var(--text-primary)" }}>${type.price}</p>
                      </div>
                      {isSelected ? (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1" style={{ background: bColor }}>
                          <Check className="icon-extrabold" size={18} color="#fff" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1" style={{ border: "1.5px solid var(--border)" }}>
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
          const typeAddons = selectedTypeAddons;
          return (
            <div className="px-4 pt-2 pb-32">
              <div className="flex items-center gap-2 mb-4 px-1">
                <Scissors size={14} style={{ color: "var(--text-secondary)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{selectedType?.name}</span>
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>${selectedType?.price}</span>
              </div>
              {typeAddons.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("portal.newAppt.noAddons")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {typeAddons.map((addon) => {
                    const isChecked = selectedAddons.includes(addon.id);
                    return (
                      <button key={addon.id}
                        onClick={() => setSelectedAddons((prev) => isChecked ? prev.filter((id) => id !== addon.id) : [...prev, addon.id])}
                        className="w-full flex items-center justify-between py-3 px-4 rounded-xl text-sm transition-all"
                        style={{ background: isChecked ? `${bColor}15` : "var(--bg-surface)", border: isChecked ? `1.5px solid ${bColor}40` : "1.5px solid transparent" }}>
                        <div className="flex-1 text-left">
                          <span className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>{addon.name}</span>
                          {addon.duration > 0 && <span className="text-[11px] ml-2" style={{ color: "var(--text-tertiary)" }}>+{addon.duration} min</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                            {parseFloat(addon.price) > 0 ? `+$${addon.price}` : t("portal.newAppt.free")}
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
              {/* Continue handled by the global sticky bottom CTA — always active. */}
            </div>
          );
        })()}

        {/* ═══ STEP 3.5: MINI-SHOP PRODUCTS ═══ */}
        {step === "products" && (
          <div className="px-4 pt-4 pb-32">
            <ProductsStep
              cart={productCart}
              onChange={setProductCart}
              onContinue={() => setStep("datetime")}
              accent="var(--accent-color)"
              isEs={language === "es"}
              hideContinue
              onTotalChange={(cents, items) => {
                setProductsTotalCents(cents);
                setProductLineItems(items);
              }}
            />
          </div>
        )}

        {/* ═══ STEP 4: DATE & TIME ═══ */}
        {step === "datetime" && (
          <div className="pb-32">
            <div className="flex items-center justify-between px-4 pt-2 pb-3">
              {selectedCalendar && (
                <button onClick={() => setStep("barber")} className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                  style={{ border: "1px solid var(--border)" }}>
                  {selectedCalendar.avatarUrl ? (
                    <img loading="lazy" decoding="async" src={selectedCalendar.avatarUrl} alt={selectedCalendar.name} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: `${getBarberColor(selectedCalendar.name)}20` }}>
                      <User size={12} style={{ color: getBarberColor(selectedCalendar.name) }} />
                    </div>
                  )}
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{selectedCalendar.name.split(" ")[0]}</span>
                  <ChevronDown size={14} style={{ color: "var(--text-tertiary)" }} />
                </button>
              )}
              <button onClick={() => { goToDate(new Date()); setMonthViewOpen(false); }}
                className="w-10 h-10 flex items-center justify-center rounded-full" style={{ border: "1px solid var(--border)" }}>
                <CalendarCheck size={18} style={{ color: "var(--text-secondary)" }} />
              </button>
            </div>

            {/* Month title */}
            <div className="px-4 pb-2">
              <button onClick={() => { setMonthViewOpen(!monthViewOpen); if (!monthViewOpen) setMonthViewDate(selectedDate); }}
                className="flex items-center gap-1.5">
                <span className="text-lg font-bold capitalize" style={{ color: "var(--text-primary)" }}>
                  {format(selectedDate, "MMMM yyyy", { locale: dfLocale })}
                </span>
                <ChevronDown size={16} className="transition-transform duration-200"
                  style={{ color: "var(--text-tertiary)", transform: monthViewOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
              </button>
            </div>

            {/* Month Grid */}
            <AnimatePresence>
              {monthViewOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden px-4">
                  <ClientMonthGrid monthDate={monthViewDate} selectedDate={selectedDate} availableDates={availableDates}
                    isDateAllowed={isDateAllowed} dfLocale={dfLocale}
                    onSelectDate={(d) => { goToDate(d); setMonthViewOpen(false); }} onChangeMonth={setMonthViewDate} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Week Row */}
            {!monthViewOpen && (
              <div className="px-2 pb-4" style={{ borderBottom: "1px solid var(--divider)" }}>
                <div className="flex items-center gap-1">
                  <button onClick={() => goToWeek(-1)} aria-label={t("portal.newAppt.weekPrev")}
                    className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                    <ChevronLeft size={20} style={{ color: "var(--text-secondary)" }} />
                  </button>
                  <div className="flex-1 overflow-hidden"
                    onTouchStart={(e) => { weekTouchRef.current = { startX: e.touches[0].clientX }; }}
                    onTouchEnd={(e) => {
                      const diff = (e.changedTouches[0]?.clientX || 0) - weekTouchRef.current.startX;
                      if (Math.abs(diff) > 50) { if (diff > 0) goToWeek(-1); else goToWeek(1); }
                    }}>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div key={weekStart.toISOString()}
                        initial={{ x: swipeDir * 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                        exit={{ x: swipeDir * -120, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 600, damping: 22, mass: 0.6 }}
                        className="flex items-center justify-around">
                        {weekDays.map((day, i) => {
                          const selected = isSameDay(day, selectedDate);
                          const todayDay = isToday(day);
                          const allowed = isDateAllowed(day);
                          const dateStr = format(day, "yyyy-MM-dd");
                          const available = allowed && (availableDates.length === 0 || availableDates.includes(dateStr));
                          const bColor = selectedCalendar ? getBarberColor(selectedCalendar.name) : "var(--accent-color)";
                          const dayName = format(day, "EEEE", { locale: dfLocale });
                          return (
                            <button key={i} onClick={() => { if (available) setSelectedDate(day); }}
                              disabled={!available}
                              className="flex flex-col items-center gap-1.5 py-1"
                              style={{ opacity: available ? 1 : 0.25, flex: 1 }}>
                              <span className="flex items-center justify-center text-base font-bold rounded-full"
                                style={{
                                  width: 44, height: 44,
                                  background: selected ? bColor : "transparent",
                                  color: selected ? "#fff" : todayDay ? bColor : "var(--text-primary)",
                                  border: todayDay && !selected ? "2px solid var(--text-tertiary)" : "2px solid transparent",
                                }}>
                                {format(day, "d")}
                              </span>
                              <span className="text-[10px] font-medium capitalize"
                                style={{ color: selected ? bColor : !allowed ? "var(--text-tertiary)" : "var(--text-secondary)" }}>
                                {dayName}
                              </span>
                            </button>
                          );
                        })}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  <button onClick={() => goToWeek(1)} aria-label={t("portal.newAppt.weekNext")}
                    className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                    <ChevronRight size={20} style={{ color: "var(--text-secondary)" }} />
                  </button>
                </div>
              </div>
            )}

            {/* Time Slots */}
            <div className="px-4 pt-4 space-y-2">
              {loadingTimes || loadingDates ? (
                <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
              ) : timeSlots.length === 0 ? (
                <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>{t("portal.newAppt.noTimes")}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((slot) => (
                    <button key={slot.time}
                      onClick={() => { setSelectedTime(slot.time); setStep("summary"); }}
                      className="py-3 rounded-xl text-[14px] font-semibold text-center active:scale-[0.96]"
                      style={{ border: "1.5px solid var(--border)", color: "var(--text-primary)" }}>
                      {format(new Date(slot.time), "h:mm a")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ STEP 5: SUMMARY ═══ */}
        {step === "summary" && (
          <div className="px-4 pt-4 pb-40">
            <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-surface)", border: "0.5px solid var(--border)" }}>
              {/* Barber */}
              {selectedCalendar && (
                <button onClick={() => setStep("barber")} className="w-full flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid var(--divider)" }}>
                  {selectedCalendar.avatarUrl ? (
                    <img loading="lazy" decoding="async" src={selectedCalendar.avatarUrl} alt={selectedCalendar.name} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${getBarberColor(selectedCalendar.name)}20` }}>
                      <User size={14} style={{ color: getBarberColor(selectedCalendar.name) }} />
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{selectedCalendar.name}</span>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{t("portal.newAppt.change")}</span>
                </button>
              )}
              {/* Service */}
              {selectedType && (
                <button onClick={() => setStep("service")} className="w-full px-4 py-3 text-left" style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Scissors size={14} style={{ color: "var(--text-tertiary)" }} />
                      {/* service.name is Acuity-sourced; intentionally Spanish-only in v1.0 */}
                      {/* (Camuy market). Add translation layer in v2.0 if expanding. */}
                      <span className="text-[14px]" style={{ color: "var(--text-primary)" }}>{selectedType.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>${selectedType.price}</span>
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{t("portal.newAppt.change")}</span>
                    </div>
                  </div>
                  <p className="text-[12px] mt-0.5 ml-6" style={{ color: "var(--text-tertiary)" }}>{selectedType.duration} min</p>
                </button>
              )}
              {/* Add-ons */}
              {addons.filter((a) => selectedAddons.includes(a.id)).map((addon) => (
                <div key={addon.id} className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Plus size={12} style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{addon.name}</span>
                  </div>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {parseFloat(addon.price) > 0 ? `+$${addon.price}` : t("portal.newAppt.free")}
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
                      {format(selectedDate, "EEE, d MMM", { locale: dfLocale })} - {format(new Date(selectedTime), "h:mm a")}
                    </span>
                  </div>
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{t("portal.newAppt.change")}</span>
                </button>
              )}
              {/* Client */}
              {editingContact ? (
                <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <User size={14} style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{t("portal.newAppt.editContact")}</span>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder={t("portal.newAppt.phonePlaceholder")}
                      className="w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                      style={{
                        background: "var(--bg-surface-2)",
                        color: "var(--text-primary)",
                        border: "0.5px solid var(--border)",
                      }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (supabaseClientId && clientPhone.trim()) {
                            await supabase.from("clients").update({ phone: clientPhone.trim() }).eq("id", supabaseClientId);
                          }
                          setEditingContact(false);
                        }}
                        className="flex-1 py-2 rounded-lg text-[12px] font-semibold"
                        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
                      >
                        {t("portal.newAppt.saveContact")}
                      </button>
                      <button
                        onClick={() => setEditingContact(false)}
                        className="px-4 py-2 rounded-lg text-[12px]"
                        style={{ color: "var(--text-tertiary)", border: "0.5px solid var(--border)" }}
                      >
                        {t("portal.newAppt.cancelContact")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setEditingContact(true)}
                  className="w-full px-4 py-3 text-left"
                  style={{
                    borderBottom: "1px solid var(--divider)",
                    ...(! clientPhone.trim() ? {
                      border: "0.5px solid #ef4444",
                      borderBottom: "0.5px solid #ef4444",
                    } : {}),
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <User size={14} style={{ color: !clientPhone.trim() ? "#ef4444" : "var(--text-tertiary)" }} />
                      <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        {clientFirst} {clientLast}{clientPhone.trim() ? ` · ${clientPhone}` : ""}
                      </span>
                    </div>
                    <span className="text-[11px]" style={{ color: !clientPhone.trim() ? "#ef4444" : "var(--text-tertiary)" }}>{t("portal.newAppt.edit")}</span>
                  </div>
                  {!clientPhone.trim() && (
                    <p className="text-[11px] mt-1 ml-6" style={{ color: "#ef4444" }}>
                      {t("portal.newAppt.infoRequired")}
                    </p>
                  )}
                </button>
              )}
              {/* Mini-shop products (when added) */}
              {productLineItems.map((line) => (
                <button
                  key={line.id}
                  onClick={() => setStep("products")}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left"
                  style={{ borderBottom: "1px solid var(--divider)" }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Plus size={12} style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {line.name}{line.qty > 1 ? ` ×${line.qty}` : ""}
                    </span>
                  </div>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    ${(line.line_total_cents / 100).toFixed(2)}
                  </span>
                </button>
              ))}
              {/* Total */}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>{t("portal.newAppt.total")}</span>
                  <span className="text-xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>${grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="rounded-2xl overflow-hidden mb-3 px-4 py-3" style={{ background: "var(--bg-surface)", border: "0.5px solid var(--border)" }}>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={t("portal.newAppt.notesPlaceholder")}
                className="bg-transparent border-0 p-0 resize-none min-h-[50px] focus-visible:ring-0 text-[13px]"
                style={{ color: "var(--text-primary)" }} />
            </div>

            {/* Send Confirmation */}
            <div className="rounded-2xl overflow-hidden px-4 py-3 flex items-center justify-between" style={{ background: "var(--bg-surface)", border: "0.5px solid var(--border)" }}>
              <p className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>{t("portal.newAppt.sendConfirmation")}</p>
              <Switch checked={sendConfirmation} onCheckedChange={setSendConfirmation} />
            </div>
          </div>
        )}

        {/* ═══ STEP 6: PAYMENT ═══ */}
        {step === "payment" && (
          <div className="px-4 pt-4" style={{ paddingBottom: "calc(128px + env(safe-area-inset-bottom, 0px))" }}>
            {paymentAppointment ? (
              <PaymentStep
                key={paymentAppointment.draftId}
                draftId={paymentAppointment.draftId}
                basePriceCents={(() => {
                  let cents = paymentAppointment.priceCents;
                  addons
                    .filter((a) => selectedAddons.includes(a.id))
                    .forEach((a) => {
                      cents += Math.round(parseFloat(a.price || "0") * 100);
                    });
                  cents += productsTotalCents;
                  return cents;
                })()}
                serviceName={paymentAppointment.serviceName}
                lineItems={(() => {
                  const lines: { key: string; label: string; unitCents: number }[] = [
                    {
                      key: `svc-${selectedType?.id ?? "main"}`,
                      label: paymentAppointment.serviceName,
                      unitCents: paymentAppointment.priceCents,
                    },
                  ];
                  addons
                    .filter((a) => selectedAddons.includes(a.id))
                    .forEach((a) => {
                      lines.push({
                        key: `addon-${a.id}`,
                        label: a.name,
                        unitCents: Math.round(parseFloat(a.price || "0") * 100),
                      });
                    });
                  productLineItems.forEach((p) => {
                    lines.push({
                      key: `prod-${p.id}`,
                      label: p.qty > 1 ? `${p.name} ×${p.qty}` : p.name,
                      unitCents: p.line_total_cents,
                    });
                  });
                  return lines;
                })()}
                accent="var(--accent-color)"
                isEs={language === "es"}
                phone={normalizePhone10(clientPhone)}
                email={clientEmail || undefined}
                barberName={selectedCalendar?.name}
                startsAt={selectedTime ?? undefined}
                flowSource="client_portal"
                onPaid={() => {
                  clearBookingDraft();
                  setSuccessSheetOpen(true);
                }}
                onAbandon={() => {
                  clearBookingDraft();
                  setPaymentAppointment(null);
                  navigate("/app/cliente");
                }}
                avoidBottomNav
              />
            ) : (
              <div className="min-h-[320px] flex flex-col items-center justify-center text-center space-y-4">
                <AlertTriangle size={36} style={{ color: "var(--accent-color)" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {language === "es" ? "La sesión de pago expiró." : "Payment session expired."}
                </p>
                <button
                  type="button"
                  onClick={recoverStalePayment}
                  className="w-full rounded-xl py-3 text-sm font-bold active:scale-[0.98]"
                  style={{ background: "var(--accent-color)", color: "var(--cta-fg)", touchAction: "manipulation" }}
                >
                  {language === "es" ? "Volver al resumen" : "Back to summary"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ BOTTOM CTA ═══ */}
      {step !== "datetime" && step !== "payment" && (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-30"
          style={{ background: "var(--bg-base)", borderTop: "1px solid var(--divider)" }}>
          {step === "summary" && selectedType && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("portal.newAppt.total")}</span>
              <span className="font-black" style={{ color: "var(--accent-color)", fontFamily: "Montserrat, sans-serif" }}>
                ${grandTotal.toFixed(2)}
              </span>
            </div>
          )}
          {(() => {
            // Steps where the CTA is always active and advances to the next step
            // (no selection required — products and addons are optional).
            const isOptionalStep = step === "addons" || step === "products";
            const isActive =
              isOptionalStep ||
              (step === "barber" && !!selectedCalendar) ||
              (step === "service" && !!selectedType) ||
              (step === "summary" && canSubmit);
            return (
              <button
                onClick={() => {
                  if (step === "barber" && selectedCalendar) setStep("service");
                  else if (step === "service" && selectedType) setStep(nextAfterService);
                  else if (step === "addons") setStep(showProductsStep ? "products" : "datetime");
                  else if (step === "products") setStep("datetime");
                  else if (step === "summary") handleSubmit();
                }}
                disabled={
                  (step === "barber" && !selectedCalendar) ||
                  (step === "service" && !selectedType) ||
                  (step === "summary" && (!canSubmit || submitting))
                }
                className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                style={{
                  background: isActive ? "var(--cta-bg)" : "var(--bg-surface-2)",
                  color: isActive ? "var(--cta-fg)" : "var(--text-tertiary)",
                  opacity: submitting ? 0.7 : 1,
                }}>
                {submitting && <Loader2 size={18} className="animate-spin" />}
                {step === "summary" ? t("portal.newAppt.bookAndPay") : t("portal.newAppt.continue")}
              </button>
            );
          })()}
        </div>
      )}

      {/* ═══ SUCCESS POPUP ═══ */}
      <AnimatePresence>
        {successSheetOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
            onClick={() => { setSuccessSheetOpen(false); navigate("/app/cliente"); }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] flex flex-col items-center gap-3 px-6 py-7"
              style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)" }}
            >
              <span className="text-[11px] font-semibold tracking-wide uppercase"
                style={{ background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)", borderRadius: 10, padding: "4px 14px" }}>
                {t("portal.newAppt.successBadge")}
              </span>
              <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: [0, 1.2, 1], rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, duration: 0.6 }} className="my-2">
                <CheckCircle className="icon-bold" size={56} color="#22c55e" />
              </motion.div>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                className="text-[22px] font-black text-center uppercase" style={{ color: "#111111", letterSpacing: "-1px" }}>
                {t("portal.newAppt.successTitle")}
              </motion.p>
              <p className="text-[13px] text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
                {t("portal.newAppt.successDesc")}
              </p>
              <button onClick={() => { setSuccessSheetOpen(false); navigate("/app/cliente"); }}
                className="w-full py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform mt-3"
                style={{ background: "#111111", color: "#ffffff", borderRadius: "var(--radius-control)" }}>
                {t("portal.newAppt.successButton")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Month Grid ─── */
function ClientMonthGrid({ monthDate, selectedDate, availableDates, isDateAllowed, onSelectDate, onChangeMonth, dfLocale }: {
  monthDate: Date; selectedDate: Date; availableDates: string[];
  isDateAllowed: (d: Date) => boolean;
  onSelectDate: (d: Date) => void; onChangeMonth: (d: Date) => void;
  dfLocale: typeof es;
}) {
  const dayLabels = dfLocale === enUS ? ["S", "M", "T", "W", "T", "F", "S"] : ["D", "L", "M", "M", "J", "V", "S"];
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
          {format(monthDate, "MMMM yyyy", { locale: dfLocale })}
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
          const allowed = isDateAllowed(day);
          const available = inMonth && allowed && (availableDates.length === 0 || availableDates.includes(dateStr));
          return (
            <button key={i} onClick={() => { if (available) onSelectDate(day); }}
              disabled={!available}
              className="flex items-center justify-center py-1.5"
              style={{ opacity: inMonth ? (available ? 1 : 0.2) : 0.1 }}>
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
