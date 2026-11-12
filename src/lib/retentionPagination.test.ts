import { describe, expect, it } from "vitest";
import { readAllRowsBounded } from "./retentionPagination";

const source = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("bounded retention pagination", () => {
  it("returns every row of 2,500 in order with at most 4 requests in flight", async () => {
    const rows = source(2500);
    let inFlight = 0, peak = 0;
    const r = await readAllRowsBounded(async () => ({ count: 2500, error: null }), async (from, to) => {
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((ok) => setTimeout(ok, 5));
      inFlight--;
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(r.error).toBeNull();
    expect(r.data).toEqual(rows);
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("handles an exact multiple of 1,000 and rows added after counting", async () => {
    const rows = source(3001);
    const r = await readAllRowsBounded(async () => ({ count: 2000, error: null }), async (from, to) => ({ data: rows.slice(from, to + 1), error: null }));
    expect(r.data.length).toBe(3001);
  });

  it("fails closed when any page fails", async () => {
    const r = await readAllRowsBounded(async () => ({ count: 5000, error: null }), async (from) =>
      from === 2000 ? { data: null, error: "boom" } : { data: source(1000), error: null });
    expect(r.error).toBe("boom");
    expect(r.data).toEqual([]);
  });

  it("fails closed when the count is unavailable", async () => {
    const r = await readAllRowsBounded(async () => ({ count: null, error: "x" }), async () => ({ data: [1], error: null }));
    expect(r.data).toEqual([]);
    expect(r.error).toBe("x");
  });
});
