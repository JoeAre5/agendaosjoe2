/**
 * Shop timezone utilities (Phase 1B.TIMEZONE).
 *
 * Single source of truth: `shop_settings.timezone` (IANA string).
 * Storage stays UTC (timestamptz). Every display surface and every
 * form-input interpretation MUST go through these helpers.
 *
 * Frontend caching: in-memory, 5-minute TTL. Call `invalidateShopTimezoneCache`
 * after Settings updates the timezone column.
 *
 * Implementation: date-fns + date-fns-tz (IANA + DST safe; battle-tested).
 * Do NOT use `Date.toLocaleString` with timezone option — buggy on Safari iOS.
 */
import { format as fmt, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { supabase } from "@/integrations/supabase/client";

let cachedTz: string | null = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;
const FALLBACK = "America/Puerto_Rico";

/**
 * Resolve the shop's IANA timezone, with 5-minute in-memory cache.
 * Falls back to America/Puerto_Rico on any error.
 */
export async function getShopTimezone(): Promise<string> {
  const now = Date.now();
  if (cachedTz && now - cachedAt < TTL_MS) return cachedTz;

  try {
    const { data, error } = await supabase
      .from("shop_settings")
      .select("timezone")
      .single();

    if (error || !data?.timezone) {
      console.warn("[timezone] shop_settings fetch failed, using fallback", error);
      return FALLBACK;
    }

    cachedTz = data.timezone;
    cachedAt = now;
    return cachedTz;
  } catch (e) {
    console.error("[timezone] shop_settings fetch exception", e);
    return FALLBACK;
  }
}

/** Drop the in-memory cache (call after Settings changes the timezone). */
export function invalidateShopTimezoneCache(): void {
  cachedTz = null;
  cachedAt = 0;
}

// Default display format example: "sábado, 20 abril 2026 - 10:30 AM"
// date-fns tokens (NOT Luxon): EEEE=full weekday, d=day, MMMM=full month, yyyy=4-digit year, h=12h hour, mm=minutes, a=AM/PM
const DEFAULT_FMT = "EEEE, d MMMM yyyy - h:mm a";

function toDate(timestamp: string | Date): Date {
  return typeof timestamp === "string" ? parseISO(timestamp) : timestamp;
}

/**
 * Format a UTC timestamp for display in the shop's timezone, es-PR locale.
 */
export async function formatInShopTz(
  timestamp: string | Date | null | undefined,
  format = DEFAULT_FMT,
): Promise<string> {
  if (!timestamp) return "";
  const tz = await getShopTimezone();
  try {
    return formatInTimeZone(toDate(timestamp), tz, format, { locale: es });
  } catch {
    return "";
  }
}

/**
 * Synchronous variant — only use when the timezone is already known
 * (e.g. inside a component that has already awaited getShopTimezone()).
 */
export function formatInTz(
  timestamp: string | Date | null | undefined,
  tz: string,
  format = DEFAULT_FMT,
): string {
  if (!timestamp) return "";
  try {
    return formatInTimeZone(toDate(timestamp), tz, format, { locale: es });
  } catch {
    return "";
  }
}

/**
 * Interpret a "naive" local datetime string (e.g. "2026-05-01T17:00")
 * as being IN the shop timezone, then convert to UTC ISO for storage.
 */
export async function parseFromShopTz(localString: string): Promise<string> {
  const tz = await getShopTimezone();
  return parseFromTz(localString, tz);
}

/** Sync variant when timezone is already known. */
export function parseFromTz(localString: string, tz: string): string {
  const utc = fromZonedTime(localString, tz);
  if (Number.isNaN(utc.getTime())) {
    throw new Error(`[timezone] invalid input "${localString}"`);
  }
  return utc.toISOString();
}

/** Current moment as a JS Date already shifted to wall-clock in the shop timezone. */
export async function getShopNow(): Promise<Date> {
  const tz = await getShopTimezone();
  return toZonedTime(new Date(), tz);
}

/**
 * Next round time slot in the shop timezone, rounded UP to the nearest
 * `intervalMinutes`. Returns a JS Date with wall-clock components in shop tz.
 *
 * Example: 10:07 AM with 15-min interval → 10:15 AM.
 */
export async function getShopNextSlot(intervalMinutes = 15): Promise<Date> {
  const now = await getShopNow();
  const m = now.getMinutes();
  const rounded = Math.ceil((m + 1) / intervalMinutes) * intervalMinutes;
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(0);
  next.setMinutes(rounded);
  return next;
}

/**
 * Build an Acuity-compatible ISO string (with the shop's UTC offset)
 * from wall-clock components interpreted IN shop timezone.
 *
 * Acuity expects datetimes like "2026-04-21T17:00:00-04:00".
 */
export async function toAcuityDatetime(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
): Promise<string> {
  const tz = await getShopTimezone();
  return toAcuityDatetimeInTz(year, month, day, hour, minute, tz);
}

/** Sync variant of toAcuityDatetime when timezone is already known. */
export function toAcuityDatetimeInTz(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): string {
  const wallClock = `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  const utc = fromZonedTime(wallClock, tz);
  if (Number.isNaN(utc.getTime())) {
    throw new Error(`[timezone] invalid wall-clock components`);
  }
  // Acuity format: "yyyy-MM-dd'T'HH:mm:ssXXX" in the shop tz
  return formatInTimeZone(utc, tz, "yyyy-MM-dd'T'HH:mm:ssxxx");
}

/**
 * Convenience: take a JS Date whose local getters represent SHOP-LOCAL wall-clock
 * time, and produce the Acuity-compatible ISO string in the shop timezone.
 */
export async function dateComponentsToAcuityDatetime(
  d: Date,
  hourOverride?: number,
  minuteOverride?: number,
): Promise<string> {
  return toAcuityDatetime(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    hourOverride ?? d.getHours(),
    minuteOverride ?? d.getMinutes(),
  );
}
