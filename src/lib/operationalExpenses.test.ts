import { describe, expect, it } from "vitest";
import { eachDayOfInterval } from "date-fns";
import { expenseContributions, homeExpenseBreakdown, validExpenseSchedule, type ExpenseDefinition } from "./operationalExpenses";
import { parseHomeDate } from "./homePeriods";
function date(value: string) { const result = parseHomeDate(value); if (!result) throw new Error(value); return result; }
const entry = (values: Partial<ExpenseDefinition> = {}): ExpenseDefinition => ({ id: "e1", title: "Renta", amount_cents: 100000, expense_date: "2026-01-01", description: "", frequency: "weekly", end_date: null, ...values });
const total = (e: ExpenseDefinition, start: string, end = start) => expenseContributions([e], date(start), date(end)).reduce((sum,r) => sum + r.period_cents,0);
describe("expense frequencies", () => {
  it("counts a one-time expense fully only on its date, including non-operating days", () => {
    const e=entry({frequency:"once",expense_date:"2026-11-08",amount_cents:1234});
    expect(total(e,"2026-11-08")).toBe(1234); expect(total(e,"2026-11-07")).toBe(0);
  });
  it("allocates $1000 weekly over five operating days, excluding Sunday and Monday", () => {
    expect(total(entry(),"2026-11-06")).toBe(20000);
    expect(total(entry(),"2026-11-07","2026-11-13")).toBe(100000);
    expect(total(entry(),"2026-11-08","2026-11-09")).toBe(0);
  });
  it.each(["2026-02-01","2026-11-01","2026-12-01"])("allocates a complete monthly $1000 exactly in %s", start => {
    const end=start.startsWith("2026-02")?"2026-02-28":start.startsWith("2026-11")?"2026-11-30":"2026-12-31";
    expect(total(entry({frequency:"monthly"}),start,end)).toBe(100000);
  });
  it("does not clip a monthly $200 bill entered November 6", () => {
    const e=entry({expense_date:"2026-11-06",end_date:null,frequency:"monthly",amount_cents:20000});
    expect(total(e,"2026-11-01","2026-11-30")).toBe(20000);
  });
  it("daily allocations add up to the monthly value including remainder cents", () => {
    const e=entry({frequency:"monthly",amount_cents:100001});
    const sum=eachDayOfInterval({start:date("2026-11-01"),end:date("2026-11-30")}).reduce((s,d)=>s+expenseContributions([e],d,d).reduce((a,r)=>a+r.period_cents,0),0);
    expect(sum).toBe(100001);
  });
  it("uses only entered expenses, retaining one-time amounts", () => {
    const entries=[entry({amount_cents:50000}),entry({id:"once",frequency:"once",expense_date:"2026-11-06",amount_cents:2500})];
    expect(homeExpenseBreakdown(entries,date("2026-11-06"),date("2026-11-06")).totalCents).toBe(12500);
    expect(homeExpenseBreakdown([],date("2026-11-06"),date("2026-11-06")).totalCents).toBe(0);
  });
  it("converts weekly $50 into the actual month's operating-day cost", () => {
    const e=entry({amount_cents:5000});
    expect(total(e,"2026-11-06")).toBe(1000);
    expect(total(e,"2026-11-07","2026-11-13")).toBe(5000);
    expect(total(e,"2026-11-01","2026-11-30")).toBe(20000);
    expect(total(e,"2026-12-01","2026-12-31")).toBe(23000);
  });
  it("converts daily $5 into weekly and monthly operating costs", () => {
    const e=entry({frequency:"daily",amount_cents:500});
    expect(total(e,"2026-11-06")).toBe(500);
    expect(total(e,"2026-11-07","2026-11-13")).toBe(2500);
    expect(total(e,"2026-11-01","2026-11-30")).toBe(10000);
    expect(total(e,"2026-11-08","2026-11-09")).toBe(0);
  });
  it("monthly $200 shows $10 daily, $50 weekly and $200 monthly in November", () => {
    const e=entry({frequency:"monthly",amount_cents:20000,expense_date:"2026-11-06"});
    expect(total(e,"2026-11-06")).toBe(1000);
    expect(total(e,"2026-11-07","2026-11-13")).toBe(5000);
    expect(total(e,"2026-11-01","2026-11-30")).toBe(20000);
  });
  it("sums monthly, weekly and daily costs into the same monthly total", () => {
    const entries=[entry({frequency:"monthly",amount_cents:20000}),entry({id:"w",frequency:"weekly",amount_cents:5000}),entry({id:"d",frequency:"daily",amount_cents:500})];
    expect(homeExpenseBreakdown(entries,date("2026-11-01"),date("2026-11-30")).totalCents).toBe(50000);
  });
  it("excludes inactive costs without deleting their definitions", () => {
    expect(total(entry({is_active:false}),"2026-11-01","2026-11-30")).toBe(0);
  });
  it("accepts daily frequency and rejects invalid recurrence and oversized descriptions", () => {
    expect(validExpenseSchedule("daily","2026-11-06","", "")).toBe(true);
    expect(validExpenseSchedule("yearly","2026-11-06","", "")).toBe(false);
    expect(validExpenseSchedule("monthly","2026-11-06","", "x".repeat(2001))).toBe(false);
  });
});