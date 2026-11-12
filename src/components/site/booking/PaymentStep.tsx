// Final paywall step in the pay-then-book flow.
//
// Receives a draftId (NOT an appointmentId — the appointment doesn't exist
// yet). On successful payment from any method, the server creates the Acuity
// appointment in `commit-and-book` (or commitDraft via webhook/poll) and
// returns a CommitResult.
//
// New layout (Phase 2 rebuild — "ATH-first" with explicit method picker):
//   ┌──────────────────────────────────┐
//   │ Hold timer pill                  │
//   │ AppointmentSummaryCard           │
//   │ TipSelector                      │
//   │ ATH Móvil orange button (PRIMARY)│
//   │ "Cambiar método de pago" (ghost) │
//   │ Barber + datetime context        │
//   │ Abandonment fineprint            │
//   └──────────────────────────────────┘
//
// Tapping "Cambiar método de pago" opens PaymentMethodSheet (bottom sheet)
// with three options: Card / Apple Pay / PayPal. Card and Apple Pay both
// redirect to Stripe Checkout hosted (Stripe shows Apple Pay automatically
// on supported devices). PayPal triggers the existing full-page redirect.
//
// Tip locks at click-time for ALL methods: Stripe Checkout amount is set
// at session creation; PayPal order amount is set at order creation; ATH
// reads totalCents at click-time. No live tip-sync round-trips needed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, CheckCircle2, AlertTriangle, CreditCard, Info, Gift, X, Loader2 } from "lucide-react";
import { TipSelector } from "./TipSelector";
import { AthMovilRestButton } from "./AthMovilRestButton";
import {
  AppointmentSummaryCard,
  type SummaryLine,
} from "./AppointmentSummaryCard";
import { PaymentMethodSheet, type PaymentMethodKey } from "./PaymentMethodSheet";
import { usePayPalRedirect } from "./usePayPalRedirect";

import { supabase } from "@/integrations/supabase/client";

const HOLD_SECONDS = 15 * 60;

export interface CommitResult {
  appointmentId: string;
  acuityId: number;
  isReturning?: boolean;
  returningName?: string | null;
  cardOnFile?: { brand: string | null; last4: string | null } | null;
  appointment?: {
    starts_at: string;
    service_name: string;
    price: string;
    duration: number;
  };
}

export type PaymentFlowSource = "public_paywall" | "client_portal";

interface PaymentStepProps {
  draftId: string;
  /** Subtotal in cents (services + addons + products). Tip is added on top. */
  basePriceCents: number;
  /** Headline service name, used as fallback summary label. */
  serviceName: string;
  /**
   * Optional itemized lines for the summary card. If omitted, a single line
   * `[{ label: serviceName, unitCents: basePriceCents }]` is rendered.
   */
  lineItems?: SummaryLine[];
  /** @deprecated kept for prop-compat; saved-card UX is now handled by Stripe Link inside Checkout. */
  savedCard?: { brand: string | null; last4: string | null } | null;
  accent: string;
  isEs: boolean;
  /** 10-digit phone (no country code) — used by ATH Móvil. */
  phone: string;
  /** Optional contact email — surfaced on Stripe Checkout for receipts. */
  email?: string;
  barberName?: string;
  barberColor?: string;
  /** ISO datetime of the appointment slot (display only). */
  startsAt?: string;
  /** Distinguishes the public paywall from the logged-in client portal —
   *  passed to create-booking-checkout for Stripe metadata + analytics. */
  flowSource?: PaymentFlowSource;
  onPaid: (result: CommitResult) => void;
  onAbandon: () => void;
  avoidBottomNav?: boolean;
}

export function PaymentStep({
  draftId,
  basePriceCents,
  serviceName,
  lineItems,
  accent,
  isEs,
  phone,
  email,
  barberName,
  barberColor,
  startsAt,
  flowSource = "public_paywall",
  onPaid,
  onAbandon,
  avoidBottomNav = false,
}: PaymentStepProps) {
  /* ── Hold timer ───────────────────────────────────────────── */
  const [secondsLeft, setSecondsLeft] = useState(HOLD_SECONDS);
  const [paid, setPaid] = useState(false);
  const paidRef = useRef(false);

  /* ── Tip + totals ─────────────────────────────────────────── */
  const [tipPercent, setTipPercent] = useState<number | "custom" | null>(18);
  const [tipCustomCents, setTipCustomCents] = useState(0);

  const tipCents = useMemo(() => {
    if (tipPercent === "custom") return tipCustomCents;
    if (typeof tipPercent === "number")
      return Math.round((basePriceCents * tipPercent) / 100);
    return 0;
  }, [tipPercent, tipCustomCents, basePriceCents]);

  const totalCents = basePriceCents + tipCents;
  // displayedTotalCents (with benefit discount) is computed below near
  // the benefit code state; declared first as `totalCents` for the
  // legacy props that still expect the un-discounted figure.

  /* ── Summary lines ────────────────────────────────────────── */
  const summaryLines: SummaryLine[] = useMemo(() => {
    if (lineItems && lineItems.length > 0) return lineItems;
    return [
      { key: "service", label: serviceName, unitCents: basePriceCents },
    ];
  }, [lineItems, serviceName, basePriceCents]);

  /* ── Hold-timer countdown ─────────────────────────────────── */
  useEffect(() => {
    if (paid) return;
    const id = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          if (!paidRef.current) onAbandon();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid]);

  /* ── Shared commit-success handler ────────────────────────
     onPaid is part of the legacy synchronous-commit contract from the
     embedded-Stripe era. All current methods (ATH / Stripe Checkout /
     PayPal) navigate the user to /citas/confirmando which morphs into the
     success state via BookingConfirming. We keep `onPaid` in the prop
     signature so existing call sites compile; it's reserved for any future
     inline-commit path (e.g. saved-card one-tap). */
  const [commitError, setCommitError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleSuccess = useCallback(
    (result: CommitResult) => {
      paidRef.current = true;
      setPaid(true);
      onPaid(result);
    },
    [onPaid],
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _setCommitError = setCommitError;


  /* ── Method picker sheet ──────────────────────────────────── */
  const [methodSheetOpen, setMethodSheetOpen] = useState(false);
  const [redirectingMethod, setRedirectingMethod] =
    useState<PaymentMethodKey | null>(null);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  /* ── Saved-card one-tap (off_session) ─────────────────────── */
  const [savedCardInfo, setSavedCardInfo] = useState<{ brand: string; last4: string } | null>(null);
  const [chargingSavedCard, setChargingSavedCard] = useState(false);
  const [savedCardError, setSavedCardError] = useState<string | null>(null);

  // Look up saved card on mount (matches by phone/email/client_id behind the scenes)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("client-booking-pay", {
          body: { action: "draft-lookup-saved-card", draftId },
        });
        if (cancelled) return;
        if (data?.hasCard) {
          setSavedCardInfo({ brand: data.brand, last4: data.last4 });
        }
      } catch (e) {
        // Silent — saved card is optional
        console.debug("[PaymentStep] saved card lookup skipped:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [draftId]);

  const handleSavedCardCharge = useCallback(async () => {
    if (chargingSavedCard) return;
    setChargingSavedCard(true);
    setSavedCardError(null);
    try {
      const { data, error } = await supabase.functions.invoke("client-booking-pay", {
        body: { action: "draft-charge-saved-card", draftId, tipCents },
      });
      const payload = (data || {}) as any;
      if (error || payload?.error) {
        const errKey = payload?.error;
        const friendly =
          errKey === "authentication_required" ? (isEs
            ? "Tu banco requiere verificación adicional. Usa otro método."
            : "Your bank requires extra verification. Try another method.")
          : errKey === "stripe_declined" ? (isEs
            ? `Tarjeta rechazada${payload?.decline_code ? ` (${payload.decline_code})` : ""}. Usa otro método.`
            : `Card declined${payload?.decline_code ? ` (${payload.decline_code})` : ""}. Try another method.`)
          : errKey === "no_reusable_card" ? (isEs
            ? "No hay tarjeta guardada cobrable. Usa otro método."
            : "No charge-eligible saved card. Try another method.")
          : (payload?.message || error?.message || (isEs ? "No se pudo cobrar." : "Could not charge."));
        setSavedCardError(friendly);
        setChargingSavedCard(false);
        return;
      }
      if (payload?.success && payload?.appointment_id) {
        paidRef.current = true;
        setPaid(true);
        onPaid({
          appointmentId: payload.appointment_id,
          acuityId: payload.acuity_id,
          cardOnFile: payload.card ? { brand: payload.card.brand, last4: payload.card.last4 } : null,
        });
        return;
      }
      setSavedCardError(isEs ? "Respuesta inesperada del servidor." : "Unexpected server response.");
    } catch (e: any) {
      setSavedCardError(e?.message || (isEs ? "Error de conexión." : "Connection error."));
    } finally {
      setChargingSavedCard(false);
    }
  }, [chargingSavedCard, draftId, tipCents, isEs, onPaid]);

  /* ── Benefit code (client portal only) ──────────────────────
     The RPC bakes the discount into draft.total_cents and returns the
     discount amount + benefit title. We render a "−$X.XX" line and the
     gateways (Stripe Checkout / PayPal / ATH) all read draft.total_cents
     so they automatically charge the discounted amount. */
  const benefitsEnabled = flowSource === "client_portal";
  const [benefitInput, setBenefitInput] = useState("");
  const [benefitVoucher, setBenefitVoucher] = useState<
    { code: string; title: string; discountCents: number } | null
  >(null);
  const [benefitLoading, setBenefitLoading] = useState(false);
  const [benefitError, setBenefitError] = useState<string | null>(null);

  const applyBenefitCode = useCallback(async () => {
    const code = benefitInput.trim().toUpperCase();
    if (!code || benefitLoading) return;
    setBenefitLoading(true);
    setBenefitError(null);
    try {
      const { data, error } = await (supabase.rpc as any)(
        "apply_benefit_code_to_draft",
        { _code: code, _draft_id: draftId },
      );
      if (error) {
        const key = (error.message || "").toLowerCase();
        const friendly =
          key.includes("code_not_found") ? (isEs ? "Código no encontrado." : "Code not found.")
          : key.includes("code_already_redeemed") ? (isEs ? "Este código ya fue usado." : "This code was already used.")
          : key.includes("code_expired") ? (isEs ? "El código está vencido." : "The code has expired.")
          : key.includes("code_belongs_to_other_client") ? (isEs ? "El código no pertenece a tu cuenta." : "The code is not on your account.")
          : key.includes("benefit_not_eligible_for_service") ? (isEs ? "Este beneficio no aplica para el servicio que escogiste." : "This benefit does not apply to the service you picked.")
          : key.includes("service_not_found") ? (isEs ? "No pudimos identificar el servicio." : "Could not identify the service.")
          : key.includes("draft_not_pending") || key.includes("draft_not_found") ? (isEs ? "Tu reserva ya no acepta códigos." : "This booking no longer accepts codes.")
          : (isEs ? "No pudimos aplicar el código." : "Could not apply the code.");
        setBenefitError(friendly);
        return;
      }
      const payload = (data || {}) as {
        code?: string;
        benefit_title_es?: string;
        benefit_title_en?: string;
        discount_cents?: number;
      };
      setBenefitVoucher({
        code: payload.code || code,
        title: (isEs ? payload.benefit_title_es : payload.benefit_title_en) || "Beneficio",
        discountCents: Number(payload.discount_cents) || 0,
      });
      setBenefitInput("");
    } catch (e: any) {
      setBenefitError(e?.message || (isEs ? "Error de conexión." : "Connection error."));
    } finally {
      setBenefitLoading(false);
    }
  }, [benefitInput, benefitLoading, draftId, isEs]);

  const removeBenefitCode = useCallback(async () => {
    if (benefitLoading) return;
    setBenefitLoading(true);
    setBenefitError(null);
    try {
      await (supabase.rpc as any)("remove_benefit_code_from_draft", { _draft_id: draftId });
      setBenefitVoucher(null);
    } catch (e: any) {
      setBenefitError(e?.message || (isEs ? "Error de conexión." : "Connection error."));
    } finally {
      setBenefitLoading(false);
    }
  }, [benefitLoading, draftId, isEs]);

  /* Recompute displayed total with discount baked in. Floor at $0 — if the
     discount fully covers the service, the user still owes the tip. */
  const discountCents = benefitVoucher?.discountCents || 0;
  const displayedTotalCents = Math.max(0, basePriceCents + tipCents - discountCents);
  /* "Fully covered" = the benefit covers the entire balance (incl. tip).
     When true, we hide all paid-gateway buttons and show a single
     "Redimir beneficio" CTA that calls commit-benefit-only. */
  const fullyCovered = benefitVoucher !== null && displayedTotalCents === 0;

  /* ── Redeem-only commit (benefit fully covers the balance) ── */
  const [redeemingBenefit, setRedeemingBenefit] = useState(false);
  const handleRedeemBenefit = useCallback(async () => {
    if (redeemingBenefit || paid) return;
    setRedeemingBenefit(true);
    setCommitError(null);
    try {
      const { data, error } = await supabase.functions.invoke("pay-then-book", {
        body: { action: "commit-benefit-only", draftId },
      });
      const payload = (data || {}) as {
        success?: boolean;
        appointmentId?: string;
        acuityId?: number;
        clientId?: string;
        appointment?: CommitResult["appointment"];
        error?: string;
        message?: string;
        messageEn?: string;
      };
      if (error || payload.error || !payload.success || !payload.appointmentId) {
        const friendly =
          payload.error === "slot_unavailable" ? (isEs ? payload.message! : payload.messageEn!)
          : payload.error === "balance_not_zero" ? (isEs ? "El balance ya no es $0.00. Revisa la propina." : "Balance is no longer $0.00. Check the tip.")
          : payload.error === "no_benefit_applied" ? (isEs ? "No hay beneficio aplicado." : "No benefit applied.")
          : payload.error === "draft_expired" ? (isEs ? "Tu reserva expiró. Vuelve a empezar." : "Your booking expired. Please start over.")
          : (isEs ? payload.message : payload.messageEn || payload.message)
            || (isEs ? "No pudimos redimir el beneficio." : "Could not redeem the benefit.");
        setCommitError(friendly);
        setRedeemingBenefit(false);
        return;
      }
      paidRef.current = true;
      setPaid(true);
      onPaid({
        appointmentId: payload.appointmentId,
        acuityId: payload.acuityId || 0,
        appointment: payload.appointment,
      });
    } catch (e: unknown) {
      const msg = (e as Error)?.message || (isEs ? "Error de conexión." : "Connection error.");
      setCommitError(msg);
      setRedeemingBenefit(false);
    }
  }, [draftId, isEs, onPaid, paid, redeemingBenefit]);



  const paypalRedirect = usePayPalRedirect({
    draftId,
    isEs,
    onError: (msg) => {
      setRedirectError(msg);
      setRedirectingMethod(null);
      setMethodSheetOpen(false);
    },
  });

  /* Locks tipCents into the draft row server-side. MUST run before every
     gateway redirect/push so Stripe Checkout, ATH push, and PayPal all
     charge the right total. Failure here aborts the redirect (we'd rather
     show an error than charge the wrong amount). */
  const lockTipOnDraft = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke("pay-then-book", {
        body: { action: "update-draft-tip", draftId, tipCents },
      });
      if (error || (data && (data as { error?: string }).error)) {
        console.warn("[PaymentStep] update-draft-tip failed", { error, data });
        setRedirectError(
          isEs
            ? "No pudimos actualizar la propina. Intenta de nuevo."
            : "Could not update the tip. Please try again.",
        );
        return false;
      }
      return true;
    } catch (e) {
      console.warn("[PaymentStep] update-draft-tip exception", e);
      setRedirectError(
        isEs
          ? "Error de conexión. Intenta de nuevo."
          : "Connection error. Please try again.",
      );
      return false;
    }
  }, [draftId, tipCents, isEs]);

  const handleStripeRedirect = useCallback(
    async (hint: PaymentMethodKey) => {
      if (redirectingMethod) return;
      setRedirectingMethod(hint);
      setRedirectError(null);

      const tipLocked = await lockTipOnDraft();
      if (!tipLocked) {
        setRedirectingMethod(null);
        return;
      }

      try {
        const returnOrigin = window.location.origin;
        console.log("[PaymentStep] invoking create-booking-checkout", {
          draftId,
          flowSource,
          hint,
          returnOrigin,
          tipCents,
        });
        const { data, error } = await supabase.functions.invoke(
          "create-booking-checkout",
          {
            body: {
              draftId,
              returnOrigin,
              flowSource,
              // hint is informational only — Stripe Checkout shows Apple Pay
              // automatically on supported devices regardless. Sent so we can
              // analyze conversion per intended method server-side later.
              paymentMethodHint: hint,
            },
          },
        );

        // supabase.functions.invoke v2.95+ returns the parsed JSON body in
        // `data` even on non-2xx responses, AND populates `error` with a
        // FunctionsHttpError whose `.context` is the raw Response. We merge
        // both so we get the real `error` code + localized message instead
        // of a generic "intenta de nuevo".
        let payload = (data || {}) as {
          url?: string;
          error?: string;
          message?: string;
          messageEn?: string;
        };
        let httpStatus: number | undefined;
        if (error && (error as { context?: Response }).context instanceof Response) {
          const ctxRes = (error as { context: Response }).context;
          httpStatus = ctxRes.status;
          try {
            const cloned = ctxRes.clone();
            const parsed = await cloned.json();
            if (parsed && typeof parsed === "object") {
              payload = { ...payload, ...parsed };
            }
          } catch {
            // body wasn't JSON — fall back to generic message below.
          }
        }

        if (error || payload.error || !payload.url) {
          // Loud diagnostic so the real failure reason is always visible in
          // the console (status + error key + raw payload). Without this,
          // every Stripe failure looked like a generic "connection error".
          console.warn("[PaymentStep] create-booking-checkout failed", {
            httpStatus,
            errorKey: payload.error,
            message: payload.message,
            messageEn: payload.messageEn,
            transportError: error?.message,
            payload,
          });

          // Map known error keys to clear, actionable user messages so the
          // person isn't left guessing why a paid path won't start.
          const errorKey = payload.error;
          let friendly: string | undefined;
          switch (errorKey) {
            case "draft_not_found":
            case "draft_expired":
              friendly = isEs
                ? "Tu reserva ha expirado. Vuelve a empezar."
                : "Your booking has expired. Please start over.";
              break;
            case "draft_not_pending":
              friendly = isEs
                ? "Esta reserva ya fue procesada."
                : "This booking was already processed.";
              break;
            case "draft_fetch_failed":
              friendly = isEs
                ? "No pudimos cargar tu reserva. Intenta de nuevo en unos segundos."
                : "We couldn't load your booking. Please try again in a few seconds.";
              break;
            case "stripe_session_failed":
              friendly = isEs
                ? "Stripe no respondió. Intenta de nuevo o usa otro método."
                : "Stripe didn't respond. Please try again or use another method.";
              break;
            case "invalid_return_origin":
            case "invalid_total":
            case "invalid_json":
            case "missing_draft_id":
              friendly = isEs
                ? "Solicitud inválida. Refresca la página e intenta de nuevo."
                : "Invalid request. Refresh the page and try again.";
              break;
          }

          const localized =
            friendly ||
            (isEs ? payload.message : payload.messageEn || payload.message);
          throw new Error(
            localized ||
              (isEs
                ? "No se pudo iniciar el pago. Intenta de nuevo."
                : "Could not start payment. Please try again."),
          );
        }

        // Full-page redirect — keep redirectingMethod set so buttons stay
        // disabled until the navigation actually happens.
        window.location.href = payload.url;
      } catch (e) {
        const msg =
          (e as Error)?.message ||
          (isEs
            ? "No se pudo iniciar el pago. Intenta de nuevo."
            : "Could not start payment. Please try again.");
        console.warn("[PaymentStep] handleStripeRedirect failed", e);
        setRedirectError(msg);
        setRedirectingMethod(null);
        setMethodSheetOpen(false);
      }
    },
    [draftId, flowSource, isEs, redirectingMethod, tipCents, lockTipOnDraft],
  );

  const handlePayPal = useCallback(async () => {
    if (redirectingMethod) return;
    setRedirectingMethod("paypal");
    setRedirectError(null);
    const tipLocked = await lockTipOnDraft();
    if (!tipLocked) {
      setRedirectingMethod(null);
      return;
    }
    void paypalRedirect.redirect();
  }, [paypalRedirect, redirectingMethod, lockTipOnDraft]);

  /* ── Paid splash ──────────────────────────────────────────── */
  if (paid) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <CheckCircle2 size={56} style={{ color: accent }} className="mb-3" />
        <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          {isEs ? "¡Pago confirmado!" : "Payment confirmed!"}
        </p>
      </div>
    );
  }

  /* ── Render ───────────────────────────────────────────────── */
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const lowTime = secondsLeft < 60;
  const anyRedirecting = redirectingMethod !== null;
  const footerSpacer = "calc(250px + env(safe-area-inset-bottom, 0px))";

  return (
    <div className="space-y-4">
      {/* Hold timer */}
      <div
        className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-[12px] font-semibold"
        style={{
          background: lowTime ? "rgba(239,68,68,0.1)" : "var(--bg-surface-2)",
          color: lowTime ? "#ef4444" : "var(--text-secondary)",
        }}
      >
        <Clock size={13} />
        {isEs ? "Cita reservada por" : "Slot held for"}{" "}
        <span className="font-bold tabular-nums">
          {minutes}:{seconds.toString().padStart(2, "0")}
        </span>
      </div>

      {/* Summary card */}
      <AppointmentSummaryCard
        lines={summaryLines}
        subtotalCents={basePriceCents}
        tipCents={tipCents}
        totalCents={displayedTotalCents}
        benefitDiscountCents={discountCents}
        benefitLabel={benefitVoucher?.title}
        isEs={isEs}
      />


      {/* Tip selector */}
      <TipSelector
        basePriceCents={basePriceCents}
        selectedPercent={tipPercent}
        customCents={tipCustomCents}
        onChange={(p, c) => {
          setTipPercent(p);
          setTipCustomCents(c);
        }}
        isEs={isEs}
        accent={accent}
      />

      {/* Generic commit error (any method) */}
      {commitError && (
        <div
          className="rounded-xl p-3 text-[12px]"
          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
        >
          <AlertTriangle size={12} className="inline mr-1" />
          {commitError}
        </div>
      )}

      {savedCardError && (
        <p className="text-[12px] text-center" style={{ color: "#ef4444" }} role="alert">
          {savedCardError}
        </p>
      )}

      {redirectError && (
        <p
          className="text-[12px] text-center"
          style={{ color: "#ef4444" }}
          role="alert"
        >
          {redirectError}
        </p>
      )}

      {/* Barber + datetime context */}
      {(barberName || startsAt) && (
        <div
          className="rounded-2xl p-4 space-y-2 mt-2"
          style={{
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 14,
          }}
        >
          {barberName && (
            <div className="flex items-center gap-2 text-[13px]">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: barberColor || accent }}
              />
              <span style={{ color: "var(--text-primary)" }}>{barberName}</span>
            </div>
          )}
          {startsAt && (
            <div
              className="text-[13px] capitalize"
              style={{ color: "var(--text-secondary)" }}
            >
              {new Date(startsAt).toLocaleString(isEs ? "es-PR" : "en-US", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
                timeZone: "America/Puerto_Rico",
              })}
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-center" style={{ color: "var(--text-tertiary)" }}>
        <AlertTriangle size={10} className="inline mr-1" />
        {isEs
          ? "El horario solo se reserva al confirmar el pago. Sin pago, no hay cita."
          : "Your slot is only reserved when payment is confirmed. No payment, no booking."}
      </p>

      {/* Spacer so scrollable content clears the fixed payment actions */}
      <div aria-hidden style={{ height: footerSpacer }} />

      {/* Fixed bottom action bar */}
      <div
        className="fixed left-0 right-0 bottom-0 z-[120]"
        style={{
          background: "var(--bg-base)",
          borderTop: "1px solid var(--divider)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          transform: "translateZ(0)",
        }}
      >
        <div className="mx-auto w-full max-w-md px-4 pt-4 pb-3 space-y-3">
          {/* Benefit code redemption (client portal only) — sits ABOVE the
              ATH button and the "Change payment method" picker, but inside
              the same fixed action band so it's always visible. */}
          {benefitsEnabled && (
            <div className="space-y-2">
              {benefitVoucher ? (
                <div
                  className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
                  style={{
                    background: "rgba(34,197,94,0.10)",
                    border: "1px solid rgba(34,197,94,0.35)",
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Gift size={16} className="icon-bold shrink-0" style={{ color: "#22c55e" }} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                        {isEs ? "Beneficio aplicado" : "Benefit applied"}
                      </p>
                      <p className="text-[11px] font-mono tabular-nums tracking-widest" style={{ color: "var(--text-secondary)" }}>
                        {benefitVoucher.code}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeBenefitCode}
                    disabled={benefitLoading}
                    aria-label={isEs ? "Quitar código" : "Remove code"}
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center active:opacity-70 disabled:opacity-40"
                    style={{ background: "var(--bg-surface-2)" }}
                  >
                    <X size={14} style={{ color: "var(--text-secondary)" }} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-2 flex-1 rounded-xl px-3 py-2"
                    style={{
                      background: "var(--bg-surface-2)",
                      border: "1px solid var(--divider)",
                    }}
                  >
                    <Gift size={14} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />
                    <input
                      type="text"
                      value={benefitInput}
                      onChange={(e) => setBenefitInput(e.target.value.toUpperCase().slice(0, 12))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyBenefitCode(); } }}
                      placeholder={isEs ? "Código de beneficio" : "Benefit code"}
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      className="flex-1 bg-transparent outline-none text-[13px] font-mono tracking-widest tabular-nums placeholder:font-sans placeholder:tracking-normal"
                      style={{ color: "var(--text-primary)" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={applyBenefitCode}
                    disabled={!benefitInput.trim() || benefitLoading}
                    className="shrink-0 px-3 h-9 rounded-xl text-[12px] font-bold active:opacity-80 disabled:opacity-40"
                    style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
                  >
                    {benefitLoading ? <Loader2 size={14} className="animate-spin" /> : (isEs ? "Aplicar" : "Apply")}
                  </button>
                </div>
              )}
              {benefitError && (
                <p className="text-[11px] px-1" style={{ color: "#ef4444" }}>{benefitError}</p>
              )}
            </div>
          )}


          <div className="flex items-center justify-between gap-4 pb-1">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[18px] font-extrabold" style={{ color: "var(--text-primary)" }}>
                  {isEs ? "Total" : "Total"}
                </span>
                <Info size={16} style={{ color: "var(--text-tertiary)" }} />
              </div>
              <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
                {isEs ? "Incluye IVU y propina" : "Includes tax and tip"}
              </p>
            </div>
            <span className="text-[22px] font-extrabold tabular-nums shrink-0" style={{ color: "var(--text-primary)" }}>
              ${(displayedTotalCents / 100).toFixed(2)}
            </span>
          </div>

          {fullyCovered ? (
            /* Balance is $0.00 — no gateway charge. Single redeem CTA. */
            <button
              type="button"
              onClick={handleRedeemBenefit}
              disabled={redeemingBenefit || paid}
              className="w-full transition-opacity active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer select-none"
              style={{
                minHeight: 56,
                padding: "16px 20px",
                background: "var(--accent-color)",
                color: "var(--bg-base)",


                borderRadius: 12,
                fontFamily: "Montserrat, sans-serif",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                border: "none",
                touchAction: "manipulation",
                transform: "translateZ(0)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {redeemingBenefit ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>{isEs ? "Redimiendo…" : "Redeeming…"}</span>
                </>
              ) : (
                <>
                  <Gift size={18} className="icon-bold" />
                  <span>{isEs ? "Redimir beneficio" : "Redeem benefit"}</span>
                </>
              )}
            </button>
          ) : (
            <>
              {/* SECONDARY: Open method picker (Card / Apple Pay / PayPal) */}
              <button
                type="button"
                onClick={() => setMethodSheetOpen(true)}
                disabled={anyRedirecting}
                className="w-full transition-opacity active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer select-none"
                style={{
                  minHeight: 52,
                  padding: "14px 20px",
                  background: "var(--bg-surface-2)",
                  border: "2px solid var(--text-primary)",
                  color: "var(--text-primary)",
                  borderRadius: 12,
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                  WebkitUserSelect: "none",
                  WebkitAppearance: "none",
                  appearance: "none",
                  position: "relative",
                  zIndex: 2,
                  transform: "translateZ(0)",
                }}
              >
                {isEs ? "Cambiar método de pago" : "Change payment method"}
              </button>

              {/* ONE-TAP saved card (off_session) — only when client has reusable PM */}
              {savedCardInfo ? (
                <button
                  type="button"
                  onClick={handleSavedCardCharge}
                  disabled={chargingSavedCard || anyRedirecting || paid}
                  className="w-full transition-opacity active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer select-none"
                  style={{
                    minHeight: 56,
                    padding: "16px 20px",
                    background: "var(--cta-bg)",
                    color: "var(--cta-fg)",
                    borderRadius: 12,
                    fontFamily: "Montserrat, sans-serif",
                    fontSize: 14,
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    border: "none",
                    touchAction: "manipulation",
                    transform: "translateZ(0)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                  }}
                >
                  {chargingSavedCard ? (
                    isEs ? "Cobrando…" : "Charging…"
                  ) : (
                    <>
                      <CreditCard size={18} />
                      <span>
                        {isEs ? "Pagar con" : "Pay with"} {savedCardInfo.brand.toUpperCase()} •••• {savedCardInfo.last4}
                      </span>
                    </>
                  )}
                </button>
              ) : (
                <AthMovilRestButton
                  draftId={draftId}
                  phone={phone}
                  totalCents={displayedTotalCents}
                  tipCents={tipCents}
                  serviceName={serviceName}
                  isEs={isEs}
                  showHelperText={false}
                />
              )}
            </>
          )}
          <p className="text-[8px] leading-tight text-center" style={{ color: "var(--text-tertiary)" }}>
            {isEs
              ? "Al pagar aceptas los Términos y que tu tarjeta se guarde de forma segura (Stripe) para cobrar balances y citas futuras en Charlie's Barbershop. Puedes eliminarla en tu perfil."
              : "By paying you accept the Terms and that your card is securely saved (Stripe) to charge balances and future appointments at Charlie's Barbershop. You can remove it from your profile."}
          </p>
        </div>
      </div>

      <PaymentMethodSheet
        open={methodSheetOpen}
        onOpenChange={(o) => {
          // Don't allow user to close while a redirect is mid-flight; the
          // navigation will dismount the component anyway.
          if (anyRedirecting && !o) return;
          setMethodSheetOpen(o);
        }}
        onSelectCard={() => handleStripeRedirect("card")}
        onSelectApplePay={() => handleStripeRedirect("apple_pay")}
        onSelectPayPal={handlePayPal}
        isEs={isEs}
        isLoading={anyRedirecting}
        loadingMethod={redirectingMethod}
        avoidBottomNav={avoidBottomNav}
      />
    </div>
  );
}
