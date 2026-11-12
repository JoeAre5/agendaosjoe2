import { slotTakenMessage } from "@/lib/slotTaken";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Loader2,
  ChevronLeft,
  Check,
  Plus,
  CalendarDays,
  Scissors,
  User,
  CheckCircle2,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { BookingProgress, type BookingProgressChip } from "@/components/site/booking/BookingProgress";
import { parseName } from "@/lib/nameParser";
import { getPendingBookingUrl } from "@/lib/pendingBooking";
import {
  format,
  addDays,
  addMinutes,
  startOfWeek,
  startOfDay,
  isSameDay,
  isToday,
  startOfMonth,
  endOfMonth,
  getDay,
  isSameMonth,
  addMonths,
  subMonths,
} from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { ClientMatchConfirmDialog } from "@/components/ClientMatchConfirmDialog";
import { useBooking } from "@/contexts/BookingContext";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import { BarberPickerRow } from "@/components/BarberPickerRow";
import { PaymentStep } from "@/components/site/booking/PaymentStep";
import { ProductsStep, type ProductCart, type ProductLineItem } from "@/components/site/booking/ProductsStep";
import { normalizePhone10 } from "@/lib/phone";

// Ids are Acuity numbers on Acuity shops and local uuids on native shops.
type CatalogId = number | string;

/* ───────── Draft persistence (30-min TTL) ─────────
   Survives accidental close, tab switch, Safari background, refresh.
   Persists the FORM (selections + contact) but NEVER the payment step —
   payment redirects to Stripe/PayPal/ATH and any stale draftId would be
   invalid on return. */
const DRAFT_KEY = "agendaos.publicBooking.draft.v1";
const DRAFT_TTL_MS = 30 * 60 * 1000;

interface PersistedDraft {
  savedAt: number;
  step: Step;
  selectedCal: Calendar | null;
  selectedService: Service | null;
  selectedAddons: CatalogId[];
  productCart: ProductCart;
  selectedDateIso: string;
  selectedTime: string | null;
  nameInput: string;
  phone: string;
  email: string;
}

function readDraft(): PersistedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as PersistedDraft;
    if (!d?.savedAt || Date.now() - d.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    // Never restore terminal steps.
    if (d.step === "payment" || d.step === "success") return null;
    return d;
  } catch {
    return null;
  }
}

function writeDraft(d: Omit<PersistedDraft, "savedAt">) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch { /* quota / private mode */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

/* ───────── Types ───────── */
interface Calendar {
  id: CatalogId;
  name: string;
  avatarUrl: string | null;
  barberId: string | null;
}
interface Service {
  id: CatalogId;
  name: string;
  duration: number;
  price: string;
  category: string;
  description: string;
  calendarIDs: CatalogId[];
  addonIDs: CatalogId[];
}
interface Addon {
  id: CatalogId;
  name: string;
  duration: number;
  price: string;
}
interface TimeSlot {
  time: string;
  slotsAvailable: number;
}

type Step = "barber" | "service" | "addons" | "products" | "datetime" | "contact" | "payment" | "success";

/* ───────── Edge function helper ───────── */
async function callPublic(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("public-booking-create", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ───────── Component ───────── */
export function PublicBookingFlow() {
  const { isOpen, preselectedBarberSlug, openNonce, closeBooking } = useBooking();
  const { language } = useTranslation();
  const { resolvedTheme } = usePreferences();
  const isEs = language === "es";

  const [step, setStep] = useState<Step>("barber");
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [allAddons, setAllAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(false);

  // Selections
  const [selectedCal, setSelectedCal] = useState<Calendar | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<CatalogId[]>([]);
  const [productCart, setProductCart] = useState<ProductCart>({});
  const [productLineItems, setProductLineItems] = useState<ProductLineItem[]>([]);
  const [productsTotalCents, setProductsTotalCents] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  // Datetime
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  // Months we've actually fetched availability for. A day in a month that
  // hasn't been fetched yet must NOT be greyed out (otherwise swiping the week
  // strip into the next month shows "nothing available").
  const [loadedMonths, setLoadedMonths] = useState<string[]>([]);
  // Month(s) currently visible in the week strip, reported by DateTimeStep.
  const [browsedMonths, setBrowsedMonths] = useState<string[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [monthDate, setMonthDate] = useState<Date>(new Date());

  // Contact — single full-name input. We parse it into greeting/first/last on submit.
  const [nameInput, setNameInput] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Smart-skip: whether the products step has anything to show. Set to `false`
  // by the products precheck below so the flow bypasses that step entirely
  // when there's no inventory. `null` = unknown yet (treat as "show").
  const [hasProducts, setHasProducts] = useState<boolean | null>(null);

  // Draft (created BEFORE payment — no Acuity row exists until commit)
  const [draftData, setDraftData] = useState<{
    draftId: string;
    barberName: string;
    serviceName: string;
    startsAt: string;
    price: string;
    priceCents: number;
  } | null>(null);

  // Success (populated AFTER payment commit)
  const [successData, setSuccessData] = useState<{
    isReturning: boolean;
    returningName: string | null;
    cardOnFile: { brand: string | null; last4: string | null } | null;
    barberName: string;
    serviceName: string;
    startsAt: string;
    price: string;
  } | null>(null);

  // Phone-only match prompt (returned by pay-then-book prepare-draft)
  const [phoneMatch, setPhoneMatch] = useState<{ clientId: string; displayName: string | null } | null>(null);
  const [confirmedClientId, setConfirmedClientId] = useState<string | null>(null);
  // Set when the user explicitly chooses "Mantener separado" — tells the
  // server to bypass the phone-match guard and create a brand-new profile.
  const [forceNewProfile, setForceNewProfile] = useState(false);

  /* ─── DRY reset helper ─────────────────────────────────────────────
     Centralises every "wipe the booking flow" trigger so we never drift
     between mount, openNonce changes, BFCache restores, and close. */
  const resetFlowState = useCallback((opts?: { keepCalendar?: boolean }) => {
    setStep("barber");
    if (!opts?.keepCalendar) setSelectedCal(null);
    setSelectedService(null);
    setSelectedAddons([]);
    setProductCart({});
    setProductLineItems([]);
    setProductsTotalCents(0);
    setSelectedTime(null);
    setSubmitError(null);
    setSuccessData(null);
    setDraftData(null);
  }, []);

  /* ─── Reset on close ─── */
  useEffect(() => {
    if (!isOpen) {
      // Wait for exit animation before resetting
      const t = setTimeout(() => resetFlowState(), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen, resetFlowState]);

  /* ─── Force reset on every fresh open ───────────────────────────────
     Critical for the ATH/PayPal cancel case: the user is redirected away
     from the modal and never triggers closeBooking(), so React state stays
     at step="payment" with a stale draftId. openNonce bumps on every
     openBooking() call, guaranteeing a clean Step 1 re-entry. The
     `keepCalendar:true` flag lets the preselectedBarberSlug effect take
     over without flicker. */
  useEffect(() => {
    if (openNonce === 0) return;
    const pendingUrl = getPendingBookingUrl();
    if (pendingUrl) {
      closeBooking();
      window.location.assign(pendingUrl);
      return;
    }
    const draft = readDraft();
    if (draft) {
      // Restore prior progress — user closed/backgrounded within 30 min.
      setStep(draft.step);
      setSelectedCal(draft.selectedCal);
      setSelectedService(draft.selectedService);
      setSelectedAddons(draft.selectedAddons || []);
      setProductCart(draft.productCart || {});
      setSelectedDate(draft.selectedDateIso ? new Date(draft.selectedDateIso) : new Date());
      setSelectedTime(draft.selectedTime);
      setNameInput(draft.nameInput || "");
      setPhone(draft.phone || "");
      setEmail(draft.email || "");
      setSubmitError(null);
      setDraftData(null);
      setSuccessData(null);
      return;
    }
    resetFlowState({ keepCalendar: true });
  }, [openNonce, resetFlowState]);

  /* ─── Persist draft on every meaningful change ─────────────────────
     30-min TTL. Skip when modal is closed or on payment/success steps. */
  useEffect(() => {
    if (!isOpen) return;
    if (step === "payment" || step === "success") return;
    writeDraft({
      step,
      selectedCal,
      selectedService,
      selectedAddons,
      productCart,
      selectedDateIso: selectedDate.toISOString(),
      selectedTime,
      nameInput,
      phone,
      email,
    });
  }, [isOpen, step, selectedCal, selectedService, selectedAddons, productCart, selectedDate, selectedTime, nameInput, phone, email]);

  /* ─── Clear draft once we've committed to payment/success ─── */
  useEffect(() => {
    if (step === "success") clearDraft();
  }, [step]);

  /* ─── BFCache restore guard ──────────────────────────────────────────
     iOS Safari aggressively caches the JS heap when redirected away
     (Stripe Checkout, PayPal). If restored from BFCache, the modal can
     re-mount at step="payment" with an expired draftId. Detect via
     `pageshow.persisted === true` and force the modal back to Step 1. */
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      resetFlowState();
      setSubmitError(
        isEs
          ? "La sesión de pago expiró. Empieza de nuevo."
          : "Payment session expired. Please start again.",
      );
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [isEs, resetFlowState]);

  /* ─── Initial data load ─── */
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setHasProducts(null);
    Promise.all([
      callPublic({ action: "list-calendars" }),
      callPublic({ action: "list-services" }),
      callPublic({ action: "list-addons" }),
      callPublic({ action: "list-products" }).catch(() => []),
    ])
      .then(([cals, svcs, addons, prods]) => {
        setCalendars(cals as Calendar[]);
        setServices(svcs as Service[]);
        setAllAddons(addons as Addon[]);
        // Smart-skip: if list-products returns empty or all out-of-stock,
        // bypass the products step entirely (it stops being part of the
        // flow). The ProductsStep itself remains the source of truth for
        // rendering when there IS inventory.
        const list = (Array.isArray(prods) ? prods : []) as Array<{ stock_count?: number }>;
        const anyInStock = list.some((p) => (p.stock_count ?? 0) > 0);
        setHasProducts(anyInStock);
      })
      .catch((e) => {
        setSubmitError((e as Error).message);
        setHasProducts(false);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  /* ─── Preselected barber ─── */
  useEffect(() => {
    if (!isOpen || !preselectedBarberSlug || calendars.length === 0 || selectedCal) return;
    const match = calendars.find((c) =>
      c.name.toLowerCase().includes(preselectedBarberSlug.toLowerCase())
    );
    if (match) {
      setSelectedCal(match);
      setStep("service");
    }
  }, [isOpen, preselectedBarberSlug, calendars, selectedCal]);

  /* ─── Services for selected barber, grouped by category ─── */
  const servicesByCategory = useMemo(() => {
    if (!selectedCal) return new Map<string, Service[]>();
    const filtered = services.filter((s) => s.calendarIDs?.includes(selectedCal.id));
    const map = new Map<string, Service[]>();
    filtered.forEach((s) => {
      const cat = s.category || (isEs ? "Otros" : "Other");
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    });
    return map;
  }, [services, selectedCal, isEs]);

  /* ─── Add-ons for selected service ─── */
  const serviceAddons = useMemo(() => {
    if (!selectedService) return [];
    const ids = selectedService.addonIDs || [];
    return allAddons.filter((a) => ids.includes(a.id));
  }, [selectedService, allAddons]);

  /* ─── Available dates ─── */
  // Fetch availability for both the selected month and the month being browsed
  // in the expanded month view. Without this, navigating to the next month in
  // the month grid leaves every day greyed out (stale availableDates).
  useEffect(() => {
    if (step !== "datetime" || !selectedService || !selectedCal) return;
    const months = new Set<string>();
    months.add(format(selectedDate, "yyyy-MM"));
    if (monthOpen) months.add(format(monthDate, "yyyy-MM"));
    browsedMonths.forEach((m) => months.add(m));
    const list = Array.from(months);
    Promise.all(
      list.map((month) =>
        callPublic({
          action: "list-dates",
          appointmentTypeID: selectedService.id,
          calendarID: selectedCal.id,
          month,
        })
          .then((dates) => ((dates as { date: string }[]) || []).map((d) => d.date))
          .catch(() => null),
      ),
    )
      .then((all) => {
        const ok = list.filter((_, i) => all[i] !== null);
        setLoadedMonths(ok);
        setAvailableDates(
          Array.from(new Set(all.flatMap((a) => a || []))).sort(),
        );
      })
      .catch(() => {
        setLoadedMonths([]);
        setAvailableDates([]);
      });
  }, [step, selectedService, selectedCal, format(selectedDate, "yyyy-MM"), monthOpen, format(monthDate, "yyyy-MM"), browsedMonths.join(",")]);

  /* ─── Time slots ─── */
  useEffect(() => {
    if (step !== "datetime" || !selectedService || !selectedCal) return;
    setLoadingTimes(true);
    setSelectedTime(null);
    callPublic({
      action: "list-times",
      appointmentTypeID: selectedService.id,
      calendarID: selectedCal.id,
      date: format(selectedDate, "yyyy-MM-dd"),
      addonIDs: selectedAddons,
    })
      .then((slots) => {
        const cutoff = addMinutes(new Date(), 60).getTime(); // 1 hr min advance
        const arr = (slots as TimeSlot[]) || [];
        setTimeSlots(arr.filter((s) => new Date(s.time).getTime() >= cutoff));
      })
      .catch(() => setTimeSlots([]))
      .finally(() => setLoadingTimes(false));
  }, [step, selectedService, selectedCal, format(selectedDate, "yyyy-MM-dd"), selectedAddons.join(",")]);

  /* ─── Submit ─── */
  const handleSubmit = async () => {
    const parsed = parseName(nameInput);
    if (!selectedCal || !selectedService || !selectedTime || !parsed.firstName || !phone.trim() || !email.trim()) return;
    // Lightweight email shape check — server does the strict validation.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setSubmitError(isEs ? "Email inválido" : "Invalid email");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const priceCents = Math.round(parseFloat(String(selectedService.price || "0")) * 100);
      const addonsCents = allAddons
        .filter((a) => selectedAddons.includes(a.id))
        .reduce((sum, a) => sum + Math.round(parseFloat(a.price || "0") * 100), 0);
      const productLines = Object.entries(productCart)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ id, qty }));
      const totalCents = priceCents + addonsCents + productsTotalCents;
      // Step 1: ONLY create a draft. NO Acuity appointment yet. NO DB row.
      // Acuity is called atomically inside `commit-and-book` AFTER payment is verified.
      const { data: prep, error: prepErr } = await supabase.functions.invoke("pay-then-book", {
        body: {
          action: "prepare-draft",
          source: "public_site",
          appointmentTypeID: selectedService.id,
          calendarID: selectedCal.id,
          datetime: selectedTime,
          firstName: parsed.firstName,
          lastName: parsed.lastName ?? "",
          fullName: parsed.fullName,
          greetingName: parsed.greetingName,
          phone: phone.trim(),
          email: email.trim(),
          addonIDs: selectedAddons,
          notes: "",
          totalCents,
          tipCents: 0,
          products: productLines,
          confirmedClientId: confirmedClientId || undefined,
          // Public/client booking flow: never block on phone-only match. The
          // match prompt is an admin/barber tool. For a guest customer we
          // always proceed, even if it means a duplicate profile.
          forceNewProfile: true,
        },
      });
      if (!prepErr && (prep as any)?.requiresPhoneConfirm) {
        // Server says: phone matches an existing profile, ask the user before continuing.
        setPhoneMatch((prep as any).match);
        setSubmitting(false);
        return;
      }
      if (prepErr) {
        const taken = await slotTakenMessage(prepErr, isEs);
        if (taken) throw new Error(taken);
      }
      if (prepErr || !prep?.draftId) throw new Error(prep?.error || prepErr?.message || (isEs ? "Error al iniciar reserva" : "Could not start booking"));
      setDraftData({
        draftId: prep.draftId,
        barberName: prep.barberName || selectedCal.name,
        serviceName: selectedService.name,
        startsAt: selectedTime,
        price: String(selectedService.price || "0"),
        priceCents,
      });
      setStep("payment");
    } catch (e) {
      setSubmitError((e as Error).message || (isEs ? "Error al reservar" : "Booking error"));
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Step navigation (smart-skip aware) ─────────────────────────── */
  const showProductsStep = hasProducts === true;

  useEffect(() => {
    if (loading || step !== "addons" || !selectedService || serviceAddons.length > 0) return;
    setStep(showProductsStep ? "products" : "datetime");
  }, [loading, step, selectedService, serviceAddons.length, showProductsStep]);

  const goBack = () => {
    if (step === "service") setStep("barber");
    else if (step === "addons") setStep("service");
    else if (step === "products") setStep(serviceAddons.length > 0 ? "addons" : "service");
    else if (step === "datetime") {
      // Skip products on the way back if it's hidden.
      if (showProductsStep) setStep("products");
      else setStep(serviceAddons.length > 0 ? "addons" : "service");
    }
    else if (step === "contact") setStep("datetime");
    else if (step === "payment") {
      setDraftData(null);
      setSubmitError(isEs ? "La sesión de pago expiró. Confirma tus datos de nuevo." : "Payment session expired. Confirm your info again.");
      setStep("contact");
    }
    else closeBooking();
  };

  /** Tap a chip → jump back to that step for editing. */
  const jumpToStep = (target: Step) => {
    if (target === step) return;
    if (target === "payment" || target === "success") return;
    setStep(target);
  };

  const recoverStalePayment = () => {
    setDraftData(null);
    setSubmitError(isEs ? "La sesión de pago expiró. Confirma tus datos de nuevo." : "Payment session expired. Confirm your info again.");
    setStep("contact");
  };

  const stepTitle = (() => {
    switch (step) {
      case "barber": return isEs ? "Escoge tu barbero" : "Choose your barber";
      case "service": return isEs ? "Escoge tu servicio" : "Choose your service";
      case "addons": return isEs ? "Complementos" : "Add-ons";
      case "products": return isEs ? "¿Algo más?" : "Anything else?";
      case "datetime": return isEs ? "Fecha y hora" : "Date & time";
      case "contact": return isEs ? "Tus datos" : "Your info";
      case "payment": return isEs ? "Confirmar" : "Confirm";
      default: return "";
    }
  })();

  /* ─── Progress + chips ─────────────────────────────────────────────
     Progress order respects smart-skip (products only counts when shown). */
  const flowSteps = useMemo<Step[]>(() => {
    const s: Step[] = ["barber", "service"];
    if (serviceAddons.length > 0) s.push("addons");
    if (showProductsStep) s.push("products");
    s.push("datetime", "contact", "payment");
    return s;
  }, [serviceAddons.length, showProductsStep]);

  const progress = useMemo(() => {
    const idx = flowSteps.indexOf(step);
    if (idx < 0) return 0;
    // Visual fullness: completed steps / total (current step shown as in-progress).
    return idx / Math.max(1, flowSteps.length - 1);
  }, [flowSteps, step]);

  const chips = useMemo<BookingProgressChip[]>(() => {
    const list: BookingProgressChip[] = [];
    if (selectedCal) {
      list.push({ stepKey: "barber", label: selectedCal.name.split(" ")[0] });
    }
    if (selectedService) {
      list.push({
        stepKey: "service",
        label: selectedService.name,
        detail: selectedService.price ? `$${selectedService.price}` : undefined,
      });
    }
    if (selectedAddons.length > 0) {
      list.push({
        stepKey: "addons",
        label: isEs ? `+${selectedAddons.length} complemento${selectedAddons.length > 1 ? "s" : ""}` : `+${selectedAddons.length} add-on${selectedAddons.length > 1 ? "s" : ""}`,
      });
    }
    if (productLineItems.length > 0) {
      const totalQty = productLineItems.reduce((a, p) => a + p.qty, 0);
      list.push({
        stepKey: "products",
        label: isEs ? `${totalQty} producto${totalQty > 1 ? "s" : ""}` : `${totalQty} product${totalQty > 1 ? "s" : ""}`,
        detail: `$${(productsTotalCents / 100).toFixed(2)}`,
      });
    }
    if (selectedTime) {
      list.push({
        stepKey: "datetime",
        label: format(new Date(selectedTime), "EEE d · h:mm a", { locale: isEs ? esLocale : undefined }),
      });
    }
    return list;
  }, [selectedCal, selectedService, selectedAddons.length, productLineItems, productsTotalCents, selectedTime, isEs]);

  if (!isOpen) return null;

  // Neutral accent — no longer derived from the barber. Matches CTA tokens
  // (black on light, beige on dark) so chips, checkmarks, selected dates,
  // and time slots respect the theme rather than the chosen barber's color.
  const accent = resolvedTheme === "dark" ? "#ceb79e" : "#111111";

  return (
    <>
      {isOpen && (
        <div
          
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeBooking(); }}>
          <div
            
            
            className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            style={{ background: "var(--bg-surface)", maxHeight: "90vh" }}>
            {/* Top spacer (no pill handle on centered modal) */}
            <div className="pt-4" />

            {step !== "success" && step !== "payment" ? (
              <>
                {/* Top bar: back + close (no step counter — replaced by progress bar below) */}
                <div className="flex items-center justify-between px-5 pt-3">
                  {step !== "barber" ? (
                    <button
                      onClick={goBack}
                      className="p-2 rounded-full"
                      style={{ background: "var(--bg-surface-2)" }}
                      aria-label={isEs ? "Volver" : "Back"}>
                      <ChevronLeft size={16} style={{ color: "var(--text-secondary)" }} />
                    </button>
                  ) : (
                    <span className="w-8" /> /* spacer */
                  )}
                  <button
                    onClick={closeBooking}
                    className="p-2 rounded-full"
                    style={{ background: "var(--bg-surface-2)" }}
                    aria-label={isEs ? "Cerrar" : "Close"}>
                    <X size={16} style={{ color: "var(--text-secondary)" }} />
                  </button>
                </div>

                {/* Visual progress bar + acumulative chips (neuro-UX: shows
                    what the user already gained, not what's left). */}
                <BookingProgress
                  progress={progress}
                  chips={chips}
                  onChipClick={(key) => jumpToStep(key as Step)}
                  accent={accent} />

                {/* Title only — no subtitle to reduce visual noise */}
                <div className="px-5 pt-2 pb-3">
                  <h2
                    className="text-[24px] leading-tight"
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "'Montserrat', system-ui, sans-serif",
                      fontWeight: 900,
                      letterSpacing: "-0.5px",
                    }}>
                    {stepTitle}
                  </h2>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-4 pb-6">
                  {/* ───── STEP: BARBER ───── */}
                  {step === "barber" && (
                    loading ? (
                      <div className="flex justify-center py-10">
                        <Loader2 size={22} className="animate-spin" style={{ color: "var(--accent-color)" }} />
                      </div>
                    ) : (
                      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                        {calendars.map((c) => (
                          <BarberPickerRow
                            key={c.id}
                            name={c.name}
                            avatarUrl={c.avatarUrl}
                            isSelected={false}
                            subtitle={isEs ? "Barbero" : "Barber"}
                            selectLabel={isEs ? "Elegir" : "Select"}
                            onClick={() => {
                              setSelectedCal(c);
                              setStep("service");
                            }} />
                        ))}
                      </div>
                    )
                  )}

                  {/* ───── STEP: SERVICE ───── */}
                  {step === "service" && (
                    servicesByCategory.size === 0 ? (
                      <p className="text-center py-10 text-sm" style={{ color: "var(--text-secondary)" }}>
                        {isEs ? "No hay servicios disponibles" : "No services available"}
                      </p>
                    ) : (
                      <div className="space-y-5">
                        {Array.from(servicesByCategory.entries()).map(([cat, list]) => (
                          <div key={cat}>
                            <p
                              className="text-xs font-bold uppercase tracking-widest mb-2 px-1"
                              style={{ color: "var(--text-tertiary)" }}>
                              {cat}
                            </p>
                            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                              {list.map((s) => {
                                const isSel = selectedService?.id === s.id;
                                const dur = s.duration >= 60
                                  ? `${Math.floor(s.duration / 60)}h${s.duration % 60 ? ` ${s.duration % 60}m` : ""}`
                                  : `${s.duration} min`;
                                return (
                                  <button
                                    key={s.id}
                                    onClick={() => {
                                      setSelectedService(s);
                                      setSelectedAddons([]);
                                      const hasAddons = (s.addonIDs || []).some((id) =>
                                        allAddons.find((a) => a.id === id)
                                      );
                                      // Smart-skip products step if there's no inventory.
                                      const next: Step = hasAddons ? "addons" : (showProductsStep ? "products" : "datetime");
                                      setTimeout(() => setStep(next), 250);
                                    }}
                                    className="w-full flex items-start gap-3 py-4 px-1 text-left active:opacity-60 transition-opacity">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                                        {s.name}
                                      </p>
                                      <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                                        {dur}
                                      </p>
                                      <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>
                                        ${s.price}
                                      </p>
                                    </div>
                                    <div
                                      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-1"
                                      style={{
                                        background: isSel ? accent : "transparent",
                                        border: isSel ? "none" : "1.5px solid var(--border)",
                                      }}>
                                      {isSel ? (
                                        <Check className="icon-extrabold" size={18} color="#fff" />
                                      ) : (
                                        <Plus size={18} style={{ color: "var(--text-tertiary)" }} />
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {/* ───── STEP: ADDONS ───── */}
                  {step === "addons" && (
                    <>
                      {serviceAddons.length === 0 ? (
                        <p className="text-center py-8 text-sm" style={{ color: "var(--text-secondary)" }}>
                          {isEs ? "No hay complementos para este servicio" : "No add-ons for this service"}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {serviceAddons.map((a) => {
                            const isChecked = selectedAddons.includes(a.id);
                            return (
                              <button
                                key={a.id}
                                onClick={() =>
                                  setSelectedAddons((prev) =>
                                    isChecked ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                                  )
                                }
                                className="w-full flex items-center justify-between py-3 px-4 rounded-xl transition-all"
                                style={{
                                  background: isChecked ? `${accent}15` : "var(--bg-surface-2)",
                                  border: isChecked ? `1.5px solid ${accent}40` : "1.5px solid transparent",
                                }}>
                                <div className="flex-1 text-left min-w-0">
                                  <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
                                    {a.name}
                                  </p>
                                  {a.duration > 0 && (
                                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                                      +{a.duration} min
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                                    {parseFloat(a.price) > 0 ? `+$${a.price}` : isEs ? "Gratis" : "Free"}
                                  </span>
                                  <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center"
                                    style={{
                                      background: isChecked ? accent : "transparent",
                                      border: isChecked ? "none" : "1.5px solid var(--border)",
                                    }}>
                                    {isChecked ? <Check className="icon-extrabold" size={14} color="#fff" /> : <Plus size={12} style={{ color: "var(--text-tertiary)" }} />}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <button
                        onClick={() => setStep(showProductsStep ? "products" : "datetime")}
                        className="w-full mt-5 py-4 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
                        {selectedAddons.length > 0
                          ? (isEs ? "Continuar" : "Continue")
                          : (isEs ? "Omitir" : "Skip")}
                      </button>
                    </>
                  )}

                  {/* ───── STEP: PRODUCTS (Mini-Shop) ───── */}
                  {step === "products" && (
                    <ProductsStep
                      cart={productCart}
                      onChange={setProductCart}
                      onContinue={() => setStep("datetime")}
                      accent={accent}
                      isEs={isEs}
                      onTotalChange={(cents, items) => {
                        setProductsTotalCents(cents);
                        setProductLineItems(items);
                      }} />
                  )}

                  {/* ───── STEP: DATETIME ───── */}
                  {step === "datetime" && (
                    <DateTimeStep
                      selectedDate={selectedDate}
                      onSelectDate={setSelectedDate}
                      availableDates={availableDates}
                      loadedMonths={loadedMonths}
                      onBrowseMonths={setBrowsedMonths}
                      timeSlots={timeSlots}
                      loadingTimes={loadingTimes}
                      onPickTime={(t) => {
                        setSelectedTime(t);
                        setStep("contact");
                      }}
                      monthOpen={monthOpen}
                      setMonthOpen={setMonthOpen}
                      monthDate={monthDate}
                      setMonthDate={setMonthDate}
                      accent={accent}
                      isEs={isEs} />
                  )}

                  {/* ───── STEP: CONTACT ───── */}
                  {step === "contact" && (
                    <div className="space-y-3">
                      {/* Summary card */}
                      <div
                        className="rounded-2xl p-3 text-xs space-y-2"
                        style={{ background: "var(--bg-surface-2)" }}>
                        <div className="flex items-center gap-2">
                          <User size={12} style={{ color: "var(--text-tertiary)" }} />
                          <span style={{ color: "var(--text-primary)" }}>{selectedCal?.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Scissors size={12} style={{ color: "var(--text-tertiary)" }} />
                          <span style={{ color: "var(--text-primary)" }}>{selectedService?.name}</span>
                          <span className="ml-auto font-semibold" style={{ color: "var(--text-primary)" }}>${selectedService?.price}</span>
                        </div>
                        {selectedTime && (
                          <div className="flex items-center gap-2">
                            <CalendarDays size={12} style={{ color: "var(--text-tertiary)" }} />
                            <span style={{ color: "var(--text-primary)" }}>
                              {format(new Date(selectedTime), "EEE d MMM · h:mm a", { locale: isEs ? esLocale : undefined })}
                            </span>
                          </div>
                        )}
                        {productLineItems.length > 0 && (
                          <div className="pt-2 mt-2 space-y-1" style={{ borderTop: "1px solid var(--divider)" }}>
                            {productLineItems.map((p) => (
                              <div key={p.id} className="flex items-center gap-2">
                                <span style={{ color: "var(--text-tertiary)" }}>×{p.qty}</span>
                                <span className="truncate" style={{ color: "var(--text-primary)" }}>{p.name}</span>
                                <span className="ml-auto font-semibold" style={{ color: "var(--text-primary)" }}>
                                  ${(p.line_total_cents / 100).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <input
                          autoFocus
                          autoComplete="name"
                          name="name"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          placeholder={isEs ? "Tu nombre completo" : "Your full name"}
                          className="w-full px-4 py-3 rounded-xl text-base focus:outline-none"
                          style={{
                            background: "var(--bg-surface-2)",
                            color: "var(--text-primary)",
                            border: "1.5px solid var(--border)",
                          }} />
                        <input
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          name="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder={isEs ? "Teléfono" : "Phone"}
                          className="w-full px-4 py-3 rounded-xl text-base focus:outline-none"
                          style={{
                            background: "var(--bg-surface-2)",
                            color: "var(--text-primary)",
                            border: "1.5px solid var(--border)",
                          }} />
                        <input
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          name="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={isEs ? "Email" : "Email"}
                          className="w-full px-4 py-3 rounded-xl text-base focus:outline-none"
                          style={{
                            background: "var(--bg-surface-2)",
                            color: "var(--text-primary)",
                            border: "1.5px solid var(--border)",
                          }} />
                      </div>

                      {submitError && (
                        <p className="text-xs text-center" style={{ color: "var(--red, #ef4444)" }}>
                          {submitError}
                        </p>
                      )}

                      {(() => {
                        const nameValid = parseName(nameInput).firstName.length > 0;
                        const disabled = !nameValid || !phone.trim() || !email.trim() || submitting;
                        return (
                          <button
                            type="button"
                            onPointerDown={() => {
                              // iOS: dismiss keyboard on the SAME gesture so the
                              // tap doesn't get consumed by the keyboard hide.
                              const ae = document.activeElement as HTMLElement | null;
                              if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) ae.blur();
                            }}
                            onClick={handleSubmit}
                            disabled={disabled}
                            className="w-full mt-2 py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 select-none cursor-pointer disabled:cursor-not-allowed"
                            style={{
                              background: "var(--cta-bg)",
                              color: "var(--cta-fg)",
                              opacity: disabled ? 0.5 : 1,
                              minHeight: 48,
                              touchAction: "manipulation",
                              WebkitTapHighlightColor: "transparent",
                              WebkitUserSelect: "none",
                            }}>
                            {submitting && <Loader2 size={16} className="animate-spin" />}
                            {submitting ? (isEs ? "Reservando..." : "Booking...") : (isEs ? "Confirmar" : "Confirm")}
                          </button>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </>
            ) : step === "payment" ? (
              /* ───── PAYMENT PAYWALL ───── */
              <div className="px-5 pt-5 pb-6 overflow-y-auto" style={{ maxHeight: "85vh" }}>
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={goBack}
                    className="p-2 -ml-2 rounded-full"
                    style={{ background: "var(--bg-surface-2)" }}
                    aria-label={isEs ? "Volver" : "Back"}>
                    <ChevronLeft size={16} style={{ color: "var(--text-secondary)" }} />
                  </button>
                  <h2
                    className="text-[20px] leading-tight"
                    style={{
                      color: "var(--text-primary)",
                      fontFamily: "'Montserrat', system-ui, sans-serif",
                      fontWeight: 900,
                      letterSpacing: "-0.5px",
                    }}>
                    {stepTitle}
                  </h2>
                  <button
                    type="button"
                    onClick={closeBooking}
                    className="p-2 rounded-full"
                    style={{ background: "var(--bg-surface-2)" }}
                    aria-label={isEs ? "Cerrar" : "Close"}>
                    <X size={16} style={{ color: "var(--text-secondary)" }} />
                  </button>
                </div>
                {draftData ? (
                  <PaymentStep
                    key={draftData.draftId}
                    draftId={draftData.draftId}
                    basePriceCents={(() => {
                      // ⚠️ basePriceCents drives what the user is actually CHARGED
                      // (Stripe/PayPal/ATH read totalCents = basePriceCents + tipCents).
                      // Must include service + addons + products to match the draft
                      // total_cents the server validated in prepare-draft. Skipping
                      // products here = under-charging + cart ghost bug.
                      let cents = draftData.priceCents;
                      allAddons
                        .filter((a) => selectedAddons.includes(a.id))
                        .forEach((a) => {
                          cents += Math.round(parseFloat(a.price || "0") * 100);
                        });
                      cents += productsTotalCents;
                      return cents;
                    })()}
                    serviceName={draftData.serviceName}
                    lineItems={(() => {
                      const lines: { key: string; label: string; unitCents: number }[] = [
                        {
                          key: `svc-${selectedService?.id ?? "main"}`,
                          label: draftData.serviceName,
                          unitCents: draftData.priceCents,
                        },
                      ];
                      allAddons
                        .filter((a) => selectedAddons.includes(a.id))
                        .forEach((a) => {
                          lines.push({
                            key: `addon-${a.id}`,
                            label: a.name,
                            unitCents: Math.round(parseFloat(a.price || "0") * 100),
                          });
                        });
                      // Mini-shop products — render each line so the receipt /
                      // payment summary mirrors what was added in step 4.
                      productLineItems.forEach((p) => {
                        lines.push({
                          key: `prod-${p.id}`,
                          label: `${p.name} × ${p.qty}`,
                          unitCents: p.line_total_cents,
                        });
                      });
                      return lines;
                    })()}
                    email={email}
                    accent={accent}
                    isEs={isEs}
                    phone={normalizePhone10(phone)}
                    barberName={draftData.barberName}
                    barberColor={accent}
                    startsAt={draftData.startsAt}
                    flowSource="public_paywall"
                    onPaid={(result) => {
                      setSuccessData({
                        isReturning: !!result.isReturning,
                        returningName: result.returningName || null,
                        cardOnFile: result.cardOnFile || null,
                        barberName: draftData.barberName,
                        serviceName: result.appointment?.service_name || draftData.serviceName,
                        startsAt: result.appointment?.starts_at || draftData.startsAt,
                        price: result.appointment?.price || draftData.price,
                      });
                      setStep("success");
                    }}
                    onAbandon={() => {
                      setDraftData(null);
                      closeBooking();
                    }} />
                ) : (
                  <div className="py-8 text-center space-y-4">
                    <AlertTriangle size={34} className="mx-auto" style={{ color: accent }} />
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {isEs ? "La sesión de pago expiró." : "Payment session expired."}
                    </p>
                    <button
                      type="button"
                      onClick={recoverStalePayment}
                      className="w-full rounded-xl py-3 text-sm font-bold active:scale-[0.98]"
                      style={{ background: accent, color: "var(--cta-fg)", touchAction: "manipulation" }}>
                      {isEs ? "Volver a confirmar" : "Confirm again"}
                    </button>
                  </div>
                )}
              </div>
            ) : successData ? (
              /* ───── SUCCESS SCREEN ───── */
              <SuccessScreen
                data={successData!}
                accent={accent}
                isEs={isEs}
                onClose={closeBooking} />
            ) : null}

            {/* Safe area — extra 24px on top of inset so iOS PWA's home-indicator
                gesture zone never overlaps the CTA stack on step 5. */}
            <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }} />
          </div>
        </div>
      )}

      {/* Phone-only identity match prompt (returned by pay-then-book prepare-draft) */}
      <ClientMatchConfirmDialog
        open={!!phoneMatch}
        match={phoneMatch ? { clientId: phoneMatch.clientId, matchType: "phone", displayName: phoneMatch.displayName, email: null, phone: null } : null}
        onConfirm={() => {
          if (phoneMatch) setConfirmedClientId(phoneMatch.clientId);
          setForceNewProfile(false);
          setPhoneMatch(null);
          setTimeout(() => { void handleSubmit(); }, 0);
        }}
        onKeepSeparate={() => {
          // User says "no soy esa persona" — bypass the phone-match guard on
          // the next prepare-draft so the server creates a brand-new profile
          // instead of looping back into the same dialog.
          setConfirmedClientId(null);
          setForceNewProfile(true);
          setPhoneMatch(null);
          setTimeout(() => { void handleSubmit(); }, 0);
        }} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DateTime sub-component
   ═══════════════════════════════════════════════════════════════ */
function DateTimeStep({
  selectedDate,
  onSelectDate,
  availableDates,
  loadedMonths,
  onBrowseMonths,
  timeSlots,
  loadingTimes,
  onPickTime,
  monthOpen,
  setMonthOpen,
  monthDate,
  setMonthDate,
  accent,
  isEs,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  availableDates: string[];
  loadedMonths: string[];
  onBrowseMonths: (months: string[]) => void;
  timeSlots: TimeSlot[];
  loadingTimes: boolean;
  onPickTime: (t: string) => void;
  monthOpen: boolean;
  setMonthOpen: (v: boolean) => void;
  monthDate: Date;
  setMonthDate: (d: Date) => void;
  accent: string;
  isEs: boolean;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(selectedDate, { weekStartsOn: 0 }));
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const minDate = startOfDay(new Date());
  const touchX = useRef(0);
  const canGoPrev = addDays(weekStart, 6) >= minDate;

  // Tell the parent which month(s) the visible week spans so it fetches their
  // availability. Without this, weeks in a not-yet-fetched month render as
  // fully unavailable.
  const visibleMonthsKey = useMemo(
    () => Array.from(new Set(weekDays.map((d) => format(d, "yyyy-MM")))).join(","),
    [weekDays],
  );
  useEffect(() => {
    onBrowseMonths(visibleMonthsKey.split(","));
  }, [visibleMonthsKey, onBrowseMonths]);

  /** A day is selectable unless its month is loaded and doesn't list it. */
  const isDayAvailable = (day: Date) => {
    if (day < minDate) return false;
    const month = format(day, "yyyy-MM");
    if (!loadedMonths.includes(month)) return true;
    return availableDates.includes(format(day, "yyyy-MM-dd"));
  };




  return (
    <div>
      {/* Month header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button onClick={() => { setMonthOpen(!monthOpen); setMonthDate(selectedDate); }} className="flex items-center gap-2">
          <span className="text-base font-bold capitalize" style={{ color: "var(--text-primary)" }}>
            {format(selectedDate, "MMMM yyyy", { locale: isEs ? esLocale : undefined })}
          </span>
          <ChevronDown
            size={14}
            style={{
              color: "var(--text-tertiary)",
              transform: monthOpen ? "rotate(180deg)" : "rotate(0)",
              transition: "transform 0.2s",
            }} />
        </button>
        <button
          onClick={() => {
            const today = new Date();
            onSelectDate(today);
            setWeekStart(startOfWeek(today, { weekStartsOn: 0 }));
            setMonthOpen(false);
          }}
          className="text-xs font-semibold px-3 py-1 rounded-full"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
          {isEs ? "Hoy" : "Today"}
        </button>
      </div>

      {/* Month grid */}
      {monthOpen && (
          <div
            
            
            className="overflow-hidden mb-2">
            <MonthGridInline
              monthDate={monthDate}
              selectedDate={selectedDate}
              availableDates={availableDates}
              minDate={minDate}
              accent={accent}
              isEs={isEs}
              onSelectDate={(d) => {
                onSelectDate(d);
                setWeekStart(startOfWeek(d, { weekStartsOn: 0 }));
                setMonthOpen(false);
              }}
              onChangeMonth={setMonthDate} />
          </div>
        )}

      {/* Week row */}
      {!monthOpen && (
        <div
          className="flex items-center gap-1 mb-3"
          style={{ paddingBottom: 12, borderBottom: "1px solid var(--divider)" }}
          onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const diff = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
            if (Math.abs(diff) > 50) {
              if (diff < 0) setWeekStart(addDays(weekStart, 7));
              else if (canGoPrev) setWeekStart(addDays(weekStart, -7));
            }
          }}
        >
          <button
            onClick={() => canGoPrev && setWeekStart(addDays(weekStart, -7))}
            disabled={!canGoPrev}
            aria-label={isEs ? "Semana anterior" : "Previous week"}
            className="p-1 shrink-0"
            style={{ opacity: canGoPrev ? 1 : 0.25 }}>
            <ChevronLeft size={18} style={{ color: "var(--text-secondary)" }} />
          </button>

          <div className="flex items-center justify-between gap-1 flex-1">
          {weekDays.map((day, i) => {
            const sel = isSameDay(day, selectedDate);
            const t = isToday(day);
            const allowed = day >= minDate;
            const dateStr = format(day, "yyyy-MM-dd");
            const avail = isDayAvailable(day);
            return (
              <button
                key={i}
                onClick={() => avail && onSelectDate(day)}
                disabled={!avail}
                className="flex flex-col items-center gap-1 flex-1"
                style={{ opacity: avail ? 1 : 0.3 }}>
                <span className="text-xs font-medium uppercase" style={{ color: "var(--text-tertiary)" }}>
                  {format(day, "EEE", { locale: isEs ? esLocale : undefined }).slice(0, 1)}
                </span>
                <span
                  className="flex items-center justify-center text-sm font-bold rounded-full"
                  style={{
                    width: 36,
                    height: 36,
                    background: sel ? accent : "transparent",
                    color: sel ? "#fff" : t ? accent : "var(--text-primary)",
                    border: t && !sel ? `1.5px solid ${accent}` : "1.5px solid transparent",
                  }}>
                  {format(day, "d")}
                </span>
              </button>
            );
          })}
          </div>

          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label={isEs ? "Semana siguiente" : "Next week"}
            className="p-1 shrink-0">
            <ChevronLeft size={18} style={{ color: "var(--text-secondary)", transform: "rotate(180deg)" }} />
          </button>
        </div>

      )}

      {/* Time slots */}
      <div>
        {loadingTimes ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin" style={{ color: accent }} />
          </div>
        ) : timeSlots.length === 0 ? (
          <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
            {isEs ? "No hay horarios disponibles" : "No times available"}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {timeSlots.map((slot) => (
              <button
                key={slot.time}
                onClick={() => onPickTime(slot.time)}
                className="py-3 rounded-xl text-[13px] font-semibold active:scale-[0.96]"
                style={{ border: "1.5px solid var(--border)", color: "var(--text-primary)" }}>
                {format(new Date(slot.time), "h:mm a")}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Inline month grid (compact)
   ═══════════════════════════════════════════════════════════════ */
function MonthGridInline({
  monthDate,
  selectedDate,
  availableDates,
  minDate,
  accent,
  isEs,
  onSelectDate,
  onChangeMonth,
}: {
  monthDate: Date;
  selectedDate: Date;
  availableDates: string[];
  minDate: Date;
  accent: string;
  isEs: boolean;
  onSelectDate: (d: Date) => void;
  onChangeMonth: (d: Date) => void;
}) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const startDay = getDay(monthStart);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  let d = monthStart;
  while (d <= monthEnd) { cells.push(d); d = addDays(d, 1); }
  const labels = isEs ? ["D", "L", "M", "M", "J", "V", "S"] : ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="rounded-2xl p-3" style={{ background: "var(--bg-surface-2)" }}>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onChangeMonth(subMonths(monthDate, 1))} className="p-1">
          <ChevronLeft size={16} style={{ color: "var(--text-secondary)" }} />
        </button>
        <span className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
          {format(monthDate, "MMMM yyyy", { locale: isEs ? esLocale : undefined })}
        </span>
        <button onClick={() => onChangeMonth(addMonths(monthDate, 1))} className="p-1">
          <ChevronLeft size={16} style={{ color: "var(--text-secondary)", transform: "rotate(180deg)" }} />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {labels.map((l, i) => (
          <div key={i} className="text-center text-xs font-semibold uppercase" style={{ color: "var(--text-tertiary)" }}>
            {l}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`b-${i}`} />;
          const sel = isSameDay(day, selectedDate);
          const t = isToday(day);
          const inMonth = isSameMonth(day, monthDate);
          const allowed = day >= startOfDay(minDate);
          const dateStr = format(day, "yyyy-MM-dd");
          const avail = allowed && (availableDates.length === 0 || availableDates.includes(dateStr));
          return (
            <button
              key={i}
              onClick={() => avail && onSelectDate(day)}
              disabled={!avail}
              className="flex items-center justify-center mx-auto rounded-full"
              style={{
                width: 30,
                height: 30,
                background: sel ? accent : "transparent",
                color: sel ? "#fff" : t ? accent : inMonth ? "var(--text-primary)" : "var(--text-tertiary)",
                border: t && !sel ? `1.5px solid ${accent}` : "1.5px solid transparent",
                fontSize: 11,
                fontWeight: 600,
                opacity: avail ? 1 : 0.3,
              }}>
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Success screen
   ═══════════════════════════════════════════════════════════════ */
function SuccessScreen({
  data,
  accent,
  isEs,
  onClose,
}: {
  data: {
    isReturning: boolean;
    returningName: string | null;
    cardOnFile: { brand: string | null; last4: string | null } | null;
    barberName: string;
    serviceName: string;
    startsAt: string;
    price: string;
  };
  accent: string;
  isEs: boolean;
  onClose: () => void;
}) {
  return (
    <div className="px-6 pt-2 pb-6 text-center">
      {/* Returning client welcome */}
      {data.isReturning && (
        <div
          
          className="mb-4 px-3 py-2 rounded-xl"
          style={{ background: `${accent}15`, color: accent }}>
          <p className="text-xs font-semibold">
            {isEs ? "Bienvenido de vuelta" : "Welcome back"}
            {data.returningName ? `, ${data.returningName}` : ""}
          </p>
          {data.cardOnFile?.last4 && (
            <p className="text-[10px] mt-1 opacity-80">
              {data.cardOnFile.brand || "Card"} •••• {data.cardOnFile.last4}
            </p>
          )}
        </div>
      )}

      {/* Animated checkmark */}
      <div
        
        className="mx-auto mb-4 flex items-center justify-center rounded-full"
        style={{ width: 72, height: 72, background: "hsl(142 71% 45% / 0.15)" }}>
        <div
          >
          <CheckCircle2 className="icon-bold" size={44} color="hsl(142 71% 45%)" />
        </div>
      </div>

      <h2
        
        className="text-[24px] mb-1"
        style={{
          color: "var(--text-primary)",
          fontFamily: "'Montserrat', system-ui, sans-serif",
          fontWeight: 900,
          letterSpacing: "-0.5px",
        }}>
        {isEs ? "Cita confirmada" : "Appointment confirmed"}
      </h2>
      <p
        
        className="text-xs mb-5"
        style={{ color: "var(--text-secondary)" }}>
        {isEs ? "Te enviamos un recordatorio antes de tu cita" : "We'll send you a reminder before your appointment"}
      </p>

      <div
        
        className="rounded-2xl p-4 text-left space-y-2 mb-5"
        style={{ background: "var(--bg-surface-2)" }}>
        <div className="flex items-center gap-2 text-xs">
          <User size={12} style={{ color: "var(--text-tertiary)" }} />
          <span style={{ color: "var(--text-primary)" }}>{data.barberName}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Scissors size={12} style={{ color: "var(--text-tertiary)" }} />
          <span style={{ color: "var(--text-primary)" }}>{data.serviceName}</span>
          <span className="ml-auto font-semibold" style={{ color: "var(--text-primary)" }}>${data.price}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <CalendarDays size={12} style={{ color: "var(--text-tertiary)" }} />
          <span style={{ color: "var(--text-primary)" }}>
            {format(new Date(data.startsAt), "EEEE d 'de' MMMM · h:mm a", { locale: isEs ? esLocale : undefined })}
          </span>
        </div>
      </div>

      <button
        
        onClick={onClose}
        className="w-full py-4 rounded-xl text-sm font-bold active:scale-[0.97] transition-transform"
        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
        {isEs ? "Listo" : "Done"}
      </button>
    </div>
  );
}
