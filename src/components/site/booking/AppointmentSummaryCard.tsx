// Receipt-style summary card shown at the top of the PaymentStep.
// Renders service line(s), addon line(s), product line(s), subtotal,
// the live tip line, and a bold TOTAL row. Pure presentation — totals
// are computed by the parent (PaymentStep) and passed in cents.
import React from "react";

export interface SummaryLine {
  /** Stable key for React (service id, addon id, product sku, etc.) */
  key: string;
  label: string;
  /** Optional quantity for products. Omit/1 for services & addons. */
  qty?: number;
  /** Per-unit price in cents. */
  unitCents: number;
}

interface AppointmentSummaryCardProps {
  lines: SummaryLine[];
  subtotalCents: number;
  tipCents: number;
  totalCents: number;
  isEs: boolean;
  /** Optional benefit discount line: shown as "−$X.XX" between subtotal and tip. */
  benefitDiscountCents?: number;
  benefitLabel?: string;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function AppointmentSummaryCard({
  lines,
  subtotalCents,
  tipCents,
  totalCents,
  isEs,
  benefitDiscountCents = 0,
  benefitLabel,
}: AppointmentSummaryCardProps) {
  return (
    <div
      className="rounded-2xl p-4 space-y-2"
      style={{
        background: "var(--bg-surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Line items */}
      <div className="space-y-2">
        {lines.map((line) => {
          const qty = line.qty && line.qty > 1 ? line.qty : 1;
          const lineTotal = qty * line.unitCents;
          return (
            <div key={line.key} className="flex justify-between gap-3 text-[13px]">
              <span
                className="truncate"
                style={{ color: "var(--text-secondary)" }}
              >
                {qty > 1 ? `${qty}× ` : ""}
                {line.label}
              </span>
              <span
                className="font-semibold tabular-nums shrink-0"
                style={{ color: "var(--text-primary)" }}
              >
                {fmt(lineTotal)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Subtotal — no divider, just spacing (Apple checkout style) */}
      <div className="flex justify-between text-[12px] pt-1">
        <span style={{ color: "var(--text-tertiary)" }}>
          {isEs ? "Subtotal" : "Subtotal"}
        </span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: "var(--text-secondary)" }}
        >
          {fmt(subtotalCents)}
        </span>
      </div>

      {/* Benefit discount */}
      {benefitDiscountCents > 0 && (
        <div className="flex justify-between text-[12px]">
          <span style={{ color: "var(--text-tertiary)" }}>
            {benefitLabel || (isEs ? "Beneficio" : "Benefit")}
          </span>
          <span className="font-semibold tabular-nums" style={{ color: "#22c55e" }}>
            −{fmt(benefitDiscountCents)}
          </span>
        </div>
      )}

      {/* Live tip */}
      {tipCents > 0 && (
        <div className="flex justify-between text-[12px]">
          <span style={{ color: "var(--text-tertiary)" }}>
            {isEs ? "Propina" : "Tip"}
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{ color: "var(--text-secondary)" }}
          >
            {fmt(tipCents)}
          </span>
        </div>
      )}

      {/* TOTAL — no divider, weight + size carry the hierarchy */}
      <div
        className="flex justify-between text-[16px] font-extrabold pt-1 tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
        <span>{isEs ? "Total" : "Total"}</span>
        <span>{fmt(totalCents)}</span>
      </div>
    </div>
  );
}
