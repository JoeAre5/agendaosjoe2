// InlineStripePay — Stripe Payment Element embedded inline (no redirect).
// Used by FilhoPublicModal. Hooks into the canonical pay-then-book flow:
//   1. Filho's start_inline_payment tool already created a PaymentIntent for a
//      booking_drafts row and returned { draftId, clientSecret, publishableKey, amountCents }.
//   2. We just render the Element. On confirmPayment success we POST to
//      pay-then-book action='commit-and-book' which verifies + creates Acuity
//      appointment + appointments row (or auto-refunds on Acuity failure).
//
// No parallel infrastructure. Same lifecycle as the public site's "Reservar" button.
import { useMemo, useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { CheckCircle2, Loader2 } from "lucide-react";

type Props = {
  draftId: string;
  clientSecret: string;
  publishableKey: string;
  amountCents: number;
  tipCents?: number;
  serviceName?: string | null;
  es: boolean;
  onSuccess: () => void;
};

const COMMIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pay-then-book`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function InlineStripePay({
  draftId,
  clientSecret,
  publishableKey,
  amountCents,
  tipCents = 0,
  serviceName,
  es,
  onSuccess,
}: Props) {
  const stripePromise = useMemo<Promise<StripeJs | null> | null>(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, [publishableKey]);

  const isDark = typeof document !== "undefined"
    && document.documentElement.classList.contains("dark");

  if (!clientSecret || !stripePromise) {
    return (
      <div className="rounded-2xl p-4 flex items-center gap-2 text-[13px]" style={{ background: "var(--bg-surface-2)", color: "var(--text-tertiary)", border: "1px solid var(--border)" }}>
        <Loader2 size={14} className="animate-spin" />
        {es ? "Preparando pago seguro..." : "Preparing secure payment..."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
      <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: "var(--text-tertiary)" }}>
        {es ? "Pago seguro" : "Secure payment"}
      </div>
      {serviceName && (
        <div className="text-[13px] mb-1" style={{ color: "var(--text-secondary)" }}>{serviceName}</div>
      )}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{es ? "Total" : "Total"}</span>
        <span className="text-[18px] font-extrabold">${(amountCents / 100).toFixed(2)}</span>
      </div>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: isDark ? "night" : "stripe",
            variables: {
              colorPrimary: "rgba(160,128,96,1)",
              colorBackground: isDark ? "#0a0a0a" : "#ffffff",
              colorText: isDark ? "#ffffff" : "#0a0a0a",
              borderRadius: "12px",
            },
          },
        }}
      >
        <PayInner draftId={draftId} amountCents={amountCents} tipCents={tipCents} es={es} onSuccess={onSuccess} />
      </Elements>
    </div>
  );
}

function PayInner({
  draftId,
  amountCents,
  tipCents,
  es,
  onSuccess,
}: { draftId: string; amountCents: number; tipCents: number; es: boolean; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handlePay = async () => {
    if (!stripe || !elements || submitting) return;
    setSubmitting(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (error) {
      setErr(error.message || "payment_failed");
      setSubmitting(false);
      return;
    }
    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "processing") {
      // Commit through the canonical pay-then-book flow (same endpoint the public
      // site uses). Server verifies the PaymentIntent + creates Acuity appointment.
      try {
        const resp = await fetch(COMMIT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: ANON_KEY },
          body: JSON.stringify({
            action: "commit-and-book",
            draftId,
            paymentMethod: "stripe",
            paymentRef: paymentIntent.id,
            amountPaidCents: amountCents,
            tipCents,
          }),
        });
        const data = await resp.json();
        if (!resp.ok || !data?.success) {
          setErr(data?.error || (es ? "Error al confirmar la cita." : "Error confirming the appointment."));
          setSubmitting(false);
          return;
        }
        setDone(true);
        setSubmitting(false);
        setTimeout(onSuccess, 1500);
      } catch (e) {
        setErr((e as Error).message);
        setSubmitting(false);
      }
      return;
    }
    setErr(es ? "Estado inesperado, intenta de nuevo." : "Unexpected state, try again.");
    setSubmitting(false);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 py-3">
        <CheckCircle2 size={40} style={{ color: "#22c55e" }} />
        <p className="text-[14px] font-bold">{es ? "Pago confirmado" : "Payment confirmed"}</p>
        <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Tu cita está reservada." : "Your appointment is booked."}
        </p>
      </div>
    );
  }

  return (
    <>
      <PaymentElement options={{ layout: "tabs" }} />
      {err && (
        <p className="text-[12px] mt-2" style={{ color: "#ef4444" }}>{err}</p>
      )}
      <button
        onClick={handlePay}
        disabled={!stripe || submitting}
        className="w-full h-11 rounded-full font-semibold text-[14px] mt-3 active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: "rgba(160,128,96,1)", color: "#fff" }}
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {es ? "Procesando..." : "Processing..."}
          </>
        ) : (
          <>{es ? "Pagar" : "Pay"} ${(amountCents / 100).toFixed(2)}</>
        )}
      </button>
    </>
  );
}
