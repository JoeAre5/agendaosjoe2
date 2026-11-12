import { describe, expect, it } from "vitest";
import { editServiceBalance, preserveItemizedEdit, readEditItems, replaceMainItems, resolveEditReplacement, totalEditItems, type AppointmentEditItem } from "../../supabase/functions/_shared/appointmentEditItems";

const corte: AppointmentEditItem = { kind: "service", id: 1, name: "CORTE", price_cents: 2500, duration_minutes: 30, quantity: 1 };
const barba: AppointmentEditItem = { kind: "addon", id: 2, name: "BARBA", price_cents: 1500, duration_minutes: 15, quantity: 1 };

describe("appointment edit itemized calculation", () => {
  it("replaces an unverifiable historical breakdown only after an explicit selection", () => {
    const main = { ...corte, price_cents: 5500, duration_minutes: 60 };
    const addon = { ...barba, name: "Chiva", price_cents: 500, duration_minutes: 15 };
    const replacement = resolveEditReplacement(null, main, [addon], true);
    expect(replacement).not.toBeNull();
    expect(totalEditItems(replacement ?? [])).toEqual({ priceCents: 6000, durationMinutes: 75 });
  });
  it("does not reconstruct unknown history merely to add another service", () => {
    expect(resolveEditReplacement(null, corte, [], false)).toBeNull();
  });
  it("does not reprice history on a notes-only edit", () => {
    expect(resolveEditReplacement([corte, barba], { ...corte, price_cents: 5500 }, [], false)).toEqual([corte, barba]);
  });
  it("keeps valid saved extras and products when replacing the main selection", () => {
    const extra = { ...barba, kind: "extra_service" as const };
    const product = { ...barba, kind: "product" as const, duration_minutes: 0 };
    expect(resolveEditReplacement([corte, extra, product], corte, [barba], true)).toEqual([corte, barba, extra, product]);
  });
  it("applies a selected replacement independently to an unverifiable recurring sibling", () => {
    expect(resolveEditReplacement(null, corte, [barba], true)).toEqual([corte, barba]);
  });
  it("a lower replacement price never produces a negative charge or automatic refund", () => {
    expect(editServiceBalance(2500, 6000, 500)).toBe(0);
  });
  it("adds the full haircut and beard amounts, not a difference from the previous total", () => {
    expect(totalEditItems(replaceMainItems([corte], corte, [barba])).priceCents).toBe(4000);
  });
  it("reserves haircut time plus beard time", () => {
    expect(totalEditItems([corte, barba]).durationMinutes).toBe(45);
  });
  it("preserves an extra service on subsequent main-service edits", () => {
    const extra = { ...barba, kind: "extra_service" as const };
    expect(totalEditItems(replaceMainItems([corte, extra], corte, [barba]))).toEqual({ priceCents: 5500, durationMinutes: 60 });
  });
  it("does not add the beard again when saving and reopening the same selection", () => {
    const saved = readEditItems(JSON.parse(JSON.stringify([corte, barba]))) ?? [];
    expect(totalEditItems(replaceMainItems(saved, corte, [barba])).priceCents).toBe(4000);
  });
  it("removing a beard leaves only the selected haircut", () => {
    expect(totalEditItems(replaceMainItems([corte, barba], corte, []))).toEqual({ priceCents: 2500, durationMinutes: 30 });
  });
  it("keeps collected tips separate from the service balance", () => {
    expect(editServiceBalance(4000, 3000, 500)).toBe(1500);
  });
  it("retains product quantities without adding scheduling time", () => {
    expect(totalEditItems([corte, { ...barba, kind: "product", duration_minutes: 0, quantity: 2 }])).toEqual({ priceCents: 5500, durationMinutes: 30 });
  });
  it("protects full totals and duration from later Acuity refreshes while allowing time changes", () => {
    const existing = { edit_line_items: [corte, barba], service_name: "CORTE", service_id: 1, addons: ["BARBA"], price_cents: 4000, duration_minutes: 45, amount_paid_cents: 3000, tip_cents: 500, paid: false, payment_confirmed: true, payment_method: "stripe" };
    const row = { starts_at: "2026-10-27T10:00:00-04:00", ends_at: "2026-10-27T10:30:00-04:00", price_cents: 2500, duration_minutes: 30, status: "scheduled" };
    preserveItemizedEdit(row, existing);
    expect(row.price_cents).toBe(4000);
    expect(row.duration_minutes).toBe(45);
    expect(row.ends_at).toBe("2026-10-27T14:45:00.000Z");
    expect(row).toMatchObject({ amount_paid_cents: 3000, tip_cents: 500, payment_method: "stripe", payment_confirmed: true, paid: false });
  });
  it("does not override cancellations or legacy appointments", () => {
    const row = { status: "cancelled", paid: true, price_cents: 2500 };
    preserveItemizedEdit(row, { edit_line_items: [corte], paid: true, price_cents: 4000 });
    expect(row.paid).toBe(false);
    const legacy = { price_cents: 2500 };
    preserveItemizedEdit(legacy, { edit_line_items: null, price_cents: 4000 });
    expect(legacy.price_cents).toBe(2500);
  });
});