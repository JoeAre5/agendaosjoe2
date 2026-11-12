// AppointmentPaywall — unified payment surface for an EXISTING appointment.
//
// Stripe path: hosted Stripe Checkout via `appointment-stripe-checkout` edge
// function (same UX as new-booking PaymentStep). This gives Card + Apple Pay
// + Link + Klarna automatically, with no in-page Elements code.
// PayPal path: in-page PayPal SDK buttons via `client-booking-pay`.
//
// Used by:
//   - Public /pay/:id (Pay.tsx) → flowSource="public_pay"
//   - Admin /admin/appointment/:id/pay → flowSource="admin_pay"
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, CreditCard, Info } from "lucide-react";
import { PayPalButtons } from "@paypal/react-paypal-js";
import { supabase } from "@/integrations/supabase/client";
import { TipSelector } from "./TipSelector";
import {
  AppointmentSummaryCard,
  type SummaryLine,
} from "./AppointmentSummaryCard";
import { PaymentMethodSheet } from "./PaymentMethodSheet";

export interface AppointmentPaywallProps {
  appointmentId: string;
  /** Signed pay-link code (public /pay page only). */
  payCode?: string;
  /** Subtotal in cents (service price minus already-paid). Tip is added on top. */
  basePriceCents: number;
  serviceName: string;
  lineItems?: SummaryLine[];
  isEs: boolean;
  accent?: string;
  /** Tags Stripe metadata + return URL (admin returns to /admin route). */
  flowSource?: "public_pay" | "admin_pay" | "client_portal";
  /** Called after a successful in-page payment (PayPal). Stripe redirects away. */
  onPaid: () => void;
  /** Optional override for the primary CTA. When provided, replaces the default
   *  black Stripe pay button. The "Change payment method" button still renders
   *  below it and opens the Card (hosted Stripe Checkout) / PayPal sheet. */
  primaryAction?: (ctx: { tipCents: number; totalCents: number }) => React.ReactNode;
  avoidBottomNav?: boolean;
}

const ACCENT_DEFAULT = "var(--accent-color)";

export function AppointmentPaywall({
  appointmentId,
  payCode,
  basePriceCents,
  serviceName,
  lineItems,
  isEs,
  accent = ACCENT_DEFAULT,
  flowSource = "public_pay",
  onPaid,
  primaryAction,
  avoidBottomNav = false,
}: AppointmentPaywallProps) {
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

  const summaryLines: SummaryLine[] = useMemo(() => {
    if (lineItems && lineItems.length > 0) return lineItems;
    return [{ key: "service", label: serviceName, unitCents: basePriceCents }];
  }, [lineItems, serviceName, basePriceCents]);

  /* ── Method picker ────────────────────────────────────────── */
  const [methodSheetOpen, setMethodSheetOpen] = useState(false);
  const [activeMethod, setActiveMethod] = useState<"card" | "paypal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  const footerRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(320);
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFooterH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Measured footer height + breathing room so nothing hides behind it.
  const footerSpacer = `${footerH + 24}px`;

  const startStripeCheckout = async () => {
    setMethodSheetOpen(false);
    setRedirecting(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "appointment-stripe-checkout",
        {
          body: {
            appointment_id: appointmentId,
            amount_cents: totalCents,
            tip_cents: tipCents,
            returnOrigin: window.location.origin,
            flowSource,
            pay_code: payCode,
          },
        },
      );
      if (fnErr || !data?.url) {
        setError(data?.error || fnErr?.message || (isEs ? "Error de pago" : "Payment error"));
        setRedirecting(false);
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      setError((e as Error).message);
      setRedirecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <AppointmentSummaryCard
        lines={summaryLines}
        subtotalCents={basePriceCents}
        tipCents={tipCents}
        totalCents={totalCents}
        isEs={isEs}
      />

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

      {error && (
        <div
          className="rounded-xl p-3 text-[12px]"
          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
        >
          <AlertTriangle size={12} className="inline mr-1" />
          {error}
        </div>
      )}

      {/* Spacer so scrollable content clears the sticky footer */}
      <div aria-hidden style={{ height: footerSpacer }} />

      {/* Sticky bottom action bar — native-app feel */}
      <div
        ref={footerRef}
        className="fixed left-0 right-0 bottom-0 z-[120]"
        style={{
          background: "var(--bg-base)",
          borderTop: "1px solid var(--divider, rgba(0,0,0,0.08))",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          transform: "translateZ(0)",
        }}
      >
        <div className="max-w-md mx-auto px-4 pt-4 pb-3 space-y-3">
          {activeMethod === "paypal" ? (
            <PayPalBlock
              appointmentId={appointmentId}
              payCode={payCode}
              totalCents={totalCents}
              tipCents={tipCents}
              isEs={isEs}
              onSuccess={onPaid}
              onBack={() => setActiveMethod(null)}
            />
          ) : (
            <>
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
                  ${(totalCents / 100).toFixed(2)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setMethodSheetOpen(true)}
                disabled={redirecting}
                className="w-full transition-opacity active:opacity-80 disabled:opacity-60 cursor-pointer select-none"
                style={{
                  minHeight: 48,
                  padding: "12px 20px",
                  background: primaryAction ? "var(--bg-surface-2)" : "var(--cta-bg)",
                  border: primaryAction ? "2px solid var(--text-primary)" : "none",
                  color: primaryAction ? "var(--text-primary)" : "var(--cta-fg)",
                  borderRadius: 12,
                  fontFamily: "Montserrat, sans-serif",
                  fontSize: 13,
                  fontWeight: primaryAction ? 700 : 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  touchAction: "manipulation",
                  transform: "translateZ(0)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                {redirecting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {isEs ? "Redirigiendo..." : "Redirecting..."}
                  </>
                ) : primaryAction ? (
                  isEs ? "Cambiar método de pago" : "Change payment method"
                ) : (
                  <>
                    <CreditCard size={16} />
                    {isEs ? `Pagar $${(totalCents / 100).toFixed(2)}` : `Pay $${(totalCents / 100).toFixed(2)}`}
                  </>
                )}
              </button>

              {primaryAction && primaryAction({ tipCents, totalCents })}
            </>
          )}
        </div>
      </div>

      <PaymentMethodSheet
        open={methodSheetOpen}
        onOpenChange={setMethodSheetOpen}
        onSelectCard={startStripeCheckout}
        onSelectPayPal={() => {
          setActiveMethod("paypal");
          setMethodSheetOpen(false);
        }}
        isEs={isEs}
        isLoading={redirecting}
        loadingMethod={redirecting ? "card" : null}
        avoidBottomNav={avoidBottomNav}
      />
    </div>
  );
}

/* ─── PayPal (in-page buttons via client-booking-pay) ─── */
function PayPalBlock({
  appointmentId,
  payCode,
  totalCents,
  tipCents,
  isEs,
  onSuccess,
  onBack,
}: {
  appointmentId: string;
  payCode?: string;
  totalCents: number;
  tipCents: number;
  isEs: boolean;
  onSuccess: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
        ← {isEs ? "Otro método" : "Other method"}
      </button>
      <div className="rounded-xl overflow-hidden">
        <PayPalButtons
          style={{ layout: "vertical", color: "blue", shape: "rect", label: "pay" }}
          forceReRender={[totalCents, tipCents]}
          createOrder={async () => {
            const { data } = await supabase.functions.invoke("client-booking-pay", {
              body: {
                action: "paypal-create",
                appointment_id: appointmentId,
                pay_code: payCode,
                amount_cents: totalCents,
                tip_cents: tipCents,
              },
            });
            if (!data?.orderID) throw new Error(data?.error || "PayPal create failed");
            return data.orderID;
          }}
          onApprove={async (data) => {
            await supabase.functions.invoke("client-booking-pay", {
              body: {
                action: "paypal-capture",
                appointment_id: appointmentId,
                pay_code: payCode,
                orderID: data.orderID,
                amount_cents: totalCents,
                tip_cents: tipCents,
              },
            });
            onSuccess();
          }}
        />
      </div>
    </div>
  );
}
