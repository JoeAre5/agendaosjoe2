import { describe, expect, it } from "vitest";
import { nativeAddonRefIds, parseSavedAddonId } from "./addonIds";

describe("parseSavedAddonId", () => {
  it("los ids de Acuity siguen siendo numeros", () => {
    expect(parseSavedAddonId("12345")).toBe(12345);
    expect(parseSavedAddonId(12345)).toBe(12345);
    expect(parseSavedAddonId("-7")).toBe(-7);
  });

  it("un uuid nativo se conserva tal cual (antes salia NaN y el complemento desaparecia)", () => {
    const uuid = "7a7fc184-ed01-4e6c-83f2-fac53c373396";
    expect(parseSavedAddonId(uuid)).toBe(uuid);
    expect(Number.isNaN(Number(uuid))).toBe(true); // el error que se corrige
  });

  it("valores vacios no producen NaN", () => {
    expect(parseSavedAddonId(undefined)).toBe("");
    expect(parseSavedAddonId(null)).toBe("");
  });
});

describe("nativeAddonRefIds", () => {
  it("deja solo los ids nativos y descarta los numeros de Acuity", () => {
    expect(nativeAddonRefIds([12, "aaaa-bbbb", 34, "cccc-dddd"])).toEqual(["aaaa-bbbb", "cccc-dddd"]);
    expect(nativeAddonRefIds([])).toEqual([]);
    expect(nativeAddonRefIds([1, 2])).toEqual([]);
  });
});
