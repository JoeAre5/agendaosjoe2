// Loads everything the native availability engine needs for one shop from
// the database. Every tenant query carries an explicit shop_id filter on top
// of whatever scoping the client already applies.
//
// Callers pass a service-role client (scoped or raw); this module never
// creates one.

// @ts-types="npm:@types/luxon@3.4.2"
import { DateTime } from "npm:luxon@3.5.0";
import { DEFAULT_RULES, localDateOf } from "./engine.ts";
import type { AvailabilityInput, BarberInput, BookingRules, WeeklyInterval } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Client = { from: (table: string) => any };

export class AvailabilityLoadError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400, message?: string) {
    super(message ?? code);
    this.name = "AvailabilityLoadError";
    this.code = code;
    this.status = status;
  }
}

export interface ShopRow {
  id: string;
  timezone: string;
  booking_provider: string;
  is_active: boolean;
}

export interface ServiceRow {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  padding_before_minutes: number;
  padding_after_minutes: number;
  is_active: boolean;
  is_public: boolean;
  barber_id: string | null;
  category: string | null;
  description: string | null;
  image_url: string | null;
  color: string | null;
  sort_order: number;
}

export interface AddonRow {
  id: string;
  name: string;
  duration_minutes: number;
  price_cents: number;
  is_active: boolean;
  barber_id: string | null;
}

export interface BarberRow {
  id: string;
  name: string;
  is_active: boolean;
  is_bookable: boolean;
  avatar_url: string | null;
  color: string | null;
}

export interface LoadOptions {
  shopId: string;
  serviceId: string;
  addonIds?: string[];
  /** Restrict to one barber (booking / reschedule). */
  barberId?: string | null;
  /** Local days, inclusive. */
  from: string;
  to: string;
  /** Reference instant; defaults to the real clock. */
  now?: string;
  /** Reschedule: the appointment being moved must not block itself. */
  excludeAppointmentId?: string | null;
  /** Commit: the draft being booked must not block itself. */
  excludeDraftId?: string | null;
  /** Staff context: non-public services and non-bookable barbers are allowed. */
  staff?: boolean;
  /** Already-read shop row (saves a round trip); must be native and active. */
  shop?: ShopRow;
}

export interface LoadedAvailability {
  input: AvailabilityInput;
  shop: ShopRow;
  service: ServiceRow;
  addons: AddonRow[];
  barbers: BarberRow[];
  rules: BookingRules;
}

const SERVICE_COLS =
  "id,name,duration_minutes,price_cents,padding_before_minutes,padding_after_minutes,is_active,is_public,barber_id,category,description,image_url,color,sort_order";
const ADDON_COLS = "id,name,duration_minutes,price_cents,is_active,barber_id";
const BARBER_COLS = "id,name,is_active,is_bookable,avatar_url,color";

function fail(error: { message?: string } | null, code: string): never {
  throw new AvailabilityLoadError(code, 500, `${code}: ${error?.message ?? "unknown"}`);
}

/** Shop row for a native-scheduling request; refuses inactive / non-native shops. */
export async function loadNativeShop(admin: Client, shopId: string): Promise<ShopRow> {
  const { data, error } = await admin
    .from("shops")
    .select("id,timezone,booking_provider,is_active")
    .eq("id", shopId)
    .maybeSingle();
  if (error) fail(error, "shop_read_failed");
  const shop = data as ShopRow | null;
  if (!shop || !shop.is_active) throw new AvailabilityLoadError("shop_unavailable", 404);
  if (shop.booking_provider !== "native") throw new AvailabilityLoadError("provider_not_native", 409);
  return shop;
}

/** Effective rules: service-scoped, else barber-scoped, else global, else defaults. */
export function pickRules(
  rows: Array<Record<string, unknown>>,
  serviceId: string,
  barberId?: string | null,
): BookingRules {
  const active = rows.filter((r) => r.is_active !== false);
  const forService = active.find((r) =>
    r.scope === "service" && r.service_id === serviceId && (!r.barber_id || r.barber_id === barberId)
  );
  const forBarber = barberId ? active.find((r) => r.scope === "barber" && r.barber_id === barberId) : undefined;
  const global = active.find((r) => r.scope === "global");
  const row = forService ?? forBarber ?? global;
  if (!row) return { ...DEFAULT_RULES };
  const num = (k: string, d: number) => (Number.isFinite(Number(row[k])) && row[k] !== null ? Number(row[k]) : d);
  return {
    minAdvanceMinutes: num("min_advance_minutes", DEFAULT_RULES.minAdvanceMinutes),
    maxAdvanceDays: num("max_advance_days", DEFAULT_RULES.maxAdvanceDays),
    slotIntervalMinutes: num("slot_interval_minutes", DEFAULT_RULES.slotIntervalMinutes) || DEFAULT_RULES.slotIntervalMinutes,
    paddingBeforeMinutes: num("padding_before_minutes", 0),
    paddingAfterMinutes: num("padding_after_minutes", 0),
    maxPerDay: row.max_per_day === null || row.max_per_day === undefined ? null : Number(row.max_per_day),
  };
}

function weekly(rows: Array<Record<string, unknown>>): WeeklyInterval[] {
  return rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    start: String(r.start_time),
    end: String(r.end_time),
    isActive: r.is_active !== false,
  }));
}

export async function loadAvailabilityInput(admin: Client, opts: LoadOptions): Promise<LoadedAvailability> {
  const { shopId } = opts;
  const now = opts.now ?? new Date().toISOString();
  const shop = opts.shop ?? (await loadNativeShop(admin, shopId));
  const zone = shop.timezone || "America/Puerto_Rico";
  const addonIds = [...new Set((opts.addonIds ?? []).filter(Boolean))];

  // ── catalogue: one batch (service, add-ons, barbers, rules, shop hours) ──
  let barberQuery = admin.from("barbers").select(BARBER_COLS).eq("shop_id", shopId).eq("is_active", true);
  if (opts.barberId) barberQuery = barberQuery.eq("id", opts.barberId);
  const [svcRes, addRes, barberRes, rulesRes, hoursRes] = await Promise.all([
    admin.from("services").select(SERVICE_COLS).eq("shop_id", shopId).eq("id", opts.serviceId).maybeSingle(),
    addonIds.length > 0
      ? admin.from("service_addons").select(ADDON_COLS).eq("shop_id", shopId).in("id", addonIds)
      : Promise.resolve({ data: [] as AddonRow[], error: null }),
    barberQuery,
    admin.from("booking_rules").select("*").eq("shop_id", shopId).eq("is_active", true),
    admin.from("shop_hours").select("day_of_week,start_time,end_time,is_active").eq("shop_id", shopId).eq("is_active", true),
  ]);
  if (svcRes.error) fail(svcRes.error, "service_read_failed");
  if (addRes.error) fail(addRes.error, "addon_read_failed");
  if (barberRes.error) fail(barberRes.error, "barber_read_failed");
  if (rulesRes.error) fail(rulesRes.error, "rules_read_failed");
  if (hoursRes.error) fail(hoursRes.error, "shop_hours_read_failed");

  const service = svcRes.data as ServiceRow | null;
  if (!service || !service.is_active || (!service.is_public && !opts.staff)) {
    throw new AvailabilityLoadError("service_unavailable", 404);
  }

  const addons = ((addRes.data ?? []) as AddonRow[]).filter((a) => a.is_active);
  if (addons.length !== addonIds.length) throw new AvailabilityLoadError("addon_unavailable", 404);
  const addonMismatch = addons.find((a) => a.barber_id && opts.barberId && a.barber_id !== opts.barberId);
  if (addonMismatch) throw new AvailabilityLoadError("addon_unavailable", 404);

  // A barber-specific service narrows the barber list in memory.
  const barbers = ((barberRes.data ?? []) as BarberRow[])
    .filter((b) => b.is_bookable || opts.staff)
    .filter((b) => !service.barber_id || b.id === service.barber_id);
  const barberIds = barbers.map((b) => b.id);

  const rules = pickRules(rulesRes.data ?? [], service.id, opts.barberId ?? null);
  const shopHours = weekly(hoursRes.data ?? []);

  const inputBase = {
    timezone: zone,
    now,
    from: opts.from,
    to: opts.to,
    service: {
      durationMinutes: service.duration_minutes,
      paddingBeforeMinutes: service.padding_before_minutes,
      paddingAfterMinutes: service.padding_after_minutes,
    },
    addons: addons.map((a) => ({ durationMinutes: a.duration_minutes })),
    rules,
    shopHours,
  };

  if (barberIds.length === 0) {
    return { input: { ...inputBase, barbers: [] }, shop, service, addons, barbers, rules };
  }

  // ── absolute range with a one-day margin either side for padding / offsets ──
  const fromDay = DateTime.fromISO(opts.from, { zone });
  const toDay = DateTime.fromISO(opts.to, { zone });
  if (!fromDay.isValid || !toDay.isValid) throw new AvailabilityLoadError("invalid_date", 400);
  const rangeStart = fromDay.startOf("day").minus({ days: 1 }).toUTC().toISO() as string;
  const rangeEnd = toDay.startOf("day").plus({ days: 2 }).toUTC().toISO() as string;
  // Lower bound on starts_at so the (barber_id, starts_at) indexes give a
  // short range scan; nothing lasts longer than this margin.
  const scanStart = fromDay.startOf("day").minus({ days: 8 }).toUTC().toISO() as string;

  const [whRes, apptRes, blockRes, holdRes] = await Promise.all([
    admin.from("working_hours").select("barber_id,day_of_week,start_time,end_time,is_active").eq("shop_id", shopId).in("barber_id", barberIds),
    (() => {
      let q = admin
        .from("appointments")
        .select("id,barber_id,starts_at,ends_at")
        .eq("shop_id", shopId)
        .in("barber_id", barberIds)
        .not("status", "in", "(cancelled,no_show)")
        .gte("starts_at", scanStart)
        .lt("starts_at", rangeEnd)
        .gt("ends_at", rangeStart);
      if (opts.excludeAppointmentId) q = q.neq("id", opts.excludeAppointmentId);
      return q;
    })(),
    admin
      .from("block_times")
      .select("barber_id,starts_at,ends_at,is_all_day")
      .eq("shop_id", shopId)
      .in("barber_id", barberIds)
      .gte("starts_at", fromDay.startOf("day").minus({ days: 31 }).toUTC().toISO() as string)
      .lt("starts_at", rangeEnd)
      .gt("ends_at", rangeStart),
    (() => {
      let q = admin
        .from("booking_drafts")
        .select("id,barber_id,starts_at,ends_at")
        .eq("shop_id", shopId)
        .in("barber_id", barberIds)
        .in("status", ["pending", "processing"])
        .gt("expires_at", now)
        .not("starts_at", "is", null)
        .gte("starts_at", scanStart)
        .lt("starts_at", rangeEnd)
        .gt("ends_at", rangeStart);
      if (opts.excludeDraftId) q = q.neq("id", opts.excludeDraftId);
      return q;
    })(),
  ]);
  if (whRes.error) fail(whRes.error, "working_hours_read_failed");
  if (apptRes.error) fail(apptRes.error, "appointments_read_failed");
  if (blockRes.error) fail(blockRes.error, "block_times_read_failed");
  if (holdRes.error) fail(holdRes.error, "drafts_read_failed");

  type Row = Record<string, unknown>;
  const byBarber = <T extends Row>(rows: T[] | null | undefined) => {
    const map = new Map<string, T[]>();
    for (const r of rows ?? []) {
      const key = String(r.barber_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  };
  const wh = byBarber(whRes.data as Row[]);
  const appts = byBarber(apptRes.data as Row[]);
  const blocks = byBarber(blockRes.data as Row[]);
  const holds = byBarber(holdRes.data as Row[]);

  const barberInputs: BarberInput[] = barbers.map((b) => ({
    id: b.id,
    workingHours: weekly(wh.get(b.id) ?? []),
    appointments: (appts.get(b.id) ?? []).map((a) => ({ start: String(a.starts_at), end: String(a.ends_at) })),
    blocks: (blocks.get(b.id) ?? []).map((x) => ({
      start: String(x.starts_at),
      end: String(x.ends_at),
      isAllDay: x.is_all_day === true,
    })),
    holds: (holds.get(b.id) ?? []).map((h) => ({ start: String(h.starts_at), end: String(h.ends_at) })),
  }));

  return { input: { ...inputBase, barbers: barberInputs }, shop, service, addons, barbers, rules };
}

/** Local day of an instant in the shop zone, for single-slot checks. */
export function dayOf(iso: string, zone: string): string {
  const d = localDateOf(iso, zone);
  if (!d) throw new AvailabilityLoadError("invalid_time", 400);
  return d;
}
