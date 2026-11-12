import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isValid, parse, startOfDay, startOfMonth, startOfWeek, subDays, subYears } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

export type HomePeriod = "day" | "week" | "month";
export const OPERATING_DAYS = [6, 2, 3, 4, 5] as const;
export const PR_TIME_ZONE = "America/Puerto_Rico";

/** Calendar dates are wall-clock containers, never browser-local instants. */
export function prToday(now = new Date()): Date {
  return parse(formatInTimeZone(now, PR_TIME_ZONE, "yyyy-MM-dd"), "yyyy-MM-dd", new Date());
}

export function parseHomeDate(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const value = parse(raw, "yyyy-MM-dd", new Date());
  return isValid(value) && format(value, "yyyy-MM-dd") === raw ? value : null;
}

export function operatingDayNumber(date: Date): number | null {
  const index = OPERATING_DAYS.findIndex(day => day === date.getDay());
  return index < 0 ? null : index + 1;
}

export function normalizeOperatingDay(date: Date): Date {
  let value = startOfDay(date);
  while (operatingDayNumber(value) === null) value = subDays(value, 1);
  return value;
}

export function normalizeHomeDate(date: Date, period: HomePeriod): Date {
  if (period === "day") return normalizeOperatingDay(date);
  if (period === "week") return startOfWeek(date, { weekStartsOn: 6 });
  return startOfMonth(date);
}

export function moveHomeDate(date: Date, period: HomePeriod, direction: -1 | 1): Date {
  if (period === "week") return addWeeks(date, direction);
  if (period === "month") return startOfMonth(addMonths(date, direction));
  let value = addDays(date, direction);
  while (operatingDayNumber(value) === null) value = addDays(value, direction);
  return value;
}

export function homeRange(date: Date, period: HomePeriod) {
  const start = normalizeHomeDate(date, period);
  const end = period === "month" ? endOfMonth(start) : period === "week" ? endOfWeek(start, { weekStartsOn: 6 }) : start;
  const comparisonStart = period === "month" ? startOfMonth(subYears(start, 1)) : subDays(start, 364);
  const comparisonEnd = period === "month" ? endOfMonth(comparisonStart) : period === "week" ? addDays(comparisonStart, 6) : comparisonStart;
  return { start, end, comparisonStart, comparisonEnd };
}

export function prRangeTimestamps(start: Date, end: Date) {
  return { start: `${format(start, "yyyy-MM-dd")}T00:00:00.000-04:00`, end: `${format(end, "yyyy-MM-dd")}T23:59:59.999-04:00` };
}

export function operatingDayCount(start: Date, end: Date): number {
  return eachDayOfInterval({ start, end }).filter(date => operatingDayNumber(date) !== null).length;
}

export function prorateWeeklyCents(weeklyCents: number, start: Date, end: Date): number {
  return Math.round(weeklyCents * operatingDayCount(start, end) / 5);
}

/** Existing weekly targets are allocated only to the operating days in this range. */
export function periodGoalCents(goals: { week_start: string; target_cents: number }[], start: Date, end: Date): number | null {
  const targets = new Map(goals.map(goal => [goal.week_start, goal.target_cents]));
  let total = 0;
  let days = 0;
  for (const date of eachDayOfInterval({ start, end })) {
    if (operatingDayNumber(date) === null) continue;
    const target = targets.get(format(startOfWeek(date, { weekStartsOn: 6 }), "yyyy-MM-dd"));
    if (target === undefined) return null;
    total += target / 5;
    days += 1;
  }
  return days ? Math.round(total) : null;
}