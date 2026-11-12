import { describe, expect, it } from "vitest";
import { isBirthdayOn, puertoRicoDate } from "./birthdays";

describe("birthday reminders", () => {
  it("shows on a birthday appointment regardless of birth year", () => {
    expect(isBirthdayOn("1985-11-06", "2026-11-06T16:00:00-04:00")).toBe(true);
  });
  it("does not show on another date", () => {
    expect(isBirthdayOn("1985-11-06", "2026-11-07T16:00:00-04:00")).toBe(false);
  });
  it("uses Puerto Rico dates at the UTC boundary", () => {
    expect(puertoRicoDate("2026-11-07T02:00:00Z")).toBe("2026-11-06");
    expect(isBirthdayOn("1985-11-06", "2026-11-07T02:00:00Z")).toBe(true);
  });
  it("never invents a birthday for an unlinked or unknown client", () => {
    expect(isBirthdayOn(null, "2026-11-06T12:00:00-04:00")).toBe(false);
    expect(isBirthdayOn(undefined, "2026-11-06T12:00:00-04:00")).toBe(false);
  });
  it("shows February 29 only on that calendar date", () => {
    expect(isBirthdayOn("2000-02-29", "2027-02-28T12:00:00-04:00")).toBe(false);
    expect(isBirthdayOn("2000-02-29", "2028-02-29T12:00:00-04:00")).toBe(true);
  });
});