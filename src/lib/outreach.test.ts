import { describe, expect, it } from "vitest";
import { outreachState, pendingClientsAsOf, trendPct, whatsappUrl, earliestRecord, type OutreachAppt, type CopyEvent, type CreditRow } from "./outreach";

const DAY = 86_400_000;
const NOW = new Date("2026-11-06T16:00:00-04:00");
let n = 0;
function a(client: string, daysFromNow: number, opts: Partial<OutreachAppt> = {}): OutreachAppt {
  const start = new Date(NOW.getTime() + daysFromNow * DAY);
  return {
    id: `a${n++}`, client_id: client, client_name: client, barber_id: "b1", client_phone: "7875551234",
    starts_at: start.toISOString(), status: "scheduled", price_cents: 2500, amount_paid_cents: 0,
    created_at: new Date(start.getTime() - DAY).toISOString(), ...opts,
  };
}
// Habitual: every 14 days, last visit 30 days ago -> overdue.
const habitual = (c: string) => [a(c, -72), a(c, -58), a(c, -44), a(c, -30)];

describe("pendingClientsAsOf", () => {
  it("excludes clients without any telephone automatically", () => {
    for (const phone of [null, "", "   ", "---"]) {
      expect(pendingClientsAsOf(habitual("x").map((r) => ({ ...r, client_phone: phone })), NOW)).toHaveLength(0);
    }
  });
  it("does not reuse an old appointment phone when the profile has no phone", () => {
    expect(pendingClientsAsOf(habitual("x"), NOW, new Map([["x", null]]))).toHaveLength(0);
  });
  it("uses the current profile phone even when appointment snapshots lack one", () => {
    const rows = habitual("x").map((r) => ({ ...r, client_phone: null }));
    expect(pendingClientsAsOf(rows, NOW, new Map([["x", "7875559876"]]))[0]?.phone).toBe("7875559876");
  });
  it("counts a habitual overdue client regardless of payment", () => {
    expect(pendingClientsAsOf(habitual("x"), NOW).map((p) => p.history.clientId)).toEqual(["x"]);
  });
  it("ignores cancelled past appointments as visits", () => {
    const rows = [a("x", -72), a("x", -58, { status: "cancelled" }), a("x", -44, { status: "cancelled" }), a("x", -30)];
    expect(pendingClientsAsOf(rows, NOW)).toHaveLength(0); // only 2 real visits: not habitual
  });
  it("excludes clients with a future valid booking", () => {
    expect(pendingClientsAsOf([...habitual("x"), a("x", 3, { created_at: new Date(NOW.getTime() - DAY).toISOString() })], NOW)).toHaveLength(0);
  });
  it("a cancelled future booking does not exclude", () => {
    expect(pendingClientsAsOf([...habitual("x"), a("x", 3, { status: "cancelled" })], NOW)).toHaveLength(1);
  });
  it("excludes occasional clients (tendencia over 45 days or under 3 visits)", () => {
    expect(pendingClientsAsOf([a("y", -300), a("y", -200), a("y", -100)], NOW)).toHaveLength(0);
    expect(pendingClientsAsOf([a("z", -60), a("z", -40)], NOW)).toHaveLength(0);
  });
  it("excludes clients gone longer than 180 days", () => {
    const rows = [a("x", -230), a("x", -216), a("x", -202), a("x", -188)];
    expect(pendingClientsAsOf(rows, NOW)).toHaveLength(0);
  });
  it("reconstructs a past date only from rows created by then", () => {
    const asOf = new Date(NOW.getTime() - 20 * DAY);
    // A booking created after asOf must not hide the client as of asOf.
    const late = a("x", -5, { created_at: new Date(NOW.getTime() - 10 * DAY).toISOString() });
    const rows = [a("x", -100), a("x", -86), a("x", -72), a("x", -58), late];
    expect(pendingClientsAsOf(rows, asOf)).toHaveLength(1);
    expect(earliestRecord(rows)!.getTime()).toBeLessThan(asOf.getTime());
  });
});

const copy = (client: string, hoursAgo: number, actor = "u1"): CopyEvent => ({
  id: `c${n++}`, client_id: client, actor_user_id: actor, actor_barber_id: null, actor_name: actor, action: "copy",
  copied_at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
});

describe("outreachState", () => {
  it("copied within 72h shows the latest copier and window end", () => {
    const s = outreachState("x", [copy("x", 50, "u1"), copy("x", 10, "u2")], [], NOW);
    expect(s.stage).toBe("copied");
    expect(s.lastCopy?.actor_user_id).toBe("u2");
    expect(s.windowEndsAt!.getTime()).toBe(NOW.getTime() + 62 * 3_600_000);
  });
  it("a copy older than 72h reverts to pending (copy is not reactivation)", () => {
    expect(outreachState("x", [copy("x", 72)], [], NOW).stage).toBe("pending");
  });
  it("a backend credit shows reactivated", () => {
    const c = copy("x", 30);
    const credit: CreditRow = { appointment_id: "ap", client_id: "x", appointment_created_at: new Date(NOW.getTime() - 3_600_000).toISOString(),
      appointment_starts_at: NOW.toISOString(), appointment_barber_id: "b2", copy_id: c.id, copied_at: c.copied_at,
      actor_user_id: "u1", actor_barber_id: null, actor_name: "u1" };
    expect(outreachState("x", [c], [credit], NOW).stage).toBe("reactivated");
  });
});

describe("trendPct and whatsapp", () => {
  it("returns null when there is no comparable history", () => {
    expect(trendPct(5, null)).toBeNull();
    expect(trendPct(5, 0)).toBeNull();
    expect(trendPct(6, 4)).toBe(50);
  });
  it("builds digits-only PR links", () => {
    expect(whatsappUrl("(787) 555-1234", "Hola")).toBe("https://wa.me/17875551234?text=Hola");
    expect(whatsappUrl(null, "x")).toBeNull();
  });
});

describe("official outreach template", () => {
  it("uses the exact approved wording with first name and event", async () => {
    const { suggestedMessage, firstNameOf } = await import("./outreach");
    expect(suggestedMessage(firstNameOf("Carlos Torres Rivera"), "Navidad")).toBe(
      "Saludos Carlos, Se está acercando Navidad y estoy cuadrando las citas de mis clientes importantes. Quería asegurarme de que no te quedes sin tu espacio para esa fecha. ¿Quieres que te separe una cita?");
  });
  it("falls back without inventing a name or event", async () => {
    const { suggestedMessage, firstNameOf } = await import("./outreach");
    expect(firstNameOf("-")).toBeNull();
    expect(suggestedMessage(null, " ")).toBe(
      "Saludos, Se está acercando la próxima fecha especial y estoy cuadrando las citas de mis clientes importantes. Quería asegurarme de que no te quedes sin tu espacio para esa fecha. ¿Quieres que te separe una cita?");
  });
});

import { comparePendingHotFirst } from "./outreach";
describe("hot-lead ordering", () => {
  it("puts fewest overdue days first, ties by most recent visit", () => {
    const mk = (d: number, lv: string) => ({ phone: null, history: { daysFromExpected: d, lastVisit: new Date(lv) } }) as any;
    const sorted = [mk(40, "2026-01-01"), mk(2, "2026-05-01"), mk(2, "2026-06-01"), mk(10, "2026-03-01")].sort(comparePendingHotFirst);
    expect(sorted.map((s) => s.history.daysFromExpected)).toEqual([2, 2, 10, 40]);
    expect(sorted[0].history.lastVisit.toISOString().slice(0, 10)).toBe("2026-06-01");
  });
});
