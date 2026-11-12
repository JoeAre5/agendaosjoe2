import type { RawTransaction, UnifiedRow } from "@/lib/unifiedProduction";

export type FeeTransaction = RawTransaction & { gateway_fee_cents?: number | null };

/** Fees on tips are pass-through, not a reduction of service income. */
export function homeServiceFees(rows: UnifiedRow[], transactions: FeeTransaction[], fallbackRate: number) {
  const used = new Set<string>();
  const byBarber: Record<string, number> = {};
  let estimatedCents = 0;
  let actualCents = 0;
  for (const row of rows) {
    let receipts: FeeTransaction[] = [];
    if (row.origin === "linked_tx") receipts = transactions.filter(tx => tx.status === "completed" && tx.appointment_id === row.id.slice(5));
    else if (row.origin === "loose_tx") receipts = transactions.filter(tx => tx.id === row.id.slice(3));
    else if (row.origin === "matched_tx") {
      const match = transactions.find(tx => !used.has(tx.id) && !tx.appointment_id && tx.status === "completed" && tx.barber_id === row.barber_id && tx.created_at.slice(0, 10) === row.occurred_at.slice(0, 10) && tx.total_cents === row.total_cents);
      if (match) { receipts = [match]; used.add(match.id); }
    }
    let fee = 0;
    if (receipts.length) {
      for (const tx of receipts) {
        if ((tx.payment_method || "cash") === "cash") continue;
        if (tx.gateway_fee_cents != null) {
          const serviceFee = Math.round(tx.gateway_fee_cents * tx.subtotal_cents / Math.max(1, tx.subtotal_cents + tx.tip_cents));
          fee += serviceFee; actualCents += serviceFee;
        } else {
          const estimate = Math.round(tx.subtotal_cents * fallbackRate);
          fee += estimate; estimatedCents += estimate;
        }
      }
    } else if (row.pm === "digital") {
      fee = Math.round(row.subtotal_cents * fallbackRate);
      estimatedCents += fee;
    }
    byBarber[row.barber_id] = (byBarber[row.barber_id] ?? 0) + fee;
  }
  return { byBarber, actualCents, estimatedCents, totalCents: actualCents + estimatedCents };
}

export function homeProfitLoss(gross: number, fees: number, salary: number, commissions: number, fixed: number, manual: number) {
  const netIncome = gross - fees;
  const personnel = salary + commissions;
  const expenses = fixed + manual;
  const profit = netIncome - personnel - expenses;
  return { netIncome, personnel, expenses, profit, margin: netIncome > 0 ? profit / netIncome * 100 : null };
}