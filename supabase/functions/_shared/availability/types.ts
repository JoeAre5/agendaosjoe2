// Native scheduling engine — input/output types. Pure data, no I/O.
//
// Every timestamp is an ISO 8601 string (UTC or with an offset). Dates
// (`from`, `to`, `DayAvailability.date`) are local calendar days in the shop
// timezone, written YYYY-MM-DD. Weekly hours use 0 = Sunday … 6 = Saturday,
// the same convention as `shop_hours` / `working_hours`.

/** One weekly opening interval (a barber or the shop). "HH:mm" or "HH:mm:ss". */
export interface WeeklyInterval {
  dayOfWeek: number;
  start: string;
  end: string;
  isActive?: boolean;
}

/** Half-open absolute interval [start, end). */
export interface Interval {
  start: string;
  end: string;
}

export interface Block extends Interval {
  isAllDay?: boolean;
}

export interface BarberInput {
  id: string;
  workingHours: WeeklyInterval[];
  /** Active appointments (scheduled / completed), never cancelled or no_show. */
  appointments: Interval[];
  blocks: Block[];
  /** Pending native booking drafts that still hold their slot. */
  holds?: Interval[];
}

export interface BookingRules {
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  slotIntervalMinutes: number;
  paddingBeforeMinutes: number;
  paddingAfterMinutes: number;
  maxPerDay: number | null;
}

export interface ServiceInput {
  durationMinutes: number;
  paddingBeforeMinutes?: number;
  paddingAfterMinutes?: number;
}

export interface AvailabilityInput {
  /** IANA zone, e.g. America/Puerto_Rico. */
  timezone: string;
  /** Reference "now" (ISO). Passed explicitly so results are reproducible. */
  now: string;
  /** First local day, inclusive (YYYY-MM-DD). */
  from: string;
  /** Last local day, inclusive (YYYY-MM-DD). */
  to: string;
  service: ServiceInput;
  addons?: { durationMinutes: number }[];
  rules: BookingRules;
  /**
   * Shop-level opening hours. An empty list means "not configured": barbers'
   * working hours apply alone. A non-empty list closes every day it does not
   * mention.
   */
  shopHours: WeeklyInterval[];
  barbers: BarberInput[];
}

export interface Slot {
  /** ISO with the shop offset, e.g. 2026-09-08T09:00:00-04:00. */
  startsAt: string;
  endsAt: string;
  barberId: string;
}

export interface DayAvailability {
  date: string;
  slots: Slot[];
}

export interface AvailabilityResult {
  timezone: string;
  /** Service + add-ons, minutes. */
  durationMinutes: number;
  /** Only days with at least one slot, ascending. */
  days: DayAvailability[];
}

export type SlotRejection =
  | "barber_unknown"
  | "invalid_time"
  | "too_soon"
  | "too_far"
  | "outside_hours"
  | "blocked"
  | "overlap"
  | "max_per_day";

export type SlotCheck =
  | { ok: true; startsAt: string; endsAt: string }
  | { ok: false; reason: SlotRejection };

export interface SlotCheckOptions {
  /** Staff bookings: skip min/max advance (Acuity's `admin=true`). */
  ignoreAdvanceRules?: boolean;
  /** Staff bookings: allow a time outside the working / shop hours. */
  ignoreHours?: boolean;
}
