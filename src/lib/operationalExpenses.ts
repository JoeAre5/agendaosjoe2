import { eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { operatingDayNumber, parseHomeDate } from "@/lib/homePeriods";

export type ExpenseFrequency = "once" | "daily" | "weekly" | "monthly";
export interface ExpenseDefinition {
  id: string; title: string; amount_cents: number; expense_date: string;
  frequency: string; description: string; end_date: string | null; is_active?: boolean;
}
export interface ExpenseContribution extends ExpenseDefinition { period_cents: number }
export const frequencyLabel = (frequency: string, es: boolean) => ({
  once: es ? "Una sola vez" : "Once", daily: es ? "Diario" : "Daily", weekly: es ? "Semanal" : "Weekly", monthly: es ? "Mensual" : "Monthly",
}[frequency] ?? frequency);

export function validExpenseSchedule(frequency: string, date: string, end: string, description: string) {
  return ["once", "daily", "weekly", "monthly"].includes(frequency) && description.length <= 2000
    && (frequency !== "once" || parseHomeDate(date) !== null);
}

/** Allocate integer cents by each cycle's operating-day index, so daily views sum exactly to full cycles. */
export function expenseContributions(entries: ExpenseDefinition[], start: Date, end: Date): ExpenseContribution[] {
  const from = format(start, "yyyy-MM-dd"), to = format(end, "yyyy-MM-dd");
  return entries.map(entry => {
    let period_cents = 0;
    if (entry.is_active === false) return { ...entry, period_cents };
    if (entry.frequency === "once") {
      period_cents = entry.expense_date >= from && entry.expense_date <= to ? entry.amount_cents : 0;
    } else {
      for (const date of eachDayOfInterval({ start, end })) {
        const key = format(date, "yyyy-MM-dd");
        if (operatingDayNumber(date) === null) continue;
        if (entry.frequency === "daily") { period_cents += entry.amount_cents; continue; }
        const monthly = entry.frequency === "monthly";
        const cycleStart = monthly ? startOfMonth(date) : startOfWeek(date, { weekStartsOn: 6 });
        const cycleEnd = monthly ? endOfMonth(date) : endOfWeek(date, { weekStartsOn: 6 });
        const days = eachDayOfInterval({ start: cycleStart, end: cycleEnd }).filter(d => operatingDayNumber(d) !== null);
        const index = days.findIndex(d => format(d, "yyyy-MM-dd") === key);
        period_cents += Math.floor(entry.amount_cents / days.length) + (index < entry.amount_cents % days.length ? 1 : 0);
      }
    }
    return { ...entry, period_cents };
  }).filter(entry => entry.period_cents > 0);
}

export function homeExpenseBreakdown(entries: ExpenseDefinition[], start: Date, end: Date) {
  const rows = expenseContributions(entries, start, end);
  const recurringCents = rows.filter(e => e.frequency !== "once").reduce((sum, e) => sum + e.period_cents, 0);
  const onceCents = rows.filter(e => e.frequency === "once").reduce((sum, e) => sum + e.period_cents, 0);
  return { rows, recurringCents, onceCents, totalCents: recurringCents + onceCents };
}

export function expenseAmountCents(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 2147483647 ? amount : null;
}

export function validExpense(title: string, amount: string, date: string): boolean {
  return title.trim().length > 0 && title.trim().length <= 200 && expenseAmountCents(amount) !== null && parseHomeDate(date) !== null;
}