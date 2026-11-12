import { describe, expect, it } from "vitest";
import { aggregateRecognitionSpending, sumAppointmentPrices, productPurchaseCents, type ProductTransaction, aggregateRecentActivity, aggregateAppointmentVisits, selectVisitAppointments, nextVisitUpdateAt, fetchAppointmentPages, clientRecognitionThreshold, compareClientVisits, isRecognizedClient } from "./clientRankings";

describe("independent client rankings", () => {
  it("ranks frequent visitors ahead of higher spenders", () => {
    const frequent = { first_name: "Ana", last_name: null, total_visits: 20, total_spent_cents: 5000 };
    const spender = { first_name: "Luis", last_name: null, total_visits: 2, total_spent_cents: 50000 };
    expect([spender, frequent].sort(compareClientVisits)).toEqual([frequent, spender]);
    expect(clientRecognitionThreshold([spender, frequent], "total_visits")).toBe(20);
    expect(clientRecognitionThreshold([spender, frequent], "total_spent_cents")).toBe(50000);
  });
  it("keeps VIP's top-fifth threshold and includes equal visit counts", () => {
    const clients = [20, 10, 10, 9, 8, 7, 6, 5, 4, 3].map(total_visits => ({ total_visits, total_spent_cents: 0 }));
    const threshold = clientRecognitionThreshold(clients, "total_visits");
    expect(threshold).toBe(10);
    expect(clients.filter(c => isRecognizedClient(c.total_visits, threshold))).toHaveLength(3);
    expect(isRecognizedClient(9, threshold)).toBe(false);
  });
  it("does not award a crown to clients with no visits or spending", () => {
    expect(clientRecognitionThreshold([], "total_visits")).toBe(0);
    expect(isRecognizedClient(0, 0)).toBe(false);
  });
  it("allows a client to qualify independently for both crowns", () => {
    expect(isRecognizedClient(20, 10)).toBe(true);
    expect(isRecognizedClient(50000, 40000)).toBe(true);
  });
  it("only counts the last 90 days of activity", () => {
    const now = new Date("2026-11-06T12:00:00-04:00");
    const m = aggregateRecentActivity([
      { client_id: "a", total_cents: 4000, created_at: "2026-11-01T10:00:00-04:00" },
      { client_id: "a", total_cents: 9000, created_at: "2026-07-01T10:00:00-04:00" },
      { client_id: "b", total_cents: 99999, created_at: "2026-01-01T10:00:00-04:00" },
    ], now);
    expect(m.get("a")).toEqual({ total_visits: 1, total_spent_cents: 4000 });
    expect(m.has("b")).toBe(false);
  });
  it("breaks attendance ties by name rather than money and leaves source data unchanged", () => {
    const clients = [
      { first_name: "Zoe", last_name: null, total_visits: 10, total_spent_cents: 50000 },
      { first_name: "Ana", last_name: null, total_visits: 10, total_spent_cents: 1000 },
    ];
    expect([...clients].sort(compareClientVisits)[0].first_name).toBe("Ana");
    expect(clients[0].first_name).toBe("Zoe");
  });
});

describe("recognition-only spending exception", () => {
  const now = new Date("2026-11-06T22:00:00-04:00");
  const appt = (id: string, overrides = {}) => ({ id, client_id: "carlos", barber_id: "charlie", starts_at: "2026-11-04T12:00:00-04:00", status: "scheduled", price_cents: 5000, ...overrides });
  const tx = (overrides = {}): ProductTransaction => ({ id: "tx", client_id: "carlos", created_at: now.toISOString(), status: "completed", type: "mixed", subtotal_cents: 6500, transaction_items: [
    { id: "service", item_type: "service", total_cents: 5000 }, { id: "pomade", item_type: "product", total_cents: 1500 },
  ], ...overrides });

  it("includes scheduled unpaid prices, excludes cancellations and future starts", () => {
    expect(sumAppointmentPrices([appt("unpaid"), appt("cancelled", { status: "cancelled" }), appt("future", { starts_at: new Date(now.getTime() + 1).toISOString() })], now)).toBe(5000);
  });
  it("counts two IDs on the same day or week separately and the same ID only once", () => {
    expect(sumAppointmentPrices([appt("a"), appt("a"), appt("b")], now)).toBe(10000);
  });
  it("uses complete profile history but only 90 days for VIP", () => {
    const rows = [appt("recent"), appt("old", { starts_at: new Date(now.getTime() - 91 * 86400000).toISOString(), price_cents: 6000 })];
    expect(sumAppointmentPrices(rows, now)).toBe(11000);
    expect(aggregateRecognitionSpending(rows, [], [], now).get("carlos")).toBe(5000);
  });
  it("adds only products from mixed receipts, not services or tips, and deduplicates receipts", () => {
    const receipt = tx();
    expect(productPurchaseCents(receipt)).toBe(1500);
    expect(aggregateRecognitionSpending([appt("a")], [receipt, receipt], [], now).get("carlos")).toBe(6500);
  });
  it("includes product-only legacy subtotals but never infers products from mixed totals", () => {
    expect(productPurchaseCents(tx({ type: "product", transaction_items: [], subtotal_cents: 2000 }))).toBe(2000);
    expect(productPurchaseCents(tx({ transaction_items: [] }))).toBe(0);
  });
  it("excludes incomplete, refunded, old and future product receipts", () => {
    expect(productPurchaseCents(tx({ status: "pending" }))).toBe(0);
    expect(productPurchaseCents(tx({ status: "refunded" }))).toBe(0);
    expect(aggregateRecognitionSpending([], [tx({ id: "old", created_at: new Date(now.getTime() - 91 * 86400000).toISOString() }), tx({ id: "future", created_at: new Date(now.getTime() + 1).toISOString() })], [], now).size).toBe(0);
  });
  it("reflects fresh cancellations and future transition in spending", () => {
    expect(aggregateRecognitionSpending([appt("a")], [], [], now).get("carlos")).toBe(5000);
    expect(aggregateRecognitionSpending([appt("a", { status: "cancelled" })], [], [], now).has("carlos")).toBe(false);
    const rows = [appt("next", { starts_at: new Date(now.getTime() + 1000).toISOString() })];
    expect(sumAppointmentPrices(rows, now)).toBe(0);
    expect(sumAppointmentPrices(rows, new Date(now.getTime() + 1000))).toBe(5000);
  });
  it("sums more than 1,000 appointments and leaves stored accounting inputs unchanged", async () => {
    const rows = Array.from({ length: 1201 }, (_, i) => appt(String(i)));
    const before = JSON.stringify(rows);
    const loaded = await fetchAppointmentPages(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(sumAppointmentPrices(loaded, now)).toBe(6005000);
    const financial = [{ client_id: "carlos", total_cents: 4000, created_at: now.toISOString() }];
    aggregateRecognitionSpending(loaded, [tx()], [], now);
    expect(aggregateRecentActivity(financial, now).get("carlos")?.total_spent_cents).toBe(4000);
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("approved appointment visit rules", () => {
  const now = new Date("2026-11-06T21:28:00-04:00");
  const appointment = (id: string, overrides = {}) => ({ id, client_id: "carlos", client_name: "Carlos", barber_id: "charlie", status: "scheduled", starts_at: "2026-11-04T12:00:00-04:00", ...overrides });

  it("counts unpaid appointments at starts_at <= now, not future or cancelled appointments", () => {
    expect(selectVisitAppointments([
      appointment("unpaid", { balance: 4000 }),
      appointment("at-start", { starts_at: now.toISOString() }),
      appointment("future", { starts_at: new Date(now.getTime() + 1).toISOString() }),
      appointment("cancelled", { status: "cancelled" }),
    ], now).map(a => a.id)).toEqual(["unpaid", "at-start"]);
  });
  it("counts each appointment ID once, including multiple appointments on the same day", () => {
    expect(selectVisitAppointments([appointment("a"), appointment("a"), appointment("b")], now)).toHaveLength(2);
  });
  it("uses complete history for profiles but only the last 90 days for Frecuentes", () => {
    const rows = [appointment("old", { starts_at: new Date(now.getTime() - 91 * 86400000).toISOString() }), appointment("boundary", { starts_at: new Date(now.getTime() - 90 * 86400000).toISOString() }), appointment("recent")];
    expect(selectVisitAppointments(rows, now)).toHaveLength(3);
    expect(aggregateAppointmentVisits(rows, [], now).get("carlos")).toBe(2);
  });
  it("filters actual appointment barber, never preferred barber", () => {
    const rows = [appointment("charlie"), appointment("hector", { barber_id: "hector" })];
    expect(aggregateAppointmentVisits(rows, [], now).get("carlos")).toBe(2);
    expect(aggregateAppointmentVisits(rows, [], now, "charlie").get("carlos")).toBe(1);
    expect(aggregateAppointmentVisits(rows, [], now, "hector").get("carlos")).toBe(1);
  });
  it("replaces cancellation counts when fresh data arrives", () => {
    expect(aggregateAppointmentVisits([appointment("a")], [], now).get("carlos")).toBe(1);
    expect(aggregateAppointmentVisits([appointment("a", { status: "cancelled" })], [], now).has("carlos")).toBe(false);
  });
  it("chooses the nearest chronological future start from unsorted rows, ignoring cancellations", () => {
    const rows = [appointment("later", { starts_at: new Date(now.getTime() + 60000).toISOString() }), appointment("nearest", { starts_at: new Date(now.getTime() + 1000).toISOString() }), appointment("cancelled", { status: "cancelled", starts_at: new Date(now.getTime() + 100).toISOString() })];
    expect(nextVisitUpdateAt(rows, now)).toBe(now.getTime() + 1000);
    expect(selectVisitAppointments(rows, now)).toHaveLength(0);
    expect(selectVisitAppointments(rows, new Date(now.getTime() + 1000)).map(a => a.id)).toEqual(["nearest"]);
  });
  it("paginates histories above 1,000 without truncation, including exact page multiples", async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => appointment(String(i)));
    const ranges: number[][] = [];
    const loaded = await fetchAppointmentPages(async (from, to) => { ranges.push([from, to]); return { data: rows.slice(from, to + 1), error: null }; });
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(selectVisitAppointments(loaded, now)).toHaveLength(2001);
    const exact = await fetchAppointmentPages(async (from, to) => ({ data: rows.slice(0, 2000).slice(from, to + 1), error: null }));
    expect(exact).toHaveLength(2000);
  });
  it("rejects failed pages instead of returning incomplete history", async () => {
    await expect(fetchAppointmentPages(async from => from === 0 ? { data: Array.from({ length: 1000 }, (_, i) => appointment(String(i))), error: null } : { data: null, error: { message: "failed" } })).rejects.toThrow("failed");
  });
  it("keeps ID attribution authoritative and uses the existing name fallback only for unlinked rows", () => {
    const clients = [{ id: "carlos", first_name: "Carlos", last_name: null }];
    const rows = [appointment("legacy", { client_id: null }), appointment("other", { client_id: "other" })];
    expect(aggregateAppointmentVisits(rows, clients, now).get("carlos")).toBe(1);
    expect(aggregateAppointmentVisits(rows, clients, now).get("other")).toBe(1);
  });
  it("leaves transaction spending and source appointments intact", () => {
    const rows = [appointment("a")];
    const before = JSON.stringify(rows);
    const txs = [{ client_id: "carlos", total_cents: 4000, created_at: now.toISOString() }];
    const spending = aggregateRecentActivity(txs, now);
    aggregateAppointmentVisits(rows, [], now);
    expect(aggregateRecentActivity(txs, now)).toEqual(spending);
    expect(spending.get("carlos")?.total_spent_cents).toBe(4000);
    expect(JSON.stringify(rows)).toBe(before);
  });
});