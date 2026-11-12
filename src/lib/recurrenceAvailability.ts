/**
 * Recurrence availability checker.
 *
 * For each candidate Date in a recurring series, determines whether the slot
 * is bookable. Uses BOTH:
 *   1) Acuity /availability/times (source of truth today)
 *   2) Local Supabase tables (block_times + appointments) — so we can
 *      progressively rely on our own DB and become Acuity-independent.
 *
 * Returns a per-occurrence result with a reason code so the UI can show
 * a localized message and a red badge.
 */
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export type ConflictReason =
  | "acuity_unavailable"   // Acuity has no slot at that exact time
  | "local_block"          // Overlaps a block_times row
  | "local_appointment"    // Overlaps an existing scheduled appointment
  | "check_failed";        // Network / unknown — soft warning

export interface OccurrenceAvailability {
  date: Date;
  available: boolean;
  reason?: ConflictReason;
}

interface CheckParams {
  dates: Date[];
  appointmentTypeId: number | string;
  calendarId: number | string;
  barberId: string;
  durationMinutes: number;
  /** Scheduling fetcher injected by caller (already auth'd; Acuity or native). */
  acuityProxy: (path: string, method?: string, body?: any) => Promise<any>;
}

/** Format a Date as Acuity's expected YYYY-MM-DD (in local/shop wall-clock time). */
function ymd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** HH:mm in 24h local time. */
function hm(d: Date): string {
  return format(d, "HH:mm");
}

/**
 * Run availability checks for every date in parallel (capped concurrency).
 * Order of returned array matches input order.
 */
export async function checkRecurrenceAvailability(
  params: CheckParams,
): Promise<OccurrenceAvailability[]> {
  const { dates, appointmentTypeId, calendarId, barberId, durationMinutes, acuityProxy } = params;

  // ── 1. Pre-fetch local conflicts (single query each) ─────────────────────
  // Window covers all candidate dates.
  const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  const windowStart = new Date(minDate.getTime() - 24 * 60 * 60 * 1000);
  const windowEnd = new Date(maxDate.getTime() + 24 * 60 * 60 * 1000);

  const [blocksRes, apptsRes] = await Promise.all([
    supabase
      .from("block_times")
      .select("starts_at, ends_at")
      .eq("barber_id", barberId)
      .gte("starts_at", windowStart.toISOString())
      .lte("starts_at", windowEnd.toISOString()),
    supabase
      .from("appointments")
      .select("starts_at, ends_at, status")
      .eq("barber_id", barberId)
      .gte("starts_at", windowStart.toISOString())
      .lte("starts_at", windowEnd.toISOString())
      .not("status", "in", "(cancelled,no-show)"),
  ]);

  const blocks = (blocksRes.data || []).map((b) => ({
    s: new Date(b.starts_at).getTime(),
    e: new Date(b.ends_at).getTime(),
  }));
  const appts = (apptsRes.data || []).map((a) => ({
    s: new Date(a.starts_at).getTime(),
    e: new Date(a.ends_at).getTime(),
  }));

  // ── 2. Group dates by YYYY-MM-DD to minimize Acuity calls ────────────────
  const byDay = new Map<string, Date[]>();
  for (const d of dates) {
    const key = ymd(d);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(d);
  }

  /** Per-day cache of available HH:mm strings (24h, local shop wall-clock). */
  const acuityTimesByDay = new Map<string, Set<string> | null>();

  // Limit concurrency to 6 parallel Acuity calls.
  const dayKeys = Array.from(byDay.keys());
  const CONCURRENCY = 6;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, dayKeys.length) }, async () => {
      while (cursor < dayKeys.length) {
        const idx = cursor++;
        const key = dayKeys[idx];
        try {
          const res = await acuityProxy(
            `/availability/times?appointmentTypeID=${appointmentTypeId}&calendarID=${calendarId}&date=${key}`,
            "GET",
          );
          if (Array.isArray(res)) {
            const set = new Set<string>();
            for (const slot of res) {
              // Acuity returns ISO with offset, e.g. "2026-04-30T09:00:00-0400"
              const t = new Date(slot.time);
              if (!isNaN(t.getTime())) set.add(hm(t));
            }
            acuityTimesByDay.set(key, set);
          } else {
            acuityTimesByDay.set(key, null); // unknown shape → soft fail
          }
        } catch {
          acuityTimesByDay.set(key, null);
        }
      }
    }),
  );

  // ── 3. Resolve each occurrence ───────────────────────────────────────────
  const results: OccurrenceAvailability[] = dates.map((d) => {
    const occStart = d.getTime();
    const occEnd = occStart + durationMinutes * 60_000;

    // Local block overlap
    if (blocks.some((b) => occStart < b.e && occEnd > b.s)) {
      return { date: d, available: false, reason: "local_block" };
    }
    // Local appointment overlap
    if (appts.some((a) => occStart < a.e && occEnd > a.s)) {
      return { date: d, available: false, reason: "local_appointment" };
    }
    // Acuity slot check
    const dayKey = ymd(d);
    const slots = acuityTimesByDay.get(dayKey);
    if (slots === null || slots === undefined) {
      return { date: d, available: true, reason: "check_failed" }; // soft-pass
    }
    if (!slots.has(hm(d))) {
      return { date: d, available: false, reason: "acuity_unavailable" };
    }
    return { date: d, available: true };
  });

  return results;
}

/** Localized short label for a conflict reason. */
export function reasonLabel(reason: ConflictReason | undefined, language: "es" | "en"): string {
  const isEs = language === "es";
  switch (reason) {
    case "local_block":
      return isEs ? "Bloqueado" : "Blocked";
    case "local_appointment":
      return isEs ? "Cita existente" : "Existing appt";
    case "acuity_unavailable":
      return isEs ? "Sin disponibilidad" : "Unavailable";
    case "check_failed":
      return isEs ? "Sin verificar" : "Unverified";
    default:
      return "";
  }
}
