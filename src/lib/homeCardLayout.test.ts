import { beforeEach, describe, expect, it, vi } from "vitest";
import { homeLayoutKey, moveHomeCard, normalizeHomeCardLayout, readHomeCardLayout, reorderHomeCard, saveHomeCardLayout } from "./homeCardLayout";

describe("Admin Home layout", () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  it("preserves all nine cards and their default sections", () => {
    const layout = normalizeHomeCardLayout(null);
    expect(layout.main).toEqual(["profit", "expenses", "retention", "production", "payroll", "appointments"]);
    expect(layout.details).toEqual(["payments", "ranking", "services"]);
  });
  it("minus moves the card to the bottom of operational details, not deletion", () => {
    const layout = moveHomeCard(normalizeHomeCardLayout(null), "profit", "details");
    expect(layout.main).toEqual(["expenses", "retention", "production", "payroll", "appointments"]);
    expect(layout.details).toEqual(["payments", "ranking", "services", "profit"]);
    expect([...layout.main, ...layout.details]).toHaveLength(9);
  });
  it("plus restores a card to the bottom of Home", () => {
    const layout = moveHomeCard(normalizeHomeCardLayout(null), "ranking", "main");
    expect(layout.main.at(-1)).toBe("ranking");
    expect(layout.details).toEqual(["payments", "services"]);
  });
  it("reorders independently inside either section without mutating the original", () => {
    const original = normalizeHomeCardLayout(null);
    expect(reorderHomeCard(original, "expenses", "profit").main.slice(0, 2)).toEqual(["expenses", "profit"]);
    expect(reorderHomeCard(original, "services", "payments").details).toEqual(["services", "payments", "ranking"]);
    expect(original.main[0]).toBe("profit");
    expect(reorderHomeCard(original, "expenses", "payments")).toBe(original);
  });
  it("rejects unknown/duplicate ids and recovers missing cards", () => {
    expect(normalizeHomeCardLayout({ main: ["ranking", "ranking", "unknown"], details: ["ranking", "profit"] }))
      .toEqual({ main: ["ranking", "expenses", "retention", "production", "payroll", "appointments"], details: ["profit", "payments", "services"] });
    localStorage.setItem(homeLayoutKey("a"), "broken");
    expect(readHomeCardLayout("a")).toEqual(normalizeHomeCardLayout(null));
  });
  it("does not persist pending edits until the explicit save, and isolates admins", () => {
    const pending = moveHomeCard(readHomeCardLayout("a"), "profit", "details");
    expect(readHomeCardLayout("a").main[0]).toBe("profit");
    expect(saveHomeCardLayout("a", pending)).toBe(true);
    expect(readHomeCardLayout("a")).toEqual(pending);
    expect(readHomeCardLayout("b").main[0]).toBe("profit");
  });
  it("reports storage failures rather than claiming a save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(saveHomeCardLayout("a", normalizeHomeCardLayout(null))).toBe(false);
  });
});