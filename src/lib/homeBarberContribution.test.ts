import { describe, expect, it } from "vitest";
import { homeBarberContribution, type RankingTransaction } from "./homeBarberContribution";
import { buildUnifiedProduction } from "./unifiedProduction";
import { homeRange, parseHomeDate } from "./homePeriods";

const barbers = [
  { id: "charlie", name: "Charlie", color: null, employment_type: "w2_fixed", weekly_salary: 57000, commission_rate: null },
  { id: "hector", name: "Héctor", color: null, employment_type: "commission", weekly_salary: null, commission_rate: 0.65 },
  { id: "joseph", name: "Joseph", color: null, employment_type: "commission", weekly_salary: null, commission_rate: 0.65 },
];
const tx = (overrides: Partial<RankingTransaction> = {}): RankingTransaction => ({
  id: "t1", barber_id: "hector", appointment_id: null, created_at: "2026-11-06T12:00:00-04:00",
  status: "completed", payment_method: "cash", type: "service", subtotal_cents: 10000,
  tip_cents: 0, total_cents: 10000, ...overrides,
});
const day = parseHomeDate("2026-11-06");
if (!day) throw new Error("Invalid test date");
const rank = (transactions: RankingTransaction[], products: { transaction_id: string; revenue_cents: number }[] = []) =>
  homeBarberContribution(barbers, buildUnifiedProduction([], transactions), transactions, products, 0.1, day, day);

describe("Admin Home shop contribution ranking", () => {
  it("keeps 35% after a 65% gross commission, without using take-home deductions", () => {
    expect(rank([tx()]).find(b => b.id === "hector")?.total).toBe(3500);
  });
  it("excludes products, including a mixed receipt, and tips", () => {
    const receipts = [tx({ type: "mixed", subtotal_cents: 15000, tip_cents: 2000, total_cents: 17000 }),
      tx({ id: "product", type: "product", subtotal_cents: 9000, total_cents: 9000 })];
    expect(rank(receipts, [{ transaction_id: "t1", revenue_cents: 5000 }]).find(b => b.id === "hector")?.total).toBe(3500);
  });
  it("includes all barbers even with no sales and preserves negative W-2 contribution", () => {
    expect(rank([]).map(b => [b.id, b.total])).toEqual([["hector", 0], ["joseph", 0], ["charlie", -11400]]);
  });
  it("deducts only service fee share before commission for mixed receipts with tips", () => {
    expect(rank([tx({ type: "mixed", payment_method: "stripe", subtotal_cents: 15000,
      tip_cents: 5000, total_cents: 20000, gateway_fee_cents: 600 })],
    [{ transaction_id: "t1", revenue_cents: 5000 }]).find(b => b.id === "hector")?.total).toBe(3395);
  });
  it("uses 10% fallback only on service income", () => {
    expect(rank([tx({ payment_method: "stripe", type: "mixed", subtotal_cents: 15000, total_cents: 15000 })],
    [{ transaction_id: "t1", revenue_cents: 5000 }]).find(b => b.id === "hector")?.total).toBe(3150);
  });
  it("uses daily, weekly and monthly operating-day W-2 salary without changing input data", () => {
    for (const [period, expected] of [["day", -11400], ["week", -57000], ["month", -228000]] as const) {
      const range = homeRange(day, period);
      expect(homeBarberContribution(barbers, [], [], [], 0.1, range.start, range.end).find(b => b.id === "charlie")?.total).toBe(expected);
    }
    const receipts = [tx()];
    const original = structuredClone(receipts);
    rank(receipts);
    expect(receipts).toEqual(original);
  });
});