import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), result: { data: [] as unknown[] | null, error: null as Error | null } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));
import { checkAppointmentConflicts } from "./conflictCheck";
beforeEach(() => {
  mock.result = { data: [], error: null };
  const query: Record<string, unknown> = {};
  for (const key of ["select", "eq", "lt", "gt", "neq"]) query[key] = vi.fn(() => query);
  query.then = (resolve: (value: typeof mock.result) => unknown) => Promise.resolve(resolve(mock.result));
  mock.from.mockReturnValue(query);
});
describe("staff conflict read", () => {
  it("does not treat a failed lookup as an empty slot", async () => {
    mock.result.error = new Error("lookup unavailable");
    await expect(checkAppointmentConflicts("barber", "2026-11-07T10:00:00-04:00", "2026-11-07T11:15:00-04:00")).rejects.toThrow("lookup unavailable");
  });
  it("retains overlapping appointment IDs for explicit confirmation", async () => {
    mock.result.data = [{ id: "a" }, { id: "b" }];
    expect(await checkAppointmentConflicts("barber", "2026-11-07T10:00:00-04:00", "2026-11-07T11:15:00-04:00")).toEqual([{ id: "a" }, { id: "b" }]);
  });
});