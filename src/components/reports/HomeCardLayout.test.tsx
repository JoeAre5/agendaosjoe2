import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeCardLayout } from "./HomeCardLayout";
import { homeLayoutKey, normalizeHomeCardLayout, readHomeCardLayout, saveHomeCardLayout, type HomeCardId } from "@/lib/homeCardLayout";

const cards = Object.fromEntries(["profit", "expenses", "retention", "production", "payroll", "appointments", "payments", "ranking", "services"].map(id => [id, <div key={id}>{id}</div>])) as Record<HomeCardId, React.ReactNode>;
const openEditor = () => fireEvent.click(screen.getByRole("button", { name: "Edit order: Profit & Loss" }));
describe("Home editing session", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it("moves to details immediately but writes only when Done is pressed", () => {
    render(<HomeCardLayout cards={cards} userId="a" es={false} />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Move to Operational details: Profit & Loss" }));
    expect(readHomeCardLayout("a").main[0]).toBe("profit");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(readHomeCardLayout("a").details.at(-1)).toBe("profit");
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
  it("abandoning edit mode does not save the pending layout", () => {
    const { unmount } = render(<HomeCardLayout cards={cards} userId="a" es={false} />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Move to Operational details: Profit & Loss" }));
    unmount();
    expect(localStorage.getItem(homeLayoutKey("a"))).toBeNull();
  });
  it("returns a detail card to Home during editing", () => {
    render(<HomeCardLayout cards={cards} userId="a" es={false} />);
    openEditor();
    fireEvent.click(screen.getByRole("button", { name: "Operational details" }));
    fireEvent.click(screen.getByRole("button", { name: "Return to Home: Barber ranking" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(readHomeCardLayout("a").main.at(-1)).toBe("ranking");
  });
  it("keeps edit mode open if saving fails", () => {
    render(<HomeCardLayout cards={cards} userId="a" es={false} />);
    openEditor();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Done" })).toBeDefined();
    expect(screen.getByRole("alert")).toBeDefined();
  });
  it("reset restores both default sections only after Done saves", () => {
    saveHomeCardLayout("a", { main: ["ranking"], details: ["profit", "expenses", "retention", "production", "payroll", "appointments", "payments", "services"] });
    render(<HomeCardLayout cards={cards} userId="a" es={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit order: Barber ranking" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(readHomeCardLayout("a").main).toEqual(["ranking"]);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(readHomeCardLayout("a")).toEqual(normalizeHomeCardLayout(null));
  });
  it("abandoning a reset preserves the previously saved layout", () => {
    saveHomeCardLayout("a", { main: ["ranking"], details: [] });
    const saved = readHomeCardLayout("a");
    const { unmount } = render(<HomeCardLayout cards={cards} userId="a" es={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit order: Barber ranking" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    unmount();
    expect(readHomeCardLayout("a")).toEqual(saved);
  });
});