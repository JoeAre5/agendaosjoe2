import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Plus, Minus, ChevronLeft, ChevronRight,
  PackageOpen, Loader2, X, Banknote, ShoppingBag,
  Info, Gift,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { PaymentMethodSheet } from "@/components/site/booking/PaymentMethodSheet";
import { AppointmentPaywall } from "@/components/site/booking/AppointmentPaywall";
import { normalizePhone10, formatPhoneDisplay } from "@/lib/phone";
import { useUrlState, isUuid } from "@/lib/urlState";
import { useNavigate } from "react-router-dom";
import { readPersistent, writePersistent } from "@/lib/persistentState";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

/* ─── types ─── */
type Product = {
  id: string; name: string; price_cents: number; stock_count: number;
  low_stock_threshold: number; category: string | null; image_url: string | null;
  is_active: boolean; cost_cents: number | null;
};
type CartItem = { product: Product; quantity: number };
type Barber = { id: string; name: string; commission_rate?: number | null };
type AppointmentRow = {
  id: string; client_name: string; service_name: string;
  starts_at: string; barber_id: string; paid: boolean; price_cents: number;
  client_phone?: string | null;
};
type PayMethod = "cash" | "stripe" | "paypal" | "ath_movil"; // unified payment method type
type Step = "products" | "quantity" | "attach" | "summary";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/* ─── helpers ─── */
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/* ─── Phase 1B.UX.3.A — Persistence keys + TTLs ─── */
const LS_CART = "checkout.cart";              // [{productId, quantity}]
const LS_SELLER = "checkout.seller";          // {id: string|null, manual: boolean}
const LS_TIP = "checkout.tip";                // {idx, custom, showCustom}
const LS_MANUAL_PHONE = "checkout.manualPhone"; // {phone, ts}
const LS_TIMESTAMP = "checkout.timestamp";    // number (Date.now())
const TTL_GLOBAL_MS = 30 * 60 * 1000;         // 30 minutes
const TTL_MANUAL_PHONE_MS = 5 * 60 * 1000;    // 5 minutes

const STEP_VALUES = ["products", "quantity", "attach", "summary"] as const;
const isStep = (v: string): v is typeof STEP_VALUES[number] =>
  (STEP_VALUES as readonly string[]).includes(v);

const METHOD_VALUES = ["cash", "stripe", "paypal", "ath_movil"] as const;
const isPayMethod = (v: string): v is typeof METHOD_VALUES[number] =>
  (METHOD_VALUES as readonly string[]).includes(v);

function clearAllCheckoutStorage() {
  try {
    [LS_CART, LS_SELLER, LS_TIP, LS_MANUAL_PHONE, LS_TIMESTAMP].forEach((k) =>
      window.localStorage.removeItem(`agendaos.${k}`),
    );
  } catch {
    // ignore
  }
}

/* ─── Tip presets ─── */
const TIP_PRESETS = [
  { label: "0%", pct: 0 },
  { label: "15%", pct: 0.15 },
  { label: "20%", pct: 0.20 },
  { label: "25%", pct: 0.25 },
];

async function decrementStock(items: CartItem[]) {
  for (const item of items) {
    const newCount = Math.max(0, item.product.stock_count - item.quantity);
    await supabase.from("products").update({ stock_count: newCount }).eq("id", item.product.id);
  }
}

async function insertTransaction(
  cart: CartItem[], totalCents: number, method: PayMethod,
  barberId: string, appointmentId: string | null,
  paymentRef?: { stripe?: string; paypal?: string; athmovil?: string },
  clientId?: string | null, tipCents?: number,
  commissionBarberId?: string | null,
) {
  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      barber_id: barberId, client_id: clientId || null, appointment_id: appointmentId,
      type: appointmentId ? "mixed" : "product", payment_method: method,
      subtotal_cents: totalCents, tip_cents: tipCents || 0,
      total_cents: totalCents + (tipCents || 0),
      status: "completed",
      stripe_payment_id: paymentRef?.stripe ?? null,
      paypal_order_id: paymentRef?.paypal ?? null,
      athmovil_transaction_id: paymentRef?.athmovil ?? null,
      commission_barber_id: commissionBarberId ?? null,
    })
    .select("id").single();
  if (txErr || !tx) throw txErr || new Error("No transaction returned");

  const items = cart.map((c) => ({
    transaction_id: tx.id, item_type: "product", item_id: c.product.id,
    name: c.product.name, quantity: c.quantity,
    unit_price_cents: c.product.price_cents,
    total_cents: c.product.price_cents * c.quantity,
  }));
  if (items.length > 0) {
    const { error: itemsErr } = await supabase.from("transaction_items").insert(items);
    if (itemsErr) throw itemsErr;
  }
  return tx.id;
}

/* ─── Intent type for entry points ─── */
export type CheckoutIntent =
  | { type: "appointment"; appointmentId: string }
  | { type: "focusSearch" };

interface CheckoutTabProps {
  intent?: CheckoutIntent | null;
  onIntentConsumed?: () => void;
}

/* ════════════════════════════════════════════════════════ */
/*  MAIN COMPONENT                                         */
/* ════════════════════════════════════════════════════════ */
export function CheckoutTab({ intent, onIntentConsumed }: CheckoutTabProps = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { resolvedTheme, language } = usePreferences();
  const navigate = useNavigate();

  /* ─── Phase 1B.UX.3.A — URL state (cstep, apptId, method) ─── */
  const [cstepUrl, setCstepUrl] = useUrlState<Step>("cstep", {
    defaultValue: null,
    validator: (v): v is Step => isStep(v),
  });
  const [apptIdUrl, setApptIdUrl] = useUrlState<string>("apptId", {
    defaultValue: null,
    validator: (v): v is string => isUuid(v),
  });
  const [methodUrl, setMethodUrl] = useUrlState<PayMethod>("method", {
    defaultValue: null,
    validator: (v): v is PayMethod => isPayMethod(v),
  });

  /* ─── T0: synchronous reads (TTL gate, tip, manualPhone, sellerRef) ─── */
  // Compute ONCE on mount, before useState initializers reference saved values.
  const t0Ref = useRef<{
    initialStep: Step;
    initialMethod: PayMethod | null;
    initialTipIdx: number | null;
    initialCustomTip: string;
    initialShowCustomTip: boolean;
    initialManualPhone: string;
    initialApptId: string | null;
    savedSeller: { id: string | null; manual: boolean } | null;
    savedCart: { productId: string; quantity: number }[] | null;
    expired: boolean;
  } | null>(null);

  if (t0Ref.current === null) {
    let expired = false;
    try {
      const ts = readPersistent<number>(LS_TIMESTAMP, 0);
      if (ts > 0 && Date.now() - ts > TTL_GLOBAL_MS) {
        expired = true;
        clearAllCheckoutStorage();
      }
    } catch { /* ignore */ }

    const tipSaved = expired ? null
      : readPersistent<{ idx: number | null; custom: string; showCustom: boolean } | null>(LS_TIP, null);

    let manualPhoneInit = "";
    if (!expired) {
      const mp = readPersistent<{ phone: string; ts: number } | null>(LS_MANUAL_PHONE, null);
      if (mp && mp.phone && mp.ts && Date.now() - mp.ts <= TTL_MANUAL_PHONE_MS) {
        manualPhoneInit = mp.phone;
      } else if (mp) {
        try { window.localStorage.removeItem("agendaos." + LS_MANUAL_PHONE); } catch { /* */ }
      }
    }

    const sellerSaved = expired ? null
      : readPersistent<{ id: string | null; manual: boolean } | null>(LS_SELLER, null);

    const cartSaved = expired ? null
      : readPersistent<{ productId: string; quantity: number }[] | null>(LS_CART, null);

    // Step from URL — quantity always demoted; expired → products
    const stepCandidate: Step = expired || !cstepUrl ? "products" : cstepUrl;
    const initialStep: Step = stepCandidate === "quantity" ? "products" : stepCandidate;

    const initialMethod: PayMethod | null = expired || methodUrl === "paypal" ? null : methodUrl;
    const initialApptId: string | null = expired ? null : apptIdUrl;

    if (expired) {
      // Defer URL clear so we don't fight react-router during initial render
      Promise.resolve().then(() => {
        setCstepUrl(null);
        setApptIdUrl(null);
        setMethodUrl(null);
      });
    }

    t0Ref.current = {
      initialStep,
      initialMethod,
      initialTipIdx: tipSaved ? tipSaved.idx : 0,
      initialCustomTip: tipSaved ? tipSaved.custom : "",
      initialShowCustomTip: tipSaved ? tipSaved.showCustom : false,
      initialManualPhone: manualPhoneInit,
      initialApptId,
      savedSeller: sellerSaved,
      savedCart: cartSaved,
      expired,
    };
  }
  const t0 = t0Ref.current;

  const [step, setStep] = useState<Step>(t0.initialStep);
  const [cart, setCart] = useState<CartItem[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const intentProcessedRef = useRef(false);
  const checkoutOriginAppointmentIdRef = useRef<string | null>(t0.initialApptId);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod | null>(t0.initialMethod);
  const [showMethodPicker, setShowMethodPicker] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  // Tip state (lives in Summary step, passed to all payment methods)
  const [selectedTipIdx, setSelectedTipIdx] = useState<number | null>(t0.initialTipIdx);
  const [customTip, setCustomTip] = useState(t0.initialCustomTip);
  const [showCustomTip, setShowCustomTip] = useState(t0.initialShowCustomTip);

  const [barberId, setBarberId] = useState<string | null>(null);
  const [barberName, setBarberName] = useState("");
  const [appointmentId, setAppointmentId] = useState<string | null>(t0.initialApptId);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentRow | null>(null);
  const [defaultBarberId, setDefaultBarberId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientAthLast4, setClientAthLast4] = useState<string | null>(null);
  const [clientAthPhone, setClientAthPhone] = useState<string | null>(null); // 10 digits, used by AthMovilPosButton
  const [manualAthPhone, setManualAthPhone] = useState<string>(t0.initialManualPhone);

  // Phase 1B.6 — "¿Quién vendió?" picker (commission attribution)
  const [currentUserBarberId, setCurrentUserBarberId] = useState<string | null>(null);
  const [sellingBarberId, setSellingBarberId] = useState<string | null>(null);
  const [showSellerPicker, setShowSellerPicker] = useState(false);
  const sellerManuallySetRef = useRef<boolean>(t0.savedSeller?.manual ?? false);

  const [products, setProducts] = useState<Product[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState(false);

  // Benefit voucher redemption (code-based) — includes birthday gifts via kind='birthday'
  const [benefitVoucher, setBenefitVoucher] = useState<{ id: string; code: string; title: string; expires_at: string } | null>(null);
  const [voucherApplied, setVoucherApplied] = useState(false);
  const [voucherInput, setVoucherInput] = useState("");
  const [voucherValidating, setVoucherValidating] = useState(false);



  // Hydration gate — blocks URL writes until T2-T5 complete to avoid wiping
  // valid URL state on first render with stale defaults.
  const [hydrated, setHydrated] = useState(false);
  const cartHydratedRef = useRef(false);
  const sellerHydratedRef = useRef(false);
  const apptHydratedRef = useRef<boolean>(!t0.initialApptId);
  const lastIntentApptIdRef = useRef<string | null>(null);

  const productTotal = useMemo(() => cart.reduce((s, c) => s + c.product.price_cents * c.quantity, 0), [cart]);

  const appointmentCharge = useMemo(() => {
    if (!selectedAppointment) return 0;
    // Treat unconfirmed payments as unpaid — charge the full balance
    const isReallyPaid = selectedAppointment.paid && (selectedAppointment as any).payment_confirmed;
    const base = !isReallyPaid
      ? selectedAppointment.price_cents
      : Math.max(0, selectedAppointment.price_cents - (((selectedAppointment as any).amount_paid_cents || 0) - ((selectedAppointment as any).tip_cents || 0)));
    // Discount = whatever the server computed when the voucher was applied
    // (apply_benefit_code RPC stamps appointments.benefit_discount_cents).
    const discount = voucherApplied
      ? Number((selectedAppointment as any).benefit_discount_cents) || 0
      : 0;
    return Math.max(0, base - discount);
  }, [selectedAppointment, voucherApplied]);



  const totalCents = productTotal + appointmentCharge;

  const tipCents = showCustomTip
    ? Math.round((parseFloat(customTip) || 0) * 100)
    : selectedTipIdx !== null
      ? Math.round(appointmentCharge * TIP_PRESETS[selectedTipIdx].pct)
      : 0;

  const grandTotalCents = totalCents + tipCents;


  // Auto-load a benefit voucher pre-attached to the appointment (from client booking flow).
  useEffect(() => {
    let cancelled = false;
    const preId = (selectedAppointment as any)?.applied_benefit_redemption_id as string | undefined;
    if (!preId) { setBenefitVoucher(null); setVoucherApplied(false); setVoucherInput(""); return; }
    (async () => {
      const { data, error } = await supabase
        .from("client_benefit_redemptions")
        .select("id, code, expires_at, redeemed_at, void_reason, benefit_id, rewards_benefits:benefit_id(title_es,title_en)")
        .eq("id", preId)
        .maybeSingle();
      if (cancelled || error || !data) return;
      if ((data as any).redeemed_at || (data as any).void_reason) return;
      const title = (data as any).rewards_benefits?.title_es || "Beneficio";
      setBenefitVoucher({ id: (data as any).id, code: (data as any).code, title, expires_at: (data as any).expires_at });
      setVoucherApplied(true);
      setVoucherInput((data as any).code);
    })();
    return () => { cancelled = true; };
  }, [selectedAppointment]);

  const validateVoucherCode = useCallback(async () => {
    const code = voucherInput.trim().toUpperCase();
    if (!code || !appointmentId) return;
    setVoucherValidating(true);
    const { data, error } = await (supabase.rpc as any)("apply_benefit_code", { _code: code, _appointment_id: appointmentId });
    setVoucherValidating(false);
    if (error) {
      const m = (error.message || "").toLowerCase();
      if (m.includes("code_not_found")) toast.error("Código no encontrado");
      else if (m.includes("code_already_redeemed")) toast.error("Código ya redimido");
      else if (m.includes("code_expired")) toast.error("Código vencido");
      else if (m.includes("code_belongs_to_other_client")) toast.error("Código de otro cliente");
      else if (m.includes("benefit_not_eligible_for_service")) toast.error("Este beneficio no aplica para este servicio");
      else toast.error("Código inválido");
      return;
    }
    // Look up display info
    const { data: row } = await supabase
      .from("client_benefit_redemptions")
      .select("id, code, expires_at, rewards_benefits:benefit_id(title_es)")
      .eq("id", (data as any).redemption_id)
      .maybeSingle();
    if (row) {
      const title = (row as any).rewards_benefits?.title_es || "Beneficio";
      setBenefitVoucher({ id: (row as any).id, code: (row as any).code, title, expires_at: (row as any).expires_at });
      setVoucherApplied(true);
      // Re-fetch the appointment so benefit_discount_cents is hydrated and
      // the balance immediately reflects the deduction.
      const { data: fresh } = await supabase
        .from("appointments")
        .select("id, client_name, service_name, starts_at, barber_id, paid, price_cents, payment_confirmed, amount_paid_cents, tip_cents, client_id, client_phone, status, applied_benefit_redemption_id, benefit_discount_cents")
        .eq("id", appointmentId)
        .maybeSingle();
      if (fresh) setSelectedAppointment(fresh as any);
      const discount = Number((data as any).discount_cents) || 0;
      toast.success(discount > 0 ? `Código aplicado: −${fmt(discount)}` : "Código aplicado");
    }
  }, [voucherInput, appointmentId]);


  /* ─── fetch ─── */
  useEffect(() => {
    supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("show_in_checkout", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (data) setProducts(data as Product[]);
      });
    supabase.from("barbers").select("id, name, commission_rate").eq("is_active", true)
      .not("acuity_calendar_key", "is", null)
      .order("name").then(({ data }) => {
        if (data) {
          const filtered = data.filter((b) => !b.name.toLowerCase().includes("yvette"));
          setBarbers(filtered as Barber[]);
          const charlie = filtered.find((b) => b.name.toLowerCase().includes("charlie"));
          if (charlie) { setDefaultBarberId(charlie.id); setBarberId(charlie.id); setBarberName(charlie.name); }
          else if (filtered.length > 0) { setDefaultBarberId(filtered[0].id); setBarberId(filtered[0].id); setBarberName(filtered[0].name); }
        }
      });
    if (user) {
      supabase.from("profiles").select("barber_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.barber_id) {
            setBarberId(data.barber_id);
            setCurrentUserBarberId(data.barber_id);
            supabase.from("barbers_public").select("name").eq("id", data.barber_id).maybeSingle()
              .then(({ data: b }) => { if (b) setBarberName(b.name); });
          }
        });
    }
  }, [user]);

  useEffect(() => {
    const bid = barberId || defaultBarberId;
    if (!bid) { setAppointments([]); return; }
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    supabase.from("appointments")
      .select("id, client_name, service_name, starts_at, barber_id, paid, price_cents, payment_confirmed, amount_paid_cents, tip_cents, client_id, client_phone, applied_benefit_redemption_id, benefit_discount_cents")
      .eq("barber_id", bid)
      .neq("status", "cancelled")
      .gte("starts_at", todayStart.toISOString())
      .lte("starts_at", todayEnd.toISOString())
      .order("starts_at")
      .then(({ data }) => { if (data) setAppointments(data); });
  }, [barberId, defaultBarberId]);

  /* ─── Reusable: fetch appointment + client info, attach to checkout ─── */
  const fetchAndAttachAppointment = useCallback(async (apptId: string): Promise<boolean> => {
    const { data: appt } = await supabase.from("appointments")
      .select("id, client_name, service_name, starts_at, barber_id, paid, price_cents, payment_confirmed, amount_paid_cents, tip_cents, client_id, client_phone, status, applied_benefit_redemption_id, benefit_discount_cents")
      .eq("id", apptId)
      .neq("status", "cancelled")
      .maybeSingle();
    if (!appt) return false;
    setSelectedAppointment(appt as any);
    setAppointmentId(appt.id);
    setBarberId(appt.barber_id);
    const { data: b } = await supabase.from("barbers_public").select("name").eq("id", appt.barber_id).maybeSingle();
    if (b) setBarberName(b.name);
    if ((appt as any).client_id) {
      setClientId((appt as any).client_id);
      const { data: client } = await supabase
        .from("clients")
        .select("ath_phone_last4, ath_phone, phone")
        .eq("id", (appt as any).client_id)
        .maybeSingle();
      if ((client as any)?.ath_phone_last4) setClientAthLast4((client as any).ath_phone_last4);
      const rawAthPhone = (client as any)?.ath_phone || (client as any)?.phone || (appt as any).client_phone;
      const norm = normalizePhone10(rawAthPhone);
      if (norm.length === 10) setClientAthPhone(norm);
    } else if ((appt as any).client_phone) {
      const norm = normalizePhone10((appt as any).client_phone);
      if (norm.length === 10) setClientAthPhone(norm);
    }
    return true;
  }, []);

  /* ─── Handle intent from entry points ─── */
  useEffect(() => {
    if (!intent || intentProcessedRef.current) return;
    if (intent.type === "focusSearch") {
      setStep("products");
      intentProcessedRef.current = true;
      onIntentConsumed?.();
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
    if (intent.type === "appointment") {
      lastIntentApptIdRef.current = intent.appointmentId;
      checkoutOriginAppointmentIdRef.current = intent.appointmentId;
      fetchAndAttachAppointment(intent.appointmentId).then((ok) => {
        if (ok) {
          // Pay button on AppointmentDetail → jump straight to the final
          // payment step (saved card, Stripe, ATH, PayPal, tip). Staff can
          // tap Back to add products/services if they need to.
          setStep("summary");
          // Mark as hydrated so the URL-driven hydration effect doesn't double-fetch.
          apptHydratedRef.current = true;
        }
        intentProcessedRef.current = true;
        onIntentConsumed?.();
      });
    }
  }, [intent, onIntentConsumed, fetchAndAttachAppointment]);

  useEffect(() => {
    if (!intent) intentProcessedRef.current = false;
  }, [intent]);

  /* ─── cart helpers ─── */
  const cartQty = useCallback((id: string) => cart.find((c) => c.product.id === id)?.quantity ?? 0, [cart]);

  const setQty = useCallback((product: Product, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((c) => c.product.id !== product.id);
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) return prev.map((c) => c.product.id === product.id ? { ...c, quantity: Math.min(qty, product.stock_count) } : c);
      return [...prev, { product, quantity: Math.min(qty, product.stock_count) }];
    });
  }, []);

  const effectiveBarberId = barberId || defaultBarberId || barbers[0]?.id || "";

  // Phase 1B.6 — 3-tier smart default for "¿Quién vendió?"
  const computeDefaultSeller = useCallback((): string | null => {
    const isEligible = (id: string | null | undefined) => {
      if (!id) return false;
      const b = barbers.find((x) => x.id === id);
      return !!b && typeof b.commission_rate === "number" && b.commission_rate > 0;
    };
    if (selectedAppointment && isEligible(selectedAppointment.barber_id)) {
      return selectedAppointment.barber_id;
    }
    if (!selectedAppointment && isEligible(currentUserBarberId)) {
      return currentUserBarberId;
    }
    return null;
  }, [barbers, selectedAppointment, currentUserBarberId]);

  // Auto-apply smart default whenever inputs change, unless user manually set OR
  // we haven't yet attempted to restore a saved seller.
  useEffect(() => {
    if (!sellerHydratedRef.current) return;
    if (sellerManuallySetRef.current) return;
    setSellingBarberId(computeDefaultSeller());
  }, [computeDefaultSeller]);

  /* ─── Phase 1B.UX.3.A — hardClear wipes storage + URL params ─── */
  const hardClear = useCallback(() => {
    clearAllCheckoutStorage();
    setCstepUrl(null);
    setApptIdUrl(null);
    setMethodUrl(null);
    sellerManuallySetRef.current = false;
  }, [setCstepUrl, setApptIdUrl, setMethodUrl]);

  const resetCheckout = useCallback(() => {
    setStep("products");
    setCart([]);
    setSelectedProduct(null);
    setPayMethod(null);
    setAppointmentId(null);
    setSelectedAppointment(null);
    setClientId(null);
    setClientAthLast4(null);
    setClientAthPhone(null);
    setManualAthPhone("");
    setSelectedTipIdx(0);
    setCustomTip("");
    setShowCustomTip(false);
    sellerManuallySetRef.current = false;
    setSellingBarberId(null);
    hardClear();
    supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .eq("show_in_checkout", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .then(({ data }) => {
        if (data) setProducts(data as Product[]);
      });
  }, [hardClear]);

  /* ─── Phase 1B.UX.3.A — HYDRATION + PERSIST + URL SYNC ─── */
  // T2 — hydrate cart from saved {productId, quantity} once products load
  useEffect(() => {
    if (cartHydratedRef.current) return;
    if (products.length === 0) return;
    cartHydratedRef.current = true;
    const saved = t0.savedCart;
    if (!saved || saved.length === 0) return;
    let droppedOrCapped = 0;
    const restored: CartItem[] = [];
    for (const entry of saved) {
      const product = products.find((p) => p.id === entry.productId && p.is_active);
      if (!product) { droppedOrCapped++; continue; }
      const qty = Math.min(entry.quantity, product.stock_count);
      if (qty <= 0) { droppedOrCapped++; continue; }
      if (qty < entry.quantity) droppedOrCapped++;
      restored.push({ product, quantity: qty });
    }
    if (restored.length > 0) setCart(restored);
    if (droppedOrCapped > 0) toast(t("checkout.cartUpdatedInventory"));
  }, [products, t0.savedCart, t]);

  // T3 — hydrate seller after barbers load
  useEffect(() => {
    if (sellerHydratedRef.current) return;
    if (barbers.length === 0) return;
    sellerHydratedRef.current = true;
    const saved = t0.savedSeller;
    if (!saved) return;
    if (saved.id === null && saved.manual) {
      setSellingBarberId(null);
      return;
    }
    if (saved.id) {
      const b = barbers.find((x) => x.id === saved.id);
      const eligible = !!b && typeof b.commission_rate === "number" && (b.commission_rate as number) > 0;
      if (eligible) setSellingBarberId(saved.id);
      else sellerManuallySetRef.current = false;
    }
  }, [barbers, t0.savedSeller]);

  // T4 — hydrate appointment from URL apptId
  useEffect(() => {
    if (apptHydratedRef.current) return;
    if (!apptIdUrl) { apptHydratedRef.current = true; return; }
    if (lastIntentApptIdRef.current === apptIdUrl) {
      apptHydratedRef.current = true;
      return;
    }
    apptHydratedRef.current = true;
    checkoutOriginAppointmentIdRef.current = apptIdUrl;
    fetchAndAttachAppointment(apptIdUrl).then((ok) => {
      if (!ok) {
        setApptIdUrl(null);
        setAppointmentId(null);
      }
    });
  }, [apptIdUrl, fetchAndAttachAppointment, setApptIdUrl]);

  // T4b — clientAthPhone wins over manualAthPhone
  useEffect(() => {
    if (clientAthPhone && manualAthPhone) {
      setManualAthPhone("");
      try { window.localStorage.removeItem("agendaos." + LS_MANUAL_PHONE); } catch { /* */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientAthPhone]);

  // T5 — validate step and unblock URL writes
  useEffect(() => {
    if (hydrated) return;
    if (!cartHydratedRef.current || !sellerHydratedRef.current || !apptHydratedRef.current) return;
    if (step === "summary" && cart.length === 0 && !selectedAppointment) {
      setStep("products");
      setCstepUrl(null);
      setMethodUrl(null);
    } else if (step === "attach" && cart.length === 0) {
      setStep("products");
      setCstepUrl(null);
    }
    setHydrated(true);
  }, [hydrated, cart, selectedAppointment, step, setCstepUrl, setMethodUrl]);

  const bumpTimestamp = useCallback(() => { writePersistent(LS_TIMESTAMP, Date.now()); }, []);

  // Persist cart
  useEffect(() => {
    if (!cartHydratedRef.current) return;
    const slim = cart.map((c) => ({ productId: c.product.id, quantity: c.quantity }));
    writePersistent(LS_CART, slim);
    bumpTimestamp();
  }, [cart, bumpTimestamp]);

  // Persist seller
  useEffect(() => {
    if (!sellerHydratedRef.current) return;
    writePersistent(LS_SELLER, { id: sellingBarberId, manual: sellerManuallySetRef.current });
    bumpTimestamp();
  }, [sellingBarberId, bumpTimestamp]);

  // Persist tip
  useEffect(() => {
    writePersistent(LS_TIP, { idx: selectedTipIdx, custom: customTip, showCustom: showCustomTip });
    bumpTimestamp();
  }, [selectedTipIdx, customTip, showCustomTip, bumpTimestamp]);

  // Persist manual phone with embedded ts
  useEffect(() => {
    if (!manualAthPhone) {
      try { window.localStorage.removeItem("agendaos." + LS_MANUAL_PHONE); } catch { /* */ }
      return;
    }
    writePersistent(LS_MANUAL_PHONE, { phone: manualAthPhone, ts: Date.now() });
  }, [manualAthPhone]);

  // URL sync — step (skip ephemeral "quantity")
  useEffect(() => {
    if (!hydrated) return;
    if (step === "quantity") return;
    setCstepUrl(step === "products" ? null : step);
    bumpTimestamp();
  }, [step, hydrated, setCstepUrl, bumpTimestamp]);

  // URL sync — apptId
  useEffect(() => {
    if (!hydrated) return;
    setApptIdUrl(appointmentId);
    bumpTimestamp();
  }, [appointmentId, hydrated, setApptIdUrl, bumpTimestamp]);

  // URL sync — method
  useEffect(() => {
    if (!hydrated) return;
    setMethodUrl(payMethod);
    bumpTimestamp();
  }, [payMethod, hydrated, setMethodUrl, bumpTimestamp]);

  const getReturnAppointmentId = useCallback(() => (
    checkoutOriginAppointmentIdRef.current
    || appointmentId
    || selectedAppointment?.id
    || apptIdUrl
    || lastIntentApptIdRef.current
  ), [appointmentId, selectedAppointment, apptIdUrl]);

  const returnToAppointment = useCallback((apptId?: string | null) => {
    const returnApptId = apptId || getReturnAppointmentId();
    if (!returnApptId) return false;
    clearAllCheckoutStorage();
    navigate(`/admin/appointment/${returnApptId}`, { replace: true });
    return true;
  }, [getReturnAppointmentId, navigate]);


  // Marks a benefit voucher as redeemed against this appointment.
  const redeemBenefitVoucherIfApplied = useCallback(async () => {
    if (!voucherApplied || !benefitVoucher || !appointmentId) return;
    const { error } = await (supabase.rpc as any)("redeem_benefit_code", {
      _code: benefitVoucher.code,
      _appointment_id: appointmentId,
      _transaction_id: null,
    });
    if (error) console.warn("[voucher redeem]", error);
  }, [voucherApplied, benefitVoucher, appointmentId]);


  const onPaymentSuccess = useCallback(async (ref?: { stripe?: string; paypal?: string; athmovil?: string; skipInsert?: boolean; skipStock?: boolean }) => {
    const returnApptId = getReturnAppointmentId();
    try {
      if (!effectiveBarberId) throw new Error("No barber");
      if (!ref?.skipInsert) {
        await insertTransaction(cart, totalCents, payMethod || "ath_movil", effectiveBarberId, appointmentId, ref, clientId, tipCents, sellingBarberId);
      }
      if (!ref?.skipStock) {
        await decrementStock(cart);
      }
      if (!ref?.athmovil && selectedAppointment) {
        const alreadyConfirmed = selectedAppointment.paid && (selectedAppointment as any).payment_confirmed;
        if (!alreadyConfirmed) {
          // First-time payment for this appointment
          await supabase.from("appointments").update({
            paid: true,
            amount_paid_cents: totalCents,
            payment_method: payMethod,
            payment_confirmed: true,
            tip_cents: tipCents,
          }).eq("id", selectedAppointment.id);
        } else {
          // Appointment already paid — this is an additional product/top-up charge.
          // Increment amount_paid_cents and tip_cents so the Order Summary stays accurate.
          const prevPaid = (selectedAppointment as any).amount_paid_cents || 0;
          const prevTip = (selectedAppointment as any).tip_cents || 0;
          await supabase.from("appointments").update({
            amount_paid_cents: prevPaid + totalCents,
            tip_cents: prevTip + tipCents,
          }).eq("id", selectedAppointment.id);
        }
      }
      toast.success(t("checkout.success"));
      await redeemBenefitVoucherIfApplied();

      if (!returnToAppointment(returnApptId)) resetCheckout();
    } catch (e: any) {
      console.error("Post-payment error:", e);
      toast.error(e.message || t("checkout.paymentFailed"));
    }
  }, [getReturnAppointmentId, cart, totalCents, tipCents, payMethod, effectiveBarberId, appointmentId, selectedAppointment, clientId, sellingBarberId, t, returnToAppointment, resetCheckout, redeemBenefitVoucherIfApplied]);

  const handleCashPayment = useCallback(async () => {
    const returnApptId = getReturnAppointmentId();
    setProcessing(true);
    setPayMethod("cash");
    try {
      if (!effectiveBarberId) throw new Error("No barber");
      await insertTransaction(cart, totalCents, "cash", effectiveBarberId, appointmentId, undefined, clientId, tipCents, sellingBarberId);
      await decrementStock(cart);
      if (selectedAppointment) {
        const alreadyConfirmed = selectedAppointment.paid && (selectedAppointment as any).payment_confirmed;
        if (!alreadyConfirmed) {
          await supabase.from("appointments").update({
            paid: true,
            amount_paid_cents: totalCents,
            payment_method: "cash",
            payment_confirmed: true,
            tip_cents: tipCents,
          }).eq("id", selectedAppointment.id);
        } else {
          const prevPaid = (selectedAppointment as any).amount_paid_cents || 0;
          const prevTip = (selectedAppointment as any).tip_cents || 0;
          await supabase.from("appointments").update({
            amount_paid_cents: prevPaid + totalCents,
            tip_cents: prevTip + tipCents,
          }).eq("id", selectedAppointment.id);
        }
      }
      toast.success(t("checkout.success"));
      
      await redeemBenefitVoucherIfApplied();
      if (!returnToAppointment(returnApptId)) resetCheckout();
    } catch (e: any) {
      console.error("Cash payment error:", e);
      toast.error(e.message || t("checkout.paymentFailed"));
    } finally { setProcessing(false); }
  }, [getReturnAppointmentId, cart, totalCents, effectiveBarberId, appointmentId, selectedAppointment, clientId, tipCents, sellingBarberId, t, returnToAppointment, resetCheckout, redeemBenefitVoucherIfApplied]);


  const goBack = useCallback(() => {
    // If checkout was launched from an appointment view, return there
    // instead of stepping back through products/quantity/attach.
    if (returnToAppointment()) return;
    if (step === "quantity") setStep("products");
    else if (step === "attach") setStep("quantity");
    else if (step === "summary") { setPayMethod(null); setSelectedTipIdx(0); setCustomTip(""); setShowCustomTip(false); setStep("attach"); }
  }, [step, returnToAppointment]);

  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
  }, [products, search]);

  /* ════════════════════════════════════════════════ */
  /*  PAYWALL MODE — entered from "Pay" on an unpaid */
  /*  appointment (no cart). Renders the SAME UI as  */
  /*  the public booking-flow PaymentStep so admin   */
  /*  and public never drift again.                  */
  /* ════════════════════════════════════════════════ */
  const isPaywallMode =
    !!selectedAppointment &&
    cart.length === 0 &&
    appointmentCharge > 0 &&
    step === "summary";

  if (isPaywallMode && selectedAppointment) {
    const eligibleSellers = barbers
      .filter((b) => typeof b.commission_rate === "number" && (b.commission_rate as number) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const sellerLabel = sellingBarberId
      ? (barbers.find((b) => b.id === sellingBarberId)?.name ?? t("checkout.shopDirect"))
      : t("checkout.shopDirect");

    const handlePaid = async () => {
      // client-booking-pay already updated appointments + transactions server-side.
      // Just stamp commission_barber_id on the latest tx if a seller was picked.
      try {
        if (sellingBarberId && appointmentId) {
          await supabase
            .from("transactions")
            .update({ commission_barber_id: sellingBarberId })
            .eq("appointment_id", appointmentId)
            .eq("status", "completed")
            .is("commission_barber_id", null);
        }
      } catch (e) {
        console.warn("[CheckoutTab paywall] commission stamp failed", e);
      }
      toast.success(t("checkout.success"));
      if (!returnToAppointment()) resetCheckout();
    };

    return (
      <motion.div
        key="paywall"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col h-full"
      >
        <div className="px-4 pt-6">
          <BackButton onClick={() => returnToAppointment()} label={t("checkout.back")} />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(120px+env(safe-area-inset-bottom,0px))] space-y-4">
          {/* Who sold? — commission attribution */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "0.5px solid var(--divider)" }}
          >
            <button
              onClick={() => setShowSellerPicker(true)}
              className="w-full px-4 py-3 flex items-center justify-between active:opacity-70 transition-opacity"
            >
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                {t("checkout.soldBy")}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {sellerLabel}
                </span>
                <span className="text-[11px]" style={{ color: "var(--accent-color)" }}>›</span>
              </span>
            </button>
          </div>

          {/* The exact same paywall the client sees */}
          <AppointmentPaywall
            appointmentId={selectedAppointment.id}
            basePriceCents={appointmentCharge}
            serviceName={selectedAppointment.service_name}
            isEs={language === "es"}
            onPaid={handlePaid}
            avoidBottomNav
          />
        </div>

        {/* Seller picker modal */}
        <AnimatePresence>
          {showSellerPicker && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50"
                style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
                onClick={() => setShowSellerPicker(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }}
                transition={{ type: "spring", damping: 28, stiffness: 340 }}
                className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
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
                  <h2 className="text-center uppercase mb-4" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-1px", color: "#111111" }}>
                    {t("checkout.selectSeller")}
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                      onClick={() => { setSellingBarberId(null); sellerManuallySetRef.current = true; setShowSellerPicker(false); }}
                      style={{
                        background: sellingBarberId === null ? "#111111" : "rgba(0,0,0,0.04)",
                        color: sellingBarberId === null ? "#c9a882" : "#111111",
                        fontSize: 13, fontWeight: 600, padding: "12px 0",
                        borderRadius: "var(--radius-control)", border: "none",
                      }}
                    >
                      {t("checkout.shopDirect")}
                    </button>
                    {eligibleSellers.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => { setSellingBarberId(b.id); sellerManuallySetRef.current = true; setShowSellerPicker(false); }}
                        style={{
                          background: sellingBarberId === b.id ? "#111111" : "rgba(0,0,0,0.04)",
                          color: sellingBarberId === b.id ? "#c9a882" : "#111111",
                          fontSize: 13, fontWeight: 600, padding: "12px 0",
                          borderRadius: "var(--radius-control)", border: "none",
                        }}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  /* ════════════════════════════════════════════════ */
  /*  STEP 1 — PRODUCTS                              */
  /* ════════════════════════════════════════════════ */
  if (step === "products") {
    return (
      <motion.div key="products" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
        <AdminHeader title="Checkout" />
        <div className="px-4 pb-4 flex-1 overflow-y-auto">
          <div className="relative mb-5">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
            <input ref={searchInputRef} value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={t("checkout.searchProducts")}
              className="w-full pl-11 pr-10 py-3.5 rounded-2xl text-[15px] outline-none"
              style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "0.5px solid var(--divider)" }} />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2">
                <X size={16} style={{ color: "var(--text-tertiary)" }} />
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <PackageOpen size={36} style={{ color: "var(--text-tertiary)" }} />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("checkout.empty")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((p) => {
                const outOfStock = p.stock_count <= 0;
                const inCart = cartQty(p.id);
                return (
                  <button key={p.id} disabled={outOfStock}
                    onClick={() => { setSelectedProduct(p); setStep("quantity"); }}
                    className="relative flex flex-col rounded-2xl overflow-hidden text-left active:scale-[0.97] transition-transform"
                    style={{ background: "var(--bg-surface)", border: inCart > 0 ? "1.5px solid var(--cta-bg)" : "1.5px solid var(--divider)", opacity: outOfStock ? 0.4 : 1 }}>
                    <div className="aspect-square w-full overflow-hidden flex items-center justify-center"
                      style={{ background: "var(--bg-surface)" }}>
                      {p.image_url ? (
                      <img loading="lazy" decoding="async" src={`${SUPABASE_URL}/storage/v1/object/public/product-images/${p.image_url}`}
                          alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <PackageOpen size={28} style={{ color: "var(--text-tertiary)", opacity: 0.3 }} />
                      )}
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-[13px] font-medium truncate leading-tight" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>{fmt(p.price_cents)}</p>
                        <StockDot count={p.stock_count} threshold={p.low_stock_threshold} />
                      </div>
                    </div>
                    {inCart > 0 && (
                      <span className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
                        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>{inCart}</span>
                    )}
                    {outOfStock && (
                      <span className="absolute top-2 left-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                        style={{ background: "var(--bg-surface)", color: "var(--text-tertiary)" }}>{t("checkout.noStock")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  /* ════════════════════════════════════════════════ */
  /*  STEP 2 — QUANTITY                              */
  /* ════════════════════════════════════════════════ */
  if (step === "quantity" && selectedProduct) {
    const qty = cartQty(selectedProduct.id) || 1;
    const subtotal = selectedProduct.price_cents * qty;
    const maxQty = selectedProduct.stock_count;

    return (
      <motion.div key="quantity" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col h-full px-4 pt-6">
        <BackButton onClick={goBack} label={t("checkout.back")} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="w-28 h-28 rounded-2xl overflow-hidden flex items-center justify-center" style={{ background: "var(--bg-surface)" }}>
            {selectedProduct.image_url ? (
              <img loading="lazy" decoding="async" src={`${SUPABASE_URL}/storage/v1/object/public/product-images/${selectedProduct.image_url}`}
                alt={selectedProduct.name} className="w-full h-full object-cover" />
            ) : (
              <PackageOpen size={32} style={{ color: "var(--text-tertiary)", opacity: 0.4 }} />
            )}
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{selectedProduct.name}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{fmt(selectedProduct.price_cents)} each</p>
          </div>
          <div className="flex items-center gap-5">
            <button onClick={() => { if (qty > 1) setQty(selectedProduct, qty - 1); }} disabled={qty <= 1}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-opacity disabled:opacity-20"
              style={{ background: "var(--bg-surface)" }}>
              <Minus size={20} style={{ color: "var(--text-primary)" }} />
            </button>
            <span className="text-4xl font-black tabular-nums min-w-[60px] text-center" style={{ color: "var(--text-primary)" }}>{qty}</span>
            <button onClick={() => { if (qty < maxQty) setQty(selectedProduct, qty + 1); }} disabled={qty >= maxQty}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-opacity disabled:opacity-20"
              style={{ background: "var(--bg-surface)" }}>
              <Plus size={20} style={{ color: "var(--text-primary)" }} />
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{selectedProduct.stock_count} in stock</p>
        </div>
        <div className="pb-24 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Subtotal</span>
            <span className="text-xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>{fmt(subtotal)}</span>
          </div>
          <button onClick={() => { setQty(selectedProduct, qty); setStep("attach"); }}
            className="w-full py-4 rounded-2xl text-[15px] font-bold active:scale-[0.98] transition-transform"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>{t("checkout.continue")}</button>
        </div>
      </motion.div>
    );
  }

  /* ════════════════════════════════════════════════ */
  /*  STEP 3 — ATTACH                                */
  /* ════════════════════════════════════════════════ */
  if (step === "attach") {
    return (
      <motion.div key="attach" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col h-full px-4 pt-6">
        <BackButton onClick={goBack} label={t("checkout.back")} />
        <div className="flex-1 pt-6 space-y-5">
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold mb-2 block" style={{ color: "var(--text-tertiary)" }}>
              {t("checkout.selectBarber")}
            </label>
            <div className="flex flex-wrap gap-2">
              {barbers.map((b) => {
                const selected = (barberId || defaultBarberId) === b.id;
                return (
                  <button key={b.id} onClick={() => { setBarberId(b.id); setBarberName(b.name); }}
                    className="px-4 py-2.5 rounded-full text-[13px] font-semibold transition-all active:scale-95"
                    style={{
                      background: selected ? "var(--cta-bg)" : "var(--bg-surface)",
                      color: selected ? "var(--cta-fg)" : "var(--text-primary)",
                      border: selected ? "none" : "0.5px solid var(--divider)",
                    }}>{b.name}</button>
                );
              })}
            </div>
          </div>
          {appointments.length > 0 && (
            <div>
              <label className="text-[11px] uppercase tracking-wider font-semibold mb-2 block" style={{ color: "var(--text-tertiary)" }}>
                {t("checkout.attachAppointment")}
              </label>
              <div className="space-y-1.5">
                {appointments.map((a) => {
                  const sel = appointmentId === a.id;
                  return (
                    <button key={a.id}
                    onClick={async () => {
                        if (sel) {
                          setAppointmentId(null); setSelectedAppointment(null);
                          setClientId(null);
                          setClientAthPhone(null);
                        }
                        else {
                          setAppointmentId(a.id); setSelectedAppointment(a);
                          // Fetch client's ATH phone for POS button
                          if ((a as any).client_id) {
                            setClientId((a as any).client_id);
                            const { data: client } = await supabase
                              .from("clients")
                              .select("ath_phone, phone")
                              .eq("id", (a as any).client_id)
                              .maybeSingle();
                            const rawAthPhone = (client as any)?.ath_phone || (client as any)?.phone || a.client_phone;
                            const norm = normalizePhone10(rawAthPhone);
                            setClientAthPhone(norm.length === 10 ? norm : null);
                          } else if (a.client_phone) {
                            const norm = normalizePhone10(a.client_phone);
                            setClientAthPhone(norm.length === 10 ? norm : null);
                          }
                        }
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all active:scale-[0.98]"
                      style={{
                        background: sel ? "var(--cta-bg)" : "var(--bg-surface)",
                        color: sel ? "var(--cta-fg)" : "var(--text-primary)",
                        border: sel ? "none" : "0.5px solid var(--divider)",
                      }}>
                      <span className="text-[13px] font-bold">
                        {new Date(a.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-[13px] truncate flex-1">{a.client_name} - {a.service_name}</span>
                      {a.paid && (
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full"
                          style={{
                            background: (a as any).payment_confirmed ? "rgba(34,197,94,0.15)" : "rgba(156,163,175,0.15)",
                            color: (a as any).payment_confirmed ? "#22c55e" : "#9ca3af",
                          }}>{(a as any).payment_confirmed ? "Paid" : "Paid"}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="pb-24 pt-4">
          <button onClick={() => setStep("summary")}
            className="w-full py-4 rounded-2xl text-[15px] font-bold active:scale-[0.98] transition-transform"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>{t("checkout.continue")}</button>
        </div>
      </motion.div>
    );
  }

  /* ════════════════════════════════════════════════ */
  /*  STEP 4 — SUMMARY + CHECKOUT (unified)          */
  /* ════════════════════════════════════════════════ */
  if (step === "summary") {
    const activeMethod: PayMethod = payMethod === "paypal" ? "ath_movil" : (payMethod || "ath_movil");
    const athBtnDark = resolvedTheme === "dark";

    // Phase 1B.6 — eligible sellers for "¿Quién vendió?" picker (commission_rate > 0)
    const eligibleSellers = barbers
      .filter((b) => typeof b.commission_rate === "number" && (b.commission_rate as number) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const sellerLabel = sellingBarberId
      ? (barbers.find((b) => b.id === sellingBarberId)?.name ?? t("checkout.shopDirect"))
      : t("checkout.shopDirect");

    return (
      <motion.div key="summary" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col h-full">
        <div className="px-4 pt-6">
          <BackButton onClick={goBack} label={t("checkout.back")} />
        </div>

        {/* Receipt */}
        <div className="flex-1 px-4 pt-4 pb-[calc(264px+env(safe-area-inset-bottom,0px))] overflow-y-auto">
          <h2 className="text-[11px] uppercase tracking-wider font-semibold mb-3" style={{ color: "var(--text-tertiary)" }}>
            {t("checkout.receipt")}
          </h2>
          <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-surface)", border: "0.5px solid var(--divider)" }}>
            <div className="p-4 space-y-3">
              {cart.map((c) => (
                <div key={c.product.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                      style={{ background: "var(--bg-surface)", color: "var(--text-secondary)" }}>{c.quantity}</span>
                    <span className="text-[14px] truncate" style={{ color: "var(--text-primary)" }}>{c.product.name}</span>
                  </div>
                  <span className="text-[14px] font-semibold flex-shrink-0 ml-2" style={{ color: "var(--text-primary)" }}>
                    {fmt(c.product.price_cents * c.quantity)}
                  </span>
                </div>
              ))}
            </div>
            {selectedAppointment && (
              <div className="px-4 py-3 space-y-1" style={{ borderTop: "1px solid var(--divider)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingBag size={14} style={{ color: "var(--text-tertiary)" }} />
                    <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{selectedAppointment.service_name}</span>
                  </div>
                  {selectedAppointment.paid ? (
                    <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>Paid</span>
                  ) : (
                    <div className="text-right">
                      {voucherApplied && (selectedAppointment as any).benefit_discount_cents > 0 && (
                        <span className="text-[11px] line-through mr-1.5" style={{ color: "var(--text-tertiary)" }}>
                          {fmt(selectedAppointment.price_cents)}
                        </span>
                      )}
                      <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {fmt(appointmentCharge)}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  {selectedAppointment.client_name} · {new Date(selectedAppointment.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            )}

            {/* Birthday gifts now flow through the unified voucher input below (kind='birthday'). */}


            {/* Benefit voucher code — applied via code or pre-attached from booking */}
            {selectedAppointment && !selectedAppointment.paid && (
              <div className="px-4 py-3" style={{ borderTop: "1px solid var(--divider)" }}>
                {benefitVoucher && voucherApplied ? (
                  <div
                    className="w-full flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "var(--accent-color)", color: "var(--bg-base)" }}
                  >
                    <div className="flex items-center gap-2 min-w-0 text-left">
                      <Gift size={16} className="icon-bold shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold leading-tight">Beneficio aplicado: {benefitVoucher.title}</p>
                        <p className="text-[10px] opacity-80 font-mono tabular-nums tracking-widest">{benefitVoucher.code}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        setVoucherApplied(false);
                        setBenefitVoucher(null);
                        setVoucherInput("");
                        if (appointmentId) {
                          await supabase
                            .from("appointments")
                            .update({ applied_benefit_redemption_id: null, benefit_discount_cents: 0 })
                            .eq("id", appointmentId);
                          setSelectedAppointment((prev) =>
                            prev ? ({ ...prev, applied_benefit_redemption_id: null, benefit_discount_cents: 0 } as any) : prev,
                          );
                        }
                      }}
                      className="text-[11px] font-bold underline opacity-90"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={voucherInput}
                      onChange={(e) => setVoucherInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                      placeholder="Código de beneficio"
                      maxLength={6}
                      className="flex-1 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest tabular-nums outline-none"
                      style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
                    />
                    <button
                      type="button"
                      disabled={voucherInput.length < 4 || voucherValidating}
                      onClick={validateVoucherCode}
                      className="rounded-xl px-4 py-2.5 text-[12px] font-bold disabled:opacity-50"
                      style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
                    >
                      {voucherValidating ? "..." : "Aplicar"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tip selector — only for appointment flows */}

            {appointmentId && appointmentCharge > 0 && (
              <div className="px-4 py-3" style={{ borderTop: "1px solid var(--divider)" }}>
                <p className="text-[11px] uppercase tracking-wider font-semibold mb-2.5" style={{ color: "var(--text-tertiary)" }}>
                  Propina
                </p>
                <div className="flex gap-2">
                  {TIP_PRESETS.map((preset, idx) => {
                    const isSelected = selectedTipIdx === idx && !showCustomTip;
                    const tipAmt = Math.round(appointmentCharge * preset.pct);
                    return (
                      <button
                        key={idx}
                        onClick={() => { setSelectedTipIdx(idx); setShowCustomTip(false); }}
                        className="flex-1 flex flex-col items-center gap-0.5 py-2.5 rounded-xl transition-all active:scale-95"
                        style={{
                          background: isSelected ? "var(--accent-color)" : "var(--bg-surface)",
                          color: isSelected ? "#fff" : "var(--text-primary)",
                          border: `1.5px solid ${isSelected ? "var(--accent-color)" : "var(--divider)"}`,
                        }}
                      >
                        <span className="text-[13px] font-bold">{preset.label}</span>
                        {preset.pct > 0 && (
                          <span className="text-[10px] font-medium" style={{ opacity: 0.7 }}>
                            {fmt(tipAmt)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center mt-2">
                  <button
                    onClick={() => { setShowCustomTip(!showCustomTip); setSelectedTipIdx(null); }}
                    className="text-[12px] font-semibold"
                    style={{ color: "var(--accent-color)" }}
                  >
                    {showCustomTip ? "Cancelar" : "Monto personalizado"}
                  </button>
                </div>
                {showCustomTip && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[16px] font-bold" style={{ color: "var(--text-primary)" }}>$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={customTip}
                      onChange={(e) => setCustomTip(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                      className="flex-1 h-10 rounded-xl px-3 text-[16px] font-bold tabular-nums"
                      style={{
                        background: "var(--bg-surface)",
                        color: "var(--text-primary)",
                        border: "1.5px solid var(--accent-color)",
                        outline: "none",
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Tip + Total line */}
            <div className="px-4 py-3" style={{ borderTop: "1px solid var(--divider)" }}>
              {tipCents > 0 && (
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Subtotal</span>
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>{fmt(totalCents)}</span>
                </div>
              )}
              {tipCents > 0 && (
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Propina</span>
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>{fmt(tipCents)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="font-black text-xl" style={{ color: "var(--text-primary)", letterSpacing: "-0.04em" }}>Total</span>
                <span className="text-xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>{fmt(grandTotalCents)}</span>
              </div>
            </div>
            {barberName && (
              <div className="px-4 py-2.5" style={{ borderTop: "1px solid var(--divider)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{t("checkout.attachBarber")}</span>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{barberName}</span>
                </div>
              </div>
            )}
            {/* Phase 1B.6 — "¿Quién vendió?" picker */}
            <button
              onClick={() => setShowSellerPicker(true)}
              className="w-full px-4 py-2.5 flex items-center justify-between active:opacity-70 transition-opacity"
              style={{ borderTop: "1px solid var(--divider)" }}
            >
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{t("checkout.soldBy")}</span>
              <span className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{sellerLabel}</span>
                <span className="text-[11px]" style={{ color: "var(--accent-color)" }}>›</span>
              </span>
            </button>
            {clientAthLast4 && (
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: "1px solid var(--divider)" }}>
                <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>Cliente registró ATH</span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(0,102,179,0.12)", color: "#0066B3" }}>
                  ATH ••{clientAthLast4}
                </span>
              </div>
            )}
          </div>

          {/* Payment UI */}
          <AnimatePresence mode="wait">
            {activeMethod === "ath_movil" && payMethod === "ath_movil" && (
              <motion.div key="ath-inline" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <div className="rounded-2xl p-4 text-center" style={{ background: "var(--bg-surface)", border: "0.5px solid var(--divider)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>ATH Móvil manual</p>
                  <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                    Ya recibido fuera del sistema. Se registrará sin volver a cobrar.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Fixed bottom payment section */}
        <div
          className="fixed left-0 right-0 bottom-0 z-[120] px-4 pt-4 pb-3 space-y-3"
          style={{
            background: "var(--bg-base)",
            borderTop: "1px solid var(--divider)",
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
            transform: "translateZ(0)",
          }}
        >
          <div className="mx-auto w-full space-y-3" style={{ maxWidth: 430 }}>
          <div className="flex items-center justify-between gap-4 pb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[18px] font-extrabold" style={{ color: "var(--text-primary)" }}>Total</span>
                <Info size={16} style={{ color: "var(--text-tertiary)" }} />
              </div>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--text-secondary)" }}>Incluye IVU y propina</p>
            </div>
            <span className="text-[22px] font-extrabold tabular-nums shrink-0" style={{ color: "var(--text-primary)" }}>{fmt(grandTotalCents)}</span>
          </div>
          <button
            onClick={() => setShowMethodPicker(true)}
            className="w-full py-3 rounded-2xl text-[13px] font-semibold uppercase tracking-wider active:scale-[0.98] transition-transform bg-secondary mx-0"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--divider)" }}
          >
            {t("checkout.changePaymentOption")}
          </button>

          {(activeMethod === "ath_movil" && payMethod !== "ath_movil") && (
            <button
              onClick={() => setPayMethod("ath_movil")}
              className="w-full py-4 rounded-2xl text-[15px] flex items-center justify-center gap-1 active:scale-[0.98] transition-transform"
              style={{
                background: athBtnDark ? "#1a1a1a" : "#E95125",
                color: "#fff",
                border: athBtnDark ? "1px solid rgba(255,255,255,0.12)" : "none",
              }}
            >
              <span style={{ fontWeight: 400 }}>{t("checkout.payWith")}</span>
              <span style={{ fontWeight: 900, letterSpacing: "-0.5px" }}>ATH</span>
              <span style={{ fontWeight: 400, fontStyle: "italic" }}>móvil</span>
            </button>
          )}
          {activeMethod === "cash" && (
            <button onClick={handleCashPayment} disabled={processing}
              className="w-full py-4 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform disabled:opacity-50"
              style={{ background: "#22c55e", color: "#fff" }}>
              {processing ? <Loader2 size={18} className="animate-spin" /> : <Banknote size={20} />}
              Efectivo — {fmt(grandTotalCents)}
            </button>
          )}
          {/* Phase 1B.UX.3.A — Cancel checkout */}
          <div className="pt-3 flex justify-center">
            <button
              onClick={() => setShowCancelDialog(true)}
              className="text-[12px] font-medium active:opacity-60 transition-opacity"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("checkout.cancel")}
            </button>
          </div>
          </div>
        </div>

        <PaymentMethodSheet
          open={showMethodPicker}
          onOpenChange={setShowMethodPicker}
          onSelectCard={() => {
            setPayMethod("stripe");
            setShowMethodPicker(false);
          }}
          isEs={language === "es"}
          isLoading={false}
          loadingMethod={null}
          
          showPayPal={false}
          avoidBottomNav
        />


        {/* Phase 1B.6 — Seller picker modal */}
        <AnimatePresence>
          {showSellerPicker && (
            <>
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-50"
                style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
                onClick={() => setShowSellerPicker(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }}
                transition={{ type: "spring", damping: 28, stiffness: 340 }}
                className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
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
                      {t("checkout.soldBy")}
                    </span>
                  </div>
                  <h2 className="text-center uppercase whitespace-pre-line mb-1" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}>
                    {t("checkout.selectSeller")}
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 18, paddingBottom: 4 }}>
                    {/* Shop option */}
                    <button
                      onClick={() => {
                        setSellingBarberId(null);
                        sellerManuallySetRef.current = true;
                        setShowSellerPicker(false);
                      }}
                      className="w-full text-center font-semibold transition-all active:scale-[0.97]"
                      style={{
                        background: sellingBarberId === null ? "#111111" : "rgba(0,0,0,0.04)",
                        color: sellingBarberId === null ? "#c9a882" : "#111111",
                        fontSize: 13,
                        padding: "12px 0",
                        borderRadius: "var(--radius-control)",
                        border: "none",
                      }}
                    >
                      {t("checkout.shopDirect")}
                    </button>
                    {eligibleSellers.map((b) => {
                      const isSelected = sellingBarberId === b.id;
                      return (
                        <button
                          key={b.id}
                          onClick={() => {
                            setSellingBarberId(b.id);
                            sellerManuallySetRef.current = true;
                            setShowSellerPicker(false);
                          }}
                          className="w-full text-center font-semibold transition-all active:scale-[0.97]"
                          style={{
                            background: isSelected ? "#111111" : "rgba(0,0,0,0.04)",
                            color: isSelected ? "#c9a882" : "#111111",
                            fontSize: 13,
                            padding: "12px 0",
                            borderRadius: "var(--radius-control)",
                            border: "none",
                          }}
                        >
                          {b.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Phase 1B.UX.3.A — Cancel checkout confirmation */}
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent className="max-w-[320px] rounded-2xl">
            <DialogHeader>
              <DialogTitle>{t("checkout.cancelConfirmTitle")}</DialogTitle>
              <DialogDescription className="sr-only">{t("checkout.cancelConfirmTitle")}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col gap-2 sm:flex-col sm:space-x-0">
              <button
                onClick={() => {
                  setShowCancelDialog(false);
                  if (!returnToAppointment()) resetCheckout();
                }}
                className="w-full py-3 rounded-xl text-[14px] font-bold active:scale-[0.98] transition-transform"
                style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
              >
                {t("checkout.cancelConfirmYes")}
              </button>
              <button
                onClick={() => setShowCancelDialog(false)}
                className="w-full py-3 rounded-xl text-[14px] font-semibold active:opacity-70"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "0.5px solid var(--divider)" }}
              >
                {t("checkout.cancelConfirmNo")}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    );
  }

  return null;
}

/* ─── Stock dot ─── */
function StockDot({ count, threshold }: { count: number; threshold: number }) {
  const color = count === 0 ? "var(--red)" : count <= threshold ? "var(--yellow)" : "var(--green)";
  return (
    <span className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[11px] font-medium tabular-nums" style={{ color: "var(--text-tertiary)" }}>{count}</span>
    </span>
  );
}




/* ─── Shared back button ─── */
function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1 text-[13px] font-medium active:opacity-60 transition-opacity"
      style={{ color: "var(--accent-color)" }}>
      <ChevronLeft size={16} /> {label}
    </button>
  );
}
