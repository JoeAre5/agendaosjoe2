import { describe, expect, it } from "vitest";
import { buildUnifiedProduction, sumProduction, sumTips, type RawAppointment, type RawTransaction } from "./unifiedProduction";

const appt: RawAppointment = { id: "a", barber_id: "b", starts_at: "2026-10-27T10:00:00-04:00", status: "scheduled", paid: true, price_cents: 4000, amount_paid_cents: 4500, tip_cents: 500, payment_method: "stripe", notes: null };
const base: RawTransaction = { id: "t1", appointment_id: "a", barber_id: "b", created_at: appt.starts_at, status: "completed", payment_method: "stripe", subtotal_cents: 2500, tip_cents: 500, total_cents: 3000 };
describe("production after staff additions", () => {
  it("adds the original haircut payment and later beard payment exactly once", () => {
    const rows = buildUnifiedProduction([appt], [base, { ...base, id: "t2", subtotal_cents: 1500, tip_cents: 0, total_cents: 1500 }]);
    expect(rows).toHaveLength(1);
    expect(sumProduction(rows)).toBe(4000);
    expect(sumTips(rows)).toBe(500);
  });
  it("excludes uncompleted top-ups", () => {
    expect(sumProduction(buildUnifiedProduction([appt], [base, { ...base, id: "t2", status: "pending", subtotal_cents: 1500 }]))).toBe(2500);
  });
  it("excludes no-show appointments with recorded transactions", () => {
    expect(buildUnifiedProduction([{ ...appt, status: "no_show" }], [base])).toHaveLength(0);
  });
});