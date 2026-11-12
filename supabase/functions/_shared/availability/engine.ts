// SHOP_SCOPED_OK: pure computation, no database access.
//
// Native scheduling engine (Phase B2). Turns opening hours, working hours,
// blocks, active appointments, slot holds and booking rules into bookable
// slots, and validates a single requested time with the same predicates.
//
// Rules, in the order they are applied to a candidate start `s`:
//   1. the local day is today or later, and at most `maxAdvanceDays` ahead
//   2. s >= now + minAdvanceMinutes
//   3. [s, s + duration) lies inside one window, where a window is the
//      intersection of the shop hours and the barber's working hours for that
//      weekday (split shifts allowed; an empty shop-hours list means the
//      working hours apply alone)
//   4. [s - paddingBefore, s + duration + paddingAfter) touches no block, no
//      active appointment and no slot hold of that barber (half-open ranges,
//      so back-to-back is fine). Padding = max(service padding, rule padding).
//   5. the barber has fewer than `maxPerDay` appointments starting that day
//
// Candidates start at each window start and advance by slotIntervalMinutes.
// `checkSlot` accepts any minute (staff can book off-grid) but applies the
// same rules unless told to ignore them.
//
// Everything is computed in epoch milliseconds; Luxon only converts local
// wall-clock to instants and back, so DST days work without special cases.

// @ts-types="npm:@types/luxon@3.4.2"
import { DateTime } from "npm:luxon@3.5.0";
import type {
  AvailabilityInput,
  AvailabilityResult,
  BarberInput,
  Block,
  BookingRules,
  DayAvailability,
  Interval,
  Slot,
  SlotCheck,
  SlotCheckOptions,
  WeeklyInterval,
} from "./types.ts";

export const DEFAULT_RULES: BookingRules = {
  minAdvanceMinutes: 60,
  maxAdvanceDays: 90,
  slotIntervalMinutes: 15,
  paddingBeforeMinutes: 0,
  paddingAfterMinutes: 0,
  maxPerDay: null,
};

/** Longest from..to span one call may ask for (inclusive days). */
export const MAX_RANGE_DAYS = 62;

const MIN_MS = 60_000;

/** Half-open absolute range in epoch ms. */
interface Range {
  s: number;
  e: number;
}

export class AvailabilityInputError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "AvailabilityInputError";
    this.code = code;
  }
}

// ─── parsing helpers ────────────────────────────────────────────────────────

function parseClock(value: string): { hour: number; minute: number; second: number } | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

function parseInstant(iso: string): number {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : NaN;
}

function localDay(date: string, zone: string): DateTime {
  const d = DateTime.fromISO(date, { zone });
  if (!d.isValid || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AvailabilityInputError("invalid_date", `invalid local date "${date}"`);
  }
  return d.startOf("day");
}

/** Luxon weekday is 1 = Monday … 7 = Sunday; tables use 0 = Sunday. */
function dayOfWeek(day: DateTime): number {
  return day.weekday % 7;
}

// ─── range algebra ──────────────────────────────────────────────────────────

function normalize(ranges: Range[]): Range[] {
  const sorted = ranges.filter((r) => r.e > r.s).sort((a, b) => a.s - b.s);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.s <= last.e) last.e = Math.max(last.e, r.e);
    else out.push({ ...r });
  }
  return out;
}

function intersect(a: Range[], b: Range[]): Range[] {
  const out: Range[] = [];
  for (const x of a) {
    for (const y of b) {
      const s = Math.max(x.s, y.s);
      const e = Math.min(x.e, y.e);
      if (e > s) out.push({ s, e });
    }
  }
  return normalize(out);
}

function overlapsAny(r: Range, list: Range[]): boolean {
  for (const x of list) if (x.s < r.e && x.e > r.s) return true;
  return false;
}

function containedIn(r: Range, list: Range[]): boolean {
  for (const x of list) if (x.s <= r.s && r.e <= x.e) return true;
  return false;
}

/** Weekly rows for one local day, as absolute ranges. */
function weeklyRanges(rows: WeeklyInterval[], day: DateTime): Range[] {
  const dow = dayOfWeek(day);
  const out: Range[] = [];
  for (const row of rows) {
    if (row.isActive === false || Number(row.dayOfWeek) !== dow) continue;
    const start = parseClock(row.start);
    const end = parseClock(row.end);
    if (!start || !end) continue;
    const s = day.set(start).toMillis();
    const e = day.set(end).toMillis();
    if (e > s) out.push({ s, e });
  }
  return normalize(out);
}

function absoluteRanges(items: Interval[] | undefined, within: Range): Range[] {
  const out: Range[] = [];
  for (const it of items ?? []) {
    const s = parseInstant(it.start);
    const e = parseInstant(it.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    if (s < within.e && e > within.s) out.push({ s, e });
  }
  return out;
}

function blockRanges(blocks: Block[] | undefined, dayRange: Range): Range[] {
  const timed: Interval[] = [];
  const out: Range[] = [];
  for (const b of blocks ?? []) {
    if (b.isAllDay) {
      // An all-day block covers every local day it touches.
      const s = parseInstant(b.start);
      const e = parseInstant(b.end);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      if (s < dayRange.e && e > dayRange.s) out.push({ ...dayRange });
    } else {
      timed.push(b);
    }
  }
  return out.concat(absoluteRanges(timed, dayRange));
}

// ─── shared context ─────────────────────────────────────────────────────────

interface Ctx {
  zone: string;
  now: DateTime;
  earliestMs: number;
  today: DateTime;
  lastDay: DateTime;
  durationMs: number;
  padBeforeMs: number;
  padAfterMs: number;
  rules: BookingRules;
}

export function totalDurationMinutes(input: Pick<AvailabilityInput, "service" | "addons">): number {
  const base = Number(input.service?.durationMinutes) || 0;
  const extra = (input.addons ?? []).reduce((sum, a) => sum + (Number(a.durationMinutes) || 0), 0);
  return base + extra;
}

function buildCtx(input: AvailabilityInput): Ctx {
  const zone = input.timezone;
  const probe = DateTime.now().setZone(zone);
  if (!probe.isValid) throw new AvailabilityInputError("invalid_timezone", `unknown timezone "${zone}"`);

  const now = DateTime.fromISO(input.now, { zone });
  if (!now.isValid) throw new AvailabilityInputError("invalid_now", `invalid now "${input.now}"`);

  const rules: BookingRules = { ...DEFAULT_RULES, ...(input.rules ?? {}) };
  if (!(rules.slotIntervalMinutes > 0)) throw new AvailabilityInputError("invalid_rules", "slotIntervalMinutes must be > 0");

  const duration = totalDurationMinutes(input);
  if (!(duration > 0)) throw new AvailabilityInputError("invalid_duration", "service duration must be > 0");

  const padBefore = Math.max(Number(input.service.paddingBeforeMinutes) || 0, rules.paddingBeforeMinutes || 0);
  const padAfter = Math.max(Number(input.service.paddingAfterMinutes) || 0, rules.paddingAfterMinutes || 0);

  const today = now.startOf("day");
  return {
    zone,
    now,
    earliestMs: now.toMillis() + (rules.minAdvanceMinutes || 0) * MIN_MS,
    today,
    lastDay: today.plus({ days: rules.maxAdvanceDays || 0 }),
    durationMs: duration * MIN_MS,
    padBeforeMs: padBefore * MIN_MS,
    padAfterMs: padAfter * MIN_MS,
    rules,
  };
}

interface BarberDay {
  /** Bookable windows of the day (shop hours ∩ working hours). */
  windows: Range[];
  /** Blocks of the day, kept apart so a rejection can say "blocked". */
  blocks: Range[];
  /** Appointments and holds around the day. */
  booked: Range[];
  appointmentsToday: number;
}

function barberDay(ctx: Ctx, input: AvailabilityInput, barber: BarberInput, day: DateTime): BarberDay {
  const dayRange: Range = { s: day.toMillis(), e: day.plus({ days: 1 }).startOf("day").toMillis() };
  const shop = input.shopHours.length > 0 ? weeklyRanges(input.shopHours, day) : [dayRange];
  const work = weeklyRanges(barber.workingHours, day);
  const windows = intersect(shop, work);

  // Padding may reach into the neighbouring day, so look slightly outside it.
  const around: Range = { s: dayRange.s - ctx.padBeforeMs, e: dayRange.e + ctx.padAfterMs };
  const blocks = normalize(blockRanges(barber.blocks, dayRange));
  const booked = normalize([
    ...absoluteRanges(barber.appointments, around),
    ...absoluteRanges(barber.holds, around),
  ]);

  let appointmentsToday = 0;
  for (const a of barber.appointments ?? []) {
    const s = parseInstant(a.start);
    if (Number.isFinite(s) && s >= dayRange.s && s < dayRange.e) appointmentsToday++;
  }
  return { windows, blocks, booked, appointmentsToday };
}

function fits(ctx: Ctx, bd: BarberDay, startMs: number, opts?: SlotCheckOptions, day?: DateTime): SlotCheck {
  const endMs = startMs + ctx.durationMs;
  const startDay = day ?? DateTime.fromMillis(startMs, { zone: ctx.zone }).startOf("day");

  if (!opts?.ignoreAdvanceRules) {
    if (startDay < ctx.today || startMs < ctx.earliestMs) return { ok: false, reason: "too_soon" };
    if (startDay > ctx.lastDay) return { ok: false, reason: "too_far" };
  }
  if (!opts?.ignoreHours && !containedIn({ s: startMs, e: endMs }, bd.windows)) {
    return { ok: false, reason: "outside_hours" };
  }
  const padded: Range = { s: startMs - ctx.padBeforeMs, e: endMs + ctx.padAfterMs };
  if (overlapsAny(padded, bd.blocks)) return { ok: false, reason: "blocked" };
  if (!opts?.ignoreOverlap && overlapsAny(padded, bd.booked)) return { ok: false, reason: "overlap" };
  if (ctx.rules.maxPerDay != null && bd.appointmentsToday >= ctx.rules.maxPerDay) {
    return { ok: false, reason: "max_per_day" };
  }
  return {
    ok: true,
    startsAt: formatInstant(startMs, ctx.zone),
    endsAt: formatInstant(endMs, ctx.zone),
  };
}

export function formatInstant(ms: number, zone: string): string {
  return DateTime.fromMillis(ms, { zone }).toISO({ suppressMilliseconds: true }) as string;
}

// ─── public API ─────────────────────────────────────────────────────────────

export interface ComputeOptions {
  /** Stop at the first slot of each day (date listings only need "any slot"). */
  firstSlotOnly?: boolean;
}

/**
 * Bookable slots per local day for every barber in the input. Days without
 * slots are omitted. Throws AvailabilityInputError on invalid input.
 */
export function computeAvailability(input: AvailabilityInput, options?: ComputeOptions): AvailabilityResult {
  const ctx = buildCtx(input);
  const from = localDay(input.from, ctx.zone);
  const to = localDay(input.to, ctx.zone);
  if (to < from) throw new AvailabilityInputError("invalid_range", "`to` is before `from`");
  const span = Math.round(to.diff(from, "days").days) + 1;
  if (span > MAX_RANGE_DAYS) {
    throw new AvailabilityInputError("range_too_large", `at most ${MAX_RANGE_DAYS} days per request`);
  }

  const stepMs = ctx.rules.slotIntervalMinutes * MIN_MS;
  const days: DayAvailability[] = [];

  for (let day = from; day <= to; day = day.plus({ days: 1 })) {
    if (day < ctx.today || day > ctx.lastDay) continue;
    const slots: Slot[] = [];

    barbers: for (const barber of input.barbers) {
      const bd = barberDay(ctx, input, barber, day);
      if (bd.windows.length === 0) continue;
      if (ctx.rules.maxPerDay != null && bd.appointmentsToday >= ctx.rules.maxPerDay) continue;

      for (const w of bd.windows) {
        for (let s = w.s; s + ctx.durationMs <= w.e; s += stepMs) {
          const check = fits(ctx, bd, s, undefined, day);
          if (check.ok) {
            slots.push({ startsAt: check.startsAt, endsAt: check.endsAt, barberId: barber.id });
            if (options?.firstSlotOnly) break barbers;
          }
        }
      }
    }

    if (slots.length > 0) {
      slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.barberId.localeCompare(b.barberId));
      days.push({ date: day.toISODate() as string, slots });
    }
  }

  return { timezone: ctx.zone, durationMinutes: ctx.durationMs / MIN_MS, days };
}

/**
 * Validates one requested start for one barber with the same rules the slot
 * list uses. The start need not be on the slot grid. When re-validating a
 * reschedule, leave the appointment being moved out of `appointments`.
 */
export function checkSlot(
  input: AvailabilityInput,
  barberId: string,
  startsAt: string,
  opts?: SlotCheckOptions,
): SlotCheck {
  const ctx = buildCtx(input);
  const barber = input.barbers.find((b) => b.id === barberId);
  if (!barber) return { ok: false, reason: "barber_unknown" };

  const startMs = parseInstant(startsAt);
  if (!Number.isFinite(startMs)) return { ok: false, reason: "invalid_time" };

  const day = DateTime.fromMillis(startMs, { zone: ctx.zone }).startOf("day");
  return fits(ctx, barberDay(ctx, input, barber, day), startMs, opts);
}

/** Local calendar day (YYYY-MM-DD) of an instant in a zone. */
export function localDateOf(iso: string, zone: string): string | null {
  const d = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
  return d.isValid ? (d.toISODate() as string) : null;
}
