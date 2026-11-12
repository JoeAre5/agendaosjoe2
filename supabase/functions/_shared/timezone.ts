/**
 * Server-side shop timezone utilities (Phase 1B.TIMEZONE).
 *
 * Mirror of src/lib/timezone.ts, designed for Deno edge functions.
 * Per Charlie/CTO decision: per-invocation fetch (no module-level cache),
 * trading ~5ms per call for guaranteed freshness across cold starts.
 *
 * Use service role to read shop_settings.timezone.
 */
// @ts-ignore — npm specifier resolved by Deno
import { DateTime } from "npm:luxon@3.5.0";
// @ts-ignore — npm specifier resolved by Deno
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const FALLBACK = "America/Puerto_Rico";

function getServiceClient() {
  // @ts-ignore — Deno global
  const url = Deno.env.get("SUPABASE_URL");
  // @ts-ignore — Deno global
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("[timezone] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Fetch the shop's IANA timezone via service role.
 * Per-invocation (no cache). Returns FALLBACK on any error.
 */
export async function getShopTimezone(): Promise<string> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("shop_settings")
      .select("timezone")
      .single();

    if (error || !data?.timezone) {
      console.warn("[timezone] shop_settings fetch failed, using fallback", error);
      return FALLBACK;
    }
    return data.timezone as string;
  } catch (e) {
    console.error("[timezone] shop_settings fetch exception", e);
    return FALLBACK;
  }
}

/**
 * Format a UTC timestamp for display in the shop's timezone, es-PR locale.
 * Default: "sábado, 20 abril 2026 - 10:30 AM".
 */
export async function formatInShopTz(
  timestamp: string | Date | null | undefined,
  format = "EEEE, d LLLL yyyy - h:mm a",
): Promise<string> {
  if (!timestamp) return "";
  const tz = await getShopTimezone();
  const dt =
    typeof timestamp === "string"
      ? DateTime.fromISO(timestamp, { zone: "utc" }).setZone(tz)
      : DateTime.fromJSDate(timestamp, { zone: "utc" }).setZone(tz);
  if (!dt.isValid) return "";
  return dt.setLocale("es-PR").toFormat(format);
}

/**
 * Interpret a naive local datetime string as shop timezone, return UTC ISO.
 * Use for form/payload input → DB insert.
 */
export async function parseFromShopTz(localString: string): Promise<string> {
  const tz = await getShopTimezone();
  const dt = DateTime.fromISO(localString, { zone: tz });
  if (!dt.isValid) {
    throw new Error(`[timezone] invalid input "${localString}": ${dt.invalidReason}`);
  }
  return dt.toUTC().toISO()!;
}

/** Current moment as a Luxon DateTime in the shop timezone. */
export async function getShopNow(): Promise<DateTime> {
  const tz = await getShopTimezone();
  return DateTime.now().setZone(tz);
}

/**
 * Build an Acuity-compatible ISO ("2026-04-21T17:00:00-04:00") from
 * wall-clock components interpreted IN the shop timezone.
 * Replaces hardcoded "-0400" string concatenation in edge functions.
 */
export async function toAcuityDatetime(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
): Promise<string> {
  const tz = await getShopTimezone();
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0 },
    { zone: tz },
  );
  if (!dt.isValid) {
    throw new Error(`[timezone] invalid wall-clock components: ${dt.invalidReason}`);
  }
  return dt.toISO({ suppressMilliseconds: true })!;
}

/**
 * Convert a UTC ISO timestamp (as stored in DB) to the equivalent
 * Acuity-compatible ISO with the shop timezone offset. Used by acuity-block-sync
 * to translate stored UTC timestamps into Acuity's expected wall-clock format.
 */
export async function utcIsoToAcuityDatetime(utcIso: string): Promise<string> {
  const tz = await getShopTimezone();
  const dt = DateTime.fromISO(utcIso, { zone: "utc" }).setZone(tz);
  if (!dt.isValid) {
    throw new Error(`[timezone] invalid utc iso "${utcIso}"`);
  }
  return dt.toISO({ suppressMilliseconds: true })!;
}
