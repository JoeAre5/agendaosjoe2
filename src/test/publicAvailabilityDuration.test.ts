import { describe, expect, it, vi } from "vitest";
import { readAvailabilityDuration } from "../../supabase/functions/public-booking-create/availabilityDuration";

describe("public availability full duration", () => {
  const catalogs: Record<string, unknown> = {
    "/appointment-types": [{ id: 10, duration: 60 }, { id: 11, duration: 30 }],
    "/appointment-addons": [{ id: 20, duration: 15 }, { id: 21, duration: 0 }],
  };
  const fetchCatalog = () => vi.fn(async (path: string) => ({ ok: path in catalogs, data: catalogs[path] }));
  it("reads a 60-minute service from the supported list endpoint", async () => {
    const fetch = fetchCatalog();
    expect(await readAvailabilityDuration(fetch, 10, [])).toBe(60);
    expect(fetch).toHaveBeenCalledWith("/appointment-types");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("checks the full 75-minute interval including a selected add-on once", async () => {
    expect(await readAvailabilityDuration(fetchCatalog(), 10, [20, 20, 21])).toBe(75);
  });
  it("fails closed for an unknown service", async () => {
    expect(await readAvailabilityDuration(fetchCatalog(), 999, [])).toBeNull();
  });
  it("fails closed for an unresolved add-on", async () => {
    expect(await readAvailabilityDuration(fetchCatalog(), 10, [999])).toBeNull();
  });
  it("fails closed when a catalog read fails", async () => {
    expect(await readAvailabilityDuration(async () => ({ ok: false, data: null }), 10, [])).toBeNull();
  });
  it("fails closed for invalid service or add-on durations", async () => {
    expect(await readAvailabilityDuration(async () => ({ ok: true, data: [{ id: 10, duration: 0 }] }), 10, [])).toBeNull();
    const fetch = vi.fn(async (path: string) => ({ ok: true, data: path === "/appointment-types" ? catalogs[path] : [{ id: 20, duration: -1 }] }));
    expect(await readAvailabilityDuration(fetch, 10, [20])).toBeNull();
  });
});