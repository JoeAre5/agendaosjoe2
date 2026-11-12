import { describe, expect, it } from "vitest";
import { expenseContributions } from "@/lib/operationalExpenses";

const rent = { id: "r", title: "Renta", amount_cents: 100000, expense_date: "2026-01-01", frequency: "monthly", description: "", end_date: null };

describe("P&L export expenses", () => {
  it("full month export includes the whole monthly expense, like Home", () => {
    const rows = expenseContributions([rent], new Date(2026, 10, 1), new Date(2026, 10, 30, 23, 59));
    expect(rows[0].period_cents).toBe(100000);
  });
  it("weekly split pieces sum exactly to the month total", () => {
    const parts = [[1, 6], [7, 13], [14, 20], [21, 27], [28, 30]].map(([a, b]) =>
      expenseContributions([rent], new Date(2026, 10, a), new Date(2026, 10, b, 23, 59))[0]?.period_cents ?? 0);
    expect(parts.reduce((s, v) => s + v, 0)).toBe(100000);
  });
});
