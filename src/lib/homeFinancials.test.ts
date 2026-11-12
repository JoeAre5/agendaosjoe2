import { describe, expect, it } from "vitest";
import { homeProfitLoss, homeServiceFees, type FeeTransaction } from "./homeFinancials";
import { buildUnifiedProduction } from "./unifiedProduction";
import { prorateWeeklyCents, parseHomeDate } from "./homePeriods";
import { expenseAmountCents, validExpense } from "./operationalExpenses";

const receipt = (overrides: Partial<FeeTransaction> = {}): FeeTransaction => ({ id: "t1", barber_id: "b1", appointment_id: null, created_at: "2026-11-06T12:00:00-04:00", status: "completed", payment_method: "stripe", subtotal_cents: 10000, tip_cents: 2000, total_cents: 12000, gateway_fee_cents: 360, ...overrides });

describe("Home P&L", () => {
  it("subtracts fees once, gross salary, earned commissions, fixed and manual expenses", () => {
    expect(homeProfitLoss(100000, 3000, 11400, 39000, 5000, 2500).profit).toBe(39100);
    expect(homeProfitLoss(100000, 3000, 11400, 39000, 5000, 2500).netIncome).toBe(97000);
  });
  it("prorates the $570 W-2 salary to $114 and $250 fixed expenses to $50 on an operating day", () => {
    const date = parseHomeDate("2026-11-06");
    if (!date) throw new Error("Invalid date");
    expect(prorateWeeklyCents(57000, date, date)).toBe(11400);
    expect(prorateWeeklyCents(25000, date, date)).toBe(5000);
  });
  it("reports a loss and leaves margin unavailable with no income", () => {
    expect(homeProfitLoss(0, 0, 11400, 0, 5000, 0)).toMatchObject({ profit: -16400, margin: null });
  });
  it("keeps gross payroll and all operating costs available for the reserve without including service fees", () => {
    const summary = homeProfitLoss(100000, 3000, 11400, 39000, 5000, 2500);
    expect(summary.personnel).toBe(50400);
    expect(summary.expenses).toBe(7500);
    expect(summary.personnel + summary.expenses).toBe(57900);
    expect(3000 + summary.personnel + summary.expenses).toBe(60900);
    expect(100000 - summary.profit).toBe(60900);
  });
  it("uses actual fees and excludes the tip share from service fees", () => {
    const tx = [receipt()];
    expect(homeServiceFees(buildUnifiedProduction([], tx), tx, 0.1)).toMatchObject({ totalCents: 300, actualCents: 300, estimatedCents: 0 });
  });
  it("estimates only receipts without real fees at 10%", () => {
    const tx = [receipt(), receipt({ id: "t2", tip_cents: 0, total_cents: 10000, gateway_fee_cents: null })];
    expect(homeServiceFees(buildUnifiedProduction([], tx), tx, 0.1)).toMatchObject({ actualCents: 300, estimatedCents: 1000, totalCents: 1300 });
  });
  it("keeps actual zero fees as zero and cash fee-free", () => {
    const tx = [receipt({ gateway_fee_cents: 0 }), receipt({ id: "cash", payment_method: "cash", gateway_fee_cents: null })];
    expect(homeServiceFees(buildUnifiedProduction([], tx), tx, 0.1).totalCents).toBe(0);
  });
});

describe("manual expense validation", () => {
  it("stores dollar amounts as exact positive cents", () => {
    expect(expenseAmountCents("12.34")).toBe(1234);
    expect(expenseAmountCents("0.01")).toBe(1);
  });
  it("rejects zero, negatives, extra decimals, invalid dates and blank descriptions", () => {
    expect(expenseAmountCents("0")).toBeNull();
    expect(expenseAmountCents("-5")).toBeNull();
    expect(expenseAmountCents("1.234")).toBeNull();
    expect(validExpense(" ", "5", "2026-11-06")).toBe(false);
    expect(validExpense("Supplies", "5", "2026-02-30")).toBe(false);
    expect(validExpense("Supplies", "5", "2026-11-06")).toBe(true);
  });
});