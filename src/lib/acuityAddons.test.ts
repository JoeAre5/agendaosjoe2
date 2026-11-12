import { describe, expect, it, vi } from "vitest";
import { createAcuityAddonResolver, resolveAcuityAddonNames } from "../../supabase/functions/_shared/acuityAddons";

const catalog = [{ id: 21, name: "*FACIAL" }, { id: 22, name: "BARBA" }];
describe("Acuity add-on normalization", () => {
  it("does not interpret absent selection as explicit removal", () => {
    expect(resolveAcuityAddonNames({}, null)).toBeUndefined();
  });
  it("loads the catalog only once across different recurring occurrences", async () => {
    const load = vi.fn().mockResolvedValue(catalog);
    const resolve = createAcuityAddonResolver(load, vi.fn());
    expect(await resolve({ addonIDs: [21] })).toEqual(["*FACIAL"]);
    expect(await resolve({ addonIDs: [22] })).toEqual(["BARBA"]);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("catalog failure omits names without blocking the caller", async () => {
    const error = vi.fn();
    const resolve = createAcuityAddonResolver(async () => { throw new Error("offline"); }, error);
    expect(await resolve({ addonIDs: [21] })).toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
  });
  it("explicit removal needs no network request", async () => {
    const load = vi.fn();
    expect(await createAcuityAddonResolver(load, vi.fn())({ addonIDs: [] })).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
  it("resolves legitimate addonIDs even when addons is absent", () => {
    expect(resolveAcuityAddonNames({ addonIDs: [21, 22] }, catalog)).toEqual(["*FACIAL", "BARBA"]);
  });
  it("deduplicates IDs and uses their order", () => {
    expect(resolveAcuityAddonNames({ addonIDs: [22, "21", 22] }, catalog)).toEqual(["BARBA", "*FACIAL"]);
  });
  it("does not silently erase an unknown add-on", () => {
    expect(() => resolveAcuityAddonNames({ addonIDs: [999] }, catalog)).toThrow();
  });
  it("does not erase add-ons when the catalog is unavailable", () => {
    expect(() => resolveAcuityAddonNames({ addonIDs: [21] }, null)).toThrow();
  });
  it("accepts explicit removal without a catalog", () => {
    expect(resolveAcuityAddonNames({ addonIDs: [], addons: [{ name: "stale" }] }, null)).toEqual([]);
  });
  it("supports legacy named add-ons", () => {
    expect(resolveAcuityAddonNames({ addons: [{ name: "BARBA" }] }, null)).toEqual(["BARBA"]);
  });
});