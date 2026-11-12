import { describe, expect, it } from "vitest";
import { canReadClientDuplicateBadges, countClientDuplicateGroups, hamburgerPendingCount } from "./clientDuplicateBadges";

describe("admin duplicate badge rules", () => {
  it("permits the signed-in owner only", () => {
    expect(canReadClientDuplicateBadges("admin-id", "owner")).toBe(true);
    for (const role of ["barber", "client", "manager", "staff", null]) {
      expect(canReadClientDuplicateBadges("user-id", role)).toBe(false);
    }
    expect(canReadClientDuplicateBadges(undefined, "owner")).toBe(false);
  });
  it("counts matching groups rather than the profiles in them", () => {
    const groups = [
      { match_type: "name", client_ids: ["a", "b", "c"], client_count: 3 },
      { match_type: "phone", client_ids: ["a", "b"], client_count: 2 },
    ];
    expect(countClientDuplicateGroups(groups)).toBe(2);
    expect(countClientDuplicateGroups([])).toBe(0);
  });
  it("does not turn an unavailable response into a confirmed zero", () => {
    expect(() => countClientDuplicateGroups(null)).toThrow("unavailable");
  });
  it("adds client groups once to the hamburger without changing payment totals", () => {
    const paymentAndInboxCount = 7;
    expect(hamburgerPendingCount(paymentAndInboxCount, 3)).toBe(10);
    expect(paymentAndInboxCount).toBe(7);
    expect(hamburgerPendingCount(paymentAndInboxCount, null)).toBe(7);
    expect(hamburgerPendingCount(0, 0)).toBe(0);
  });
});