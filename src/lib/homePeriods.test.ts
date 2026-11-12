import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { homeRange, moveHomeDate, normalizeOperatingDay, operatingDayCount, operatingDayNumber, parseHomeDate, periodGoalCents, prRangeTimestamps, prToday, prorateWeeklyCents } from "./homePeriods";

const date = (value: string) => {
  const result = parseHomeDate(value);
  if (!result) throw new Error(`Invalid fixture: ${value}`);
  return result;
};
const key = (value: Date) => format(value, "yyyy-MM-dd");

describe("Home approved period rules", () => {
  it.each([["2026-10-31", 1], ["2026-11-03", 2], ["2026-11-04", 3], ["2026-11-05", 4], ["2026-11-06", 5]] as const)("numbers operating day %s as %s", (value, number) => {
    expect(operatingDayNumber(date(value))).toBe(number);
  });
  it.each(["2026-11-01", "2026-11-02"])("excludes closed day %s", value => expect(operatingDayNumber(date(value))).toBeNull());
  it("daily arrows skip Sunday and Monday", () => {
    expect(key(moveHomeDate(date("2026-10-31"), "day", 1))).toBe("2026-11-03");
    expect(key(moveHomeDate(date("2026-11-03"), "day", -1))).toBe("2026-10-31");
    expect(key(normalizeOperatingDay(date("2026-11-02")))).toBe("2026-10-31");
  });
  it("weekly range remains Saturday through Friday", () => {
    const range = homeRange(date("2026-11-06"), "week");
    expect([key(range.start), key(range.end)]).toEqual(["2026-10-31", "2026-11-06"]);
  });
  it("daily comparison is 364 days earlier and same operating day", () => {
    const range = homeRange(date("2026-11-06"), "day");
    expect(key(range.comparisonStart)).toBe("2025-11-07");
    expect(operatingDayNumber(range.comparisonStart)).toBe(5);
  });
  it("weekly comparison is 364 days earlier", () => {
    const range = homeRange(date("2026-11-06"), "week");
    expect([key(range.comparisonStart), key(range.comparisonEnd)]).toEqual(["2025-11-01", "2025-11-07"]);
  });
  it("monthly comparison uses the same month last year including leap years", () => {
    const range = homeRange(date("2024-02-17"), "month");
    expect([key(range.start), key(range.end), key(range.comparisonStart), key(range.comparisonEnd)]).toEqual(["2024-02-01", "2024-02-29", "2023-02-01", "2023-02-28"]);
  });
  it("weekly and monthly arrows follow their own period", () => {
    expect(key(moveHomeDate(date("2026-10-31"), "week", 1))).toBe("2026-11-07");
    expect(key(moveHomeDate(date("2026-12-01"), "month", 1))).toBe("2027-01-01");
  });
  it("daily fixed W-2 is one fifth of $570", () => expect(prorateWeeklyCents(57000, date("2026-11-06"), date("2026-11-06"))).toBe(11400));
  it("weekly fixed W-2 stays $570", () => expect(prorateWeeklyCents(57000, date("2026-10-31"), date("2026-11-06"))).toBe(57000));
  it("monthly W-2 uses only operating days", () => {
    expect(operatingDayCount(date("2026-11-01"), date("2026-11-30"))).toBe(20);
    expect(prorateWeeklyCents(57000, date("2026-11-01"), date("2026-11-30"))).toBe(228000);
  });
  it("allocates existing weekly goals rather than using a full weekly target daily", () => {
    expect(periodGoalCents([{ week_start: "2026-10-31", target_cents: 100000 }], date("2026-11-06"), date("2026-11-06"))).toBe(20000);
    expect(periodGoalCents([{ week_start: "2026-10-31", target_cents: 100000 }], date("2026-10-31"), date("2026-11-06"))).toBe(100000);
  });
  it("does not display a partially configured monthly goal", () => expect(periodGoalCents([{ week_start: "2026-10-31", target_cents: 100000 }], date("2026-11-01"), date("2026-11-30"))).toBeNull());
  it("uses Puerto Rico day boundaries with explicit offset", () => {
    expect(prRangeTimestamps(date("2026-11-06"), date("2026-11-06"))).toEqual({ start: "2026-11-06T00:00:00.000-04:00", end: "2026-11-06T23:59:59.999-04:00" });
    expect(key(prToday(new Date("2026-11-07T02:30:00Z")))).toBe("2026-11-06");
  });
  it("rejects invalid URL dates", () => {
    expect(parseHomeDate("2026-02-30")).toBeNull();
    expect(parseHomeDate("oops")).toBeNull();
  });
});