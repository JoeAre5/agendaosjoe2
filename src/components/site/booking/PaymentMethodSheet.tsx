// PaymentMethodSheet — bottom-sheet popup that lets a customer pick an
// alternative payment method after choosing NOT to use ATH Móvil.
//
// Flow context:
//   • PaymentStep renders the ATH Móvil button as PRIMARY.
//   • Below it, a "Cambiar método de pago" secondary button opens THIS sheet.
//   • The sheet offers Card / Apple Pay / PayPal (NO ATH — would be redundant).
//   • Card + Apple Pay both redirect to Stripe Checkout hosted (Stripe shows
//     Apple Pay automatically when supported; the hint is purely for analytics).
//   • PayPal triggers the existing full-page redirect via usePayPalRedirect.
//
// Visual language: pattern-matched to ConfirmationPopup.tsx — Inter 900 title,
// negative letter-spacing, white card surface in both themes (the Vaul drawer
// content already uses bg-background, but we override to a stable surface so
// the look matches the booking confirmation popup family).
//
// Apple Pay row visibility: gated client-side on window.ApplePaySession so we
// don't dangle an option that would just send the user to Stripe Checkout
// without an Apple Pay button. This is safe to inspect at render time because
// the sheet only mounts on user interaction (well after hydration).
import { useEffect, useState } from "react";
import { Loader2, ChevronRight, CreditCard } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

export type PaymentMethodKey = "card" | "apple_pay" | "paypal";

interface PaymentMethodSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCard: () => void;
  onSelectApplePay?: () => void;
  onSelectPayPal?: () => void;
  isEs: boolean;
  isLoading: boolean;
  loadingMethod: PaymentMethodKey | null;
  showApplePay?: boolean;
  showPayPal?: boolean;
  avoidBottomNav?: boolean;
}

/* ── Inline brand glyphs ─────────────────────────────────────────── */

// Apple logo — official monochrome silhouette rendered as TWO separate
// paths so the leaf has a real gap above the bitten body (matches the
// canonical Apple mark). Coordinates from Bootstrap Icons "apple", which
// renders cleanly at 16–24px.
function AppleGlyph({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Apple body (with bite) */}
      <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43Zm3.314 11.733c-.048-.096-2.325-1.234-2.113-3.422.212-2.189 1.675-2.789 1.698-2.854.023-.065-.597-.79-1.254-1.157a3.692 3.692 0 0 0-1.563-.434c-.108-.003-.483-.095-1.254.116-.508.139-1.653.589-1.968.607-.316.018-1.256-.522-2.267-.665-.647-.125-1.333.131-1.824.328-.49.196-1.422.754-2.074 2.237-.652 1.482-.311 3.83-.067 4.56.244.729.625 1.924 1.273 2.796.576.984 1.34 1.667 1.659 1.899.319.232 1.219.386 1.843.067.502-.308 1.408-.485 1.766-.472.357.013 1.061.154 1.782.539.571.197 1.111.115 1.652-.105.541-.221 1.324-1.059 2.238-2.758.347-.79.505-1.217.473-1.282Z"/>
      {/* Leaf (separate from the body — note the visible gap) */}
      <path d="M11.182.008C11.148-.03 9.923.023 8.857 1.18c-1.066 1.156-.902 2.482-.878 2.516.024.034 1.52.087 2.475-1.258.955-1.345.762-2.391.728-2.43Z"/>
    </svg>
  );
}

// PayPal "P" — official monochrome silhouette (Simple Icons paths), drawn
// to match PayPal's brand lockup:
//   • Right/lower P = BACK at full opacity, but masked where the front P
//     overlaps so the back's silhouette doesn't bleed through and inflate
//     the front P to ~100%.
//   • Left/upper P  = FRONT at 30% opacity, sitting on top against the
//     row background — so its translucency reads correctly.
function PayPalGlyph({ size = 22 }: { size?: number }) {
  // Stable id so multiple instances on the page don't collide.
  const maskId = `paypal-front-mask-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      aria-hidden="true"
    >
      <defs>
        {/* White = visible, black = hidden. Front-P silhouette punches a
            hole in the back P. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect x="0" y="0" width="24" height="24" fill="#fff" />
          <path fill="#000" d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.024.143-.052.286-.084.437-1.103 5.65-4.872 7.598-9.708 7.598h-2.46a1.187 1.187 0 0 0-1.174 1.002l-1.292 8.2z" />
        </mask>
      </defs>
      {/* Back P (lower-right) — full opacity, with front-P cutout */}
      <path mask={`url(#${maskId})`} d="M19.95 7.554c-1.115 5.74-5.467 6.526-9.31 6.526h-1.95l-1.36 8.624a.503.503 0 0 0 .497.583h4.014a.83.83 0 0 0 .82-.7l.034-.179.776-4.92.05-.27a.83.83 0 0 1 .82-.7h.516c3.34 0 5.956-1.358 6.72-5.282.319-1.64.154-3.01-.69-3.973a3.293 3.293 0 0 0-.937-.71z" />
      {/* Front P (upper-left) — 30% opacity */}
      <path opacity="0.3" d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.024.143-.052.286-.084.437-1.103 5.65-4.872 7.598-9.708 7.598h-2.46a1.187 1.187 0 0 0-1.174 1.002l-1.292 8.2z" />
    </svg>
  );
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  dimmed: boolean;
  onClick: () => void;
}

function MethodRow({ icon, label, loading, dimmed, onClick }: RowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || dimmed}
      className="w-full flex items-center justify-between gap-3 transition-all active:scale-[0.99] disabled:cursor-not-allowed"
      style={{
        padding: 16,
        border: "1px solid rgba(0,0,0,0.10)",
        borderRadius: 14,
        background: "#f5f5f5",
        opacity: dimmed ? 0.4 : 1,
        pointerEvents: dimmed ? "none" : "auto",
        color: "#111111",
        fontFamily: "Montserrat, system-ui, sans-serif",
        WebkitTapHighlightColor: "transparent",
        touchAction: "manipulation",
      }}
    >
      <span className="flex items-center gap-3">
        <span
          className="flex items-center justify-center"
          style={{ width: 28, height: 28, color: "#111111" }}
        >
          {icon}
        </span>
        <span className="text-[14px] font-semibold">{label}</span>
      </span>
      {loading ? (
        <Loader2
          size={18}
          className="animate-spin"
          style={{ color: "rgba(160,128,96,1)" }}
        />
      ) : (
        <ChevronRight size={18} style={{ color: "rgba(0,0,0,0.4)" }} />
      )}
    </button>
  );
}

export function PaymentMethodSheet({
  open,
  onOpenChange,
  onSelectCard,
  onSelectApplePay,
  onSelectPayPal,
  isEs,
  isLoading,
  loadingMethod,
  showApplePay = true,
  showPayPal = true,
  avoidBottomNav = false,
}: PaymentMethodSheetProps) {
  // Apple Pay availability — only render the row if the device exposes
  // ApplePaySession. Re-evaluated each time the sheet opens (cheap).
  const [applePayAvailable, setApplePayAvailable] = useState(false);

  useEffect(() => {
    if (!open || !showApplePay) {
      setApplePayAvailable(false);
      return;
    }
    try {
      const w = window as unknown as { ApplePaySession?: { canMakePayments?: () => boolean } };
      const supported =
        !!w.ApplePaySession &&
        typeof w.ApplePaySession.canMakePayments === "function" &&
        w.ApplePaySession.canMakePayments();
      setApplePayAvailable(supported);
    } catch {
      setApplePayAvailable(false);
    }
  }, [open, showApplePay]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        // z-[140] ensures this sheet (and its overlay) render ABOVE the
        // fixed bottom payment action bar in PaymentStep (z-[120]) AND
        // above any parent Radix Dialog (z-50) when the booking flow is
        // opened as a popup from the public site. Vaul renders the overlay
        // as a sibling — the `[&~[data-vaul-overlay]]` selector bumps it
        // to the same z-index so the backdrop covers the action bar too.
        className="border-0 z-[140] [&~[data-vaul-overlay]]:z-[140]"
        style={{
          background: "#ffffff",
          color: "#111111",
          bottom: 0,
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
          maxHeight: avoidBottomNav ? "calc(100dvh - 24px)" : undefined,
        }}
      >
        <div className="mx-auto w-full max-w-[420px] px-5 pt-2 pb-2">
          <div className="text-center mb-4 mt-2">
            <DrawerTitle
              className="text-[22px] font-black"
              style={{
                color: "#111111",
                letterSpacing: "-1px",
                fontFamily: "Montserrat, system-ui, sans-serif",
                fontWeight: 900,
              }}
            >
              {isEs ? "Elegir método de pago" : "Choose payment method"}
            </DrawerTitle>
            <DrawerDescription
              className="text-[12px] mt-2"
              style={{ color: "rgba(0,0,0,0.5)" }}
            >
              {isEs
                ? "Tu reserva está protegida hasta completar el pago"
                : "Your booking is held until payment completes"}
            </DrawerDescription>
          </div>

          <div className="flex flex-col gap-3">
            {/* Card + Apple Pay collapsed into a single row — Stripe Checkout
                shows BOTH on the same hosted page (Apple Pay button appears
                automatically on supported devices), so listing them separately
                in our sheet sent users to the exact same destination twice. */}
            <MethodRow
              icon={
                showApplePay && applePayAvailable ? (
                  <AppleGlyph size={22} />
                ) : (
                  <CreditCard size={22} strokeWidth={1.8} />
                )
              }
              label={
                showApplePay && applePayAvailable
                  ? isEs
                    ? "Tarjeta o Apple Pay"
                    : "Card or Apple Pay"
                  : isEs
                    ? "Tarjeta de crédito"
                    : "Credit card"
              }
              loading={loadingMethod === "card" || (showApplePay && loadingMethod === "apple_pay")}
              dimmed={
                isLoading &&
                loadingMethod !== "card" &&
                (!showApplePay || loadingMethod !== "apple_pay")
              }
              onClick={onSelectCard}
            />

            {showPayPal && onSelectPayPal && (
              <MethodRow
                icon={<PayPalGlyph size={22} />}
                label="PayPal"
                loading={loadingMethod === "paypal"}
                dimmed={isLoading && loadingMethod !== "paypal"}
                onClick={onSelectPayPal}
              />
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
