import { homeServiceFees, type FeeTransaction } from "./homeFinancials";
import { prorateWeeklyCents } from "./homePeriods";
import { groupByBarber, type UnifiedRow } from "./unifiedProduction";

interface ContributionBarber {
  id: string;
  name: string;
  color: string | null;
  employment_type: string;
  commission_rate: number | null;
  weekly_salary: number | null;
}
export type RankingTransaction = FeeTransaction & { type?: string | null };
export interface RankingProductSale { transaction_id: string; revenue_cents: number }

/** Admin Home only: never feeds payroll or accounting. Preserve receipt matching and fee allocation. */
export function homeBarberContribution(
  barbers: ContributionBarber[], rows: UnifiedRow[], transactions: RankingTransaction[],
  products: RankingProductSale[], fallbackRate: number, start: Date, end: Date,
) {
  const productsByTx = new Map<string, number>();
  for (const product of products) productsByTx.set(product.transaction_id,
    (productsByTx.get(product.transaction_id) ?? 0) + product.revenue_cents);
  const serviceSubtotal = (tx: RankingTransaction) =>
    tx.type === "product" || tx.type === "product_sale" ? 0
      : Math.max(0, tx.subtotal_cents - (productsByTx.get(tx.id) ?? 0));
  const used = new Set<string>();
  const serviceRows = rows.map(row => {
    let receipts: RankingTransaction[] = [];
    if (row.origin === "linked_tx") receipts = transactions.filter(tx => tx.status === "completed" && tx.appointment_id === row.id.slice(5));
    else if (row.origin === "loose_tx") receipts = transactions.filter(tx => tx.id === row.id.slice(3));
    else if (row.origin === "matched_tx") {
      const match = transactions.find(tx => !used.has(tx.id) && !tx.appointment_id && tx.status === "completed" && tx.barber_id === row.barber_id && tx.created_at.slice(0, 10) === row.occurred_at.slice(0, 10) && tx.total_cents === row.total_cents);
      if (match) { receipts = [match]; used.add(match.id); }
    }
    return receipts.length ? { ...row, subtotal_cents: receipts.reduce((sum, tx) => sum + serviceSubtotal(tx), 0) } : row;
  });
  // Pre-allocate actual fees against the original receipt, so product/tip fee shares stay excluded.
  const serviceTransactions = transactions.map(tx => {
    const subtotal = serviceSubtotal(tx);
    return { ...tx, subtotal_cents: subtotal,
      gateway_fee_cents: tx.gateway_fee_cents == null ? tx.gateway_fee_cents
        : Math.round(tx.gateway_fee_cents * subtotal / Math.max(1, tx.subtotal_cents + tx.tip_cents)),
      tip_cents: 0 };
  });
  const grossByBarber = groupByBarber(serviceRows);
  const fees = homeServiceFees(serviceRows, serviceTransactions, fallbackRate);
  return barbers.map(barber => {
    const net = (grossByBarber[barber.id] ?? 0) - (fees.byBarber[barber.id] ?? 0);
    const personnel = barber.employment_type === "commission"
      ? Math.round(net * (barber.commission_rate ?? 0.65))
      : barber.employment_type === "w2_fixed"
        ? prorateWeeklyCents(barber.weekly_salary ?? 57000, start, end) : 0;
    return { id: barber.id, name: barber.name, color: barber.color || "var(--accent-color)", total: net - personnel };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}