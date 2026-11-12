/**
 * Estimated payment gateway fees per processor.
 *
 * IMPORTANT: All values returned here are ESTIMATES computed by the app.
 * The app does NOT have access to official processor reports, so these
 * numbers should be displayed as "Cargo digital estimado" and reconciled
 * against the real platform statements separately.
 *
 * Rates (Jun 2026):
 *   Stripe       — 2.9 %  + $0.30 per successful charge (estimated)
 *   PayPal       — 3.49% + $0.49 per standard checkout transaction (estimated,
 *                  actual rate varies by payment type)
 *   ATH Móvil    — 2.25% of gross, no flat fee (estimated, matches observed
 *                  pattern from official reports: $30→$0.68, $40→$0.90, $75→$1.69)
 *   (fallback)   — flat percentage from shop_settings.digital_fee_rate
 *                  (default 10%) used only when we can't identify the processor.
 */

export type ProcessorKey = "stripe" | "paypal" | "ath_movil" | "cash" | "unknown";

export interface FeeSchedule {
  /** Decimal rate, e.g. 0.029 for 2.9% */
  rate: number;
  /** Flat fee in cents, e.g. 30 for $0.30 */
  flatCents: number;
  /** Display label for UI */
  label: string;
  /** Always true — these are app-side estimates, not verified fees */
  estimated: true;
}

export const GATEWAY_FEES: Record<Exclude<ProcessorKey, "cash" | "unknown">, FeeSchedule> = {
  stripe:    { rate: 0.029,  flatCents: 30, label: "Stripe 2.9% + $0.30 (est.)",   estimated: true },
  paypal:    { rate: 0.0349, flatCents: 49, label: "PayPal 3.49% + $0.49 (est.)",  estimated: true },
  ath_movil: { rate: 0.0225, flatCents: 0,  label: "ATH Móvil 2.25% (est.)",       estimated: true },
};

/** Normalize a free-form payment_method string into a ProcessorKey. */
export function classifyProcessor(pm: string | null | undefined): ProcessorKey {
  const v = (pm || "").toLowerCase().trim();
  if (!v) return "unknown";
  if (v === "cash" || v.includes("efectivo")) return "cash";
  if (v.includes("ath")) return "ath_movil";
  if (v.includes("paypal")) return "paypal";
  if (v.includes("stripe") || v.includes("card") || v.includes("tarjeta")) return "stripe";
  return "unknown";
}

/**
 * Compute the ESTIMATED gateway fee for a single transaction.
 *
 * @param amountCents Gross amount the processor settled (subtotal + tip).
 * @param processor   Identified processor.
 * @param fallbackRate Used only when processor === "unknown" (default 10%).
 *                     Cash transactions always return 0.
 */
export function computeGatewayFee(
  amountCents: number,
  processor: ProcessorKey,
  fallbackRate = 0.10
): number {
  if (amountCents <= 0) return 0;
  if (processor === "cash") return 0;
  if (processor === "unknown") {
    return Math.round(amountCents * fallbackRate);
  }
  const schedule = GATEWAY_FEES[processor];
  return Math.round(amountCents * schedule.rate) + schedule.flatCents;
}

/** Human-readable formula for debug view, e.g. "2.25% × $40.00 = $0.90" */
export function describeFeeFormula(amountCents: number, processor: ProcessorKey): string {
  if (processor === "cash") return "cash — sin fee";
  if (processor === "unknown") return "fallback 10%";
  const s = GATEWAY_FEES[processor];
  const ratePct = (s.rate * 100).toFixed(2).replace(/\.?0+$/, "") + "%";
  const flat = s.flatCents > 0 ? ` + $${(s.flatCents / 100).toFixed(2)}` : "";
  return `${ratePct}${flat} × $${(amountCents / 100).toFixed(2)}`;
}
