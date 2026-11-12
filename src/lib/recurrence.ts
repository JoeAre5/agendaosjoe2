/**
 * Recurrence engine for appointments.
 * Generates a list of Date objects from a base date + a recurrence pattern,
 * Apple-Calendar style.
 */
import {
  addDays,
  addMonths,
  getDay,
  getDate,
  getMonth,
  getYear,
  setDate,
  startOfDay,
} from "date-fns";

export type RecurrencePatternId =
  | "every_week"        // every X-day-of-week (X = baseDate's weekday)
  | "every_2_weeks"     // every other X-day-of-week
  | "every_3_weeks"     // every third X-day-of-week
  | "every_4_weeks"     // every fourth X-day-of-week
  | "monthly_day"       // the Nth of every month (N = baseDate.getDate())
  | "monthly_weekday"   // the Nth (1st/2nd/3rd/4th/last) X-day of every month
  | "daily";            // every day

export interface RecurrencePattern {
  id: RecurrencePatternId;
  count: number; // total occurrences including the first one (1-52)
  /** Admin override: force-create occurrences even when the slot shows as occupied. */
  overrideConflicts?: boolean;
}

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ORDINAL_ES = ["primer", "segundo", "tercer", "cuarto", "último"];
const ORDINAL_EN = ["1st", "2nd", "3rd", "4th", "last"];

/** Returns the 1-indexed ordinal of the weekday occurrence within its month (1..5). */
export function weekdayOrdinalInMonth(d: Date): number {
  return Math.ceil(getDate(d) / 7);
}

/** Generate an array of Date objects starting from baseDate following pattern. */
export function generateRecurrenceDates(baseDate: Date, pattern: RecurrencePattern): Date[] {
  const count = Math.max(1, Math.min(52, pattern.count));
  const out: Date[] = [];
  const base = new Date(baseDate);

  switch (pattern.id) {
    case "every_week":
      for (let i = 0; i < count; i++) out.push(addDays(base, i * 7));
      break;
    case "every_2_weeks":
      for (let i = 0; i < count; i++) out.push(addDays(base, i * 14));
      break;
    case "every_3_weeks":
      for (let i = 0; i < count; i++) out.push(addDays(base, i * 21));
      break;
    case "every_4_weeks":
      for (let i = 0; i < count; i++) out.push(addDays(base, i * 28));
      break;
    case "daily":
      for (let i = 0; i < count; i++) out.push(addDays(base, i));
      break;
    case "monthly_day": {
      // Same numeric day every month. If month is shorter, clamp to last day.
      const dayNum = getDate(base);
      for (let i = 0; i < count; i++) {
        const target = addMonths(base, i);
        const lastOfMonth = new Date(getYear(target), getMonth(target) + 1, 0).getDate();
        out.push(setDate(target, Math.min(dayNum, lastOfMonth)));
      }
      break;
    }
    case "monthly_weekday": {
      const weekday = getDay(base);
      const ordinal = weekdayOrdinalInMonth(base); // 1..5
      for (let i = 0; i < count; i++) {
        const monthRef = addMonths(base, i);
        const firstOfMonth = new Date(getYear(monthRef), getMonth(monthRef), 1);
        // shift to first occurrence of weekday in this month
        const offset = (weekday - getDay(firstOfMonth) + 7) % 7;
        let target = addDays(firstOfMonth, offset + (ordinal - 1) * 7);
        // if target moves into next month (5th occurrence doesn't exist), fall back to last occurrence
        if (getMonth(target) !== getMonth(monthRef)) {
          target = addDays(target, -7);
        }
        // preserve original time-of-day
        target.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), 0);
        out.push(target);
      }
      break;
    }
  }
  return out;
}

/** Human-readable label for a pattern in current language. */
export function describePattern(baseDate: Date, id: RecurrencePatternId, language: "es" | "en"): string {
  const isEs = language === "es";
  const weekdayName = (isEs ? WEEKDAYS_ES : WEEKDAYS_EN)[getDay(baseDate)];
  const dayNum = getDate(baseDate);
  const ord = weekdayOrdinalInMonth(baseDate);
  const ordLabel = (isEs ? ORDINAL_ES : ORDINAL_EN)[Math.min(ord - 1, 4)];

  switch (id) {
    case "every_week":
      return isEs ? `Todos los ${weekdayName}` : `Every ${weekdayName}`;
    case "every_2_weeks":
      return isEs ? `Cada otro ${weekdayName}` : `Every other ${weekdayName}`;
    case "every_3_weeks":
      return isEs ? `Cada tercer ${weekdayName}` : `Every third ${weekdayName}`;
    case "every_4_weeks":
      return isEs ? `Cada cuarto ${weekdayName}` : `Every fourth ${weekdayName}`;
    case "monthly_day":
      return isEs ? `El día ${dayNum} de cada mes` : `The ${dayNum}${ordSuffix(dayNum)} of every month`;
    case "monthly_weekday":
      return isEs
        ? `El ${ordLabel} ${weekdayName} de cada mes`
        : `The ${ordLabel} ${weekdayName} of every month`;
    case "daily":
      return isEs ? "Todos los días" : "Daily";
  }
}

function ordSuffix(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
