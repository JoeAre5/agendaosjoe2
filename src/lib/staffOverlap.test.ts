import { describe, expect, it, vi, beforeEach } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { authorizeStaffOverlap, canConfirmStaffOverlap, confirmStaffOverlap } from "./staffOverlap";
import { calendarOverlapGroups } from "./calendarOverlapGroups";

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ error: null }); });
describe("explicit staff overlap", () => {
  it("permits administrators to confirm", () => expect(canConfirmStaffOverlap(true, false)).toBe(true));
  it("permits barbers to confirm", () => expect(canConfirmStaffOverlap(false, true)).toBe(true));
  it("does not permit clients to confirm", async () => {
    const confirm = vi.fn(() => true);
    expect(await confirmStaffOverlap(false, confirm, 100, "test")).toBe(false);
    expect(confirm).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });
  it("does not authorize when staff cancels", async () => {
    expect(await confirmStaffOverlap(true, () => false, 100, "test")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("authorizes the selected appointment before continuation", async () => {
    expect(await confirmStaffOverlap(true, () => true, 100, "Staff confirmed edit")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("staff_preauthorize_overlap", { _acuity_id: 100, _reason: "Staff confirmed edit" });
  });
  it("stops continuation if the backend rejects authorization", async () => {
    rpc.mockResolvedValue({ error: new Error("denied") });
    const write = vi.fn();
    await expect(confirmStaffOverlap(true, () => true, 100, "test").then(ok => { if (ok) write(); })).rejects.toThrow("denied");
    expect(write).not.toHaveBeenCalled();
  });
  it("supports a local-only synthetic appointment ID", async () => {
    await authorizeStaffOverlap(-100, "local");
    expect(rpc).toHaveBeenCalledWith("staff_preauthorize_overlap", { _acuity_id: -100, _reason: "local" });
  });
});
const appt = (id: string, start: string, end: string) => ({ id, starts_at: `2026-11-07T${start}:00-04:00`, ends_at: `2026-11-07T${end}:00-04:00` });
describe("shared calendar slots", () => {
  it("retains both appointments at 10 AM", () => {
    expect(calendarOverlapGroups([appt("a", "10:00", "11:00"), appt("b", "10:00", "10:30")]).map(g => g.map(a => a.id))).toEqual([["a", "b"]]);
  });
  it("keeps adjacent appointments separate", () => {
    expect(calendarOverlapGroups([appt("a", "10:00", "10:30"), appt("b", "10:30", "11:00")])).toHaveLength(2);
  });
  it("does not hide a third overlapping appointment", () => {
    expect(calendarOverlapGroups([appt("a", "10:00", "11:00"), appt("b", "10:15", "10:45"), appt("c", "10:30", "11:30")])[0].map(a => a.id)).toEqual(["a", "b", "c"]);
  });
});