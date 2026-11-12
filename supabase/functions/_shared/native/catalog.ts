// Native scheduling catalog and availability for one shop, in the same wire
// shapes the browser already consumes from Acuity (calendars, appointment
// types, add-ons, availability dates / times). Ids are the local uuids.
//
// Every tenant query carries an explicit shop_id filter. Callers pass a
// service-role client (scoped or raw); this module never creates one.

// @ts-types="npm:@types/luxon@3.4.2"
import { DateTime } from "npm:luxon@3.5.0";
import { AvailabilityInputError, checkSlot, computeAvailability } from "../availability/engine.ts";
import { AvailabilityLoadError, dayOf, loadAvailabilityInput, loadNativeShop } from "../availability/load.ts";
import type { AddonRow, BarberRow, ServiceRow } from "../availability/load.ts";
import type { SlotCheck } from "../availability/types.ts";

// deno-lint-ignore no-explicit-any
type Client = { from: (table: string) => any; rpc: (...args: any[]) => any };

export { AvailabilityInputError, AvailabilityLoadError };

const money = (cents: number) => ((Number(cents) || 0) / 100).toFixed(2);

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

export interface CatalogQuery {
  serviceId: string | null;
  barberId: string | null;
  addonIds: string[];
  month: string | null;
  date: string | null;
  startsAt: string | null;
  excludeAppointmentId: string | null;
  appointmentId: string | null;
}

/**
 * Request fields of the native endpoints. Accepts the Acuity-era aliases the
 * browser still sends (appointmentTypeID = serviceId, calendarID = barberId,
 * addonIDs = addonIds, datetime = startsAt) so one parser serves
 * `availability`, `native-scheduling` and `public-booking-create`.
 */
export function parseCatalogQuery(body: Record<string, unknown>): CatalogQuery {
  return {
    serviceId: str(body.serviceId) ?? str(body.appointmentTypeID),
    barberId: str(body.barberId) ?? str(body.calendarID),
    addonIds: strList(body.addonIds ?? body.addonIDs),
    month: str(body.month),
    date: str(body.date),
    startsAt: str(body.startsAt) ?? str(body.datetime),
    excludeAppointmentId: str(body.excludeAppointmentId),
    appointmentId: str(body.appointmentId),
  };
}

export interface CalendarOut {
  id: string;
  name: string;
  avatarUrl: string | null;
  barberId: string;
  color: string | null;
  description: string | null;
}

export interface ServiceOut {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: string;
  priceCents: number;
  category: string;
  color: string | null;
  image: string | null;
  private: boolean;
  calendarIDs: string[];
  addonIDs: string[];
  paddingBefore: number;
  paddingAfter: number;
  sortOrder: number;
}

export interface AddonOut {
  id: string;
  name: string;
  duration: number;
  price: string;
  priceCents: number;
  calendarIDs: string[];
}

async function activeBarbers(admin: Client, shopId: string, staff = false): Promise<BarberRow[]> {
  const { data, error } = await admin
    .from("barbers")
    .select("id,name,is_active,is_bookable,avatar_url,color,description")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new AvailabilityLoadError("barber_read_failed", 500, error.message);
  return ((data ?? []) as (BarberRow & { description: string | null })[]).filter((b) => b.is_bookable || staff);
}

/** Bookable barbers as "calendars". */
export async function nativeListCalendars(admin: Client, shopId: string, opts?: { staff?: boolean }): Promise<CalendarOut[]> {
  await loadNativeShop(admin, shopId);
  const rows = (await activeBarbers(admin, shopId, opts?.staff)) as (BarberRow & { description: string | null })[];
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    avatarUrl: b.avatar_url ?? null,
    barberId: b.id,
    color: b.color ?? null,
    description: b.description ?? null,
  }));
}

/** Active services as "appointment types". Non-public services only for staff. */
export async function nativeListServices(admin: Client, shopId: string, opts?: { staff?: boolean }): Promise<ServiceOut[]> {
  await loadNativeShop(admin, shopId);
  const [barbers, svcRes, addRes] = await Promise.all([
    activeBarbers(admin, shopId, opts?.staff),
    admin
      .from("services")
      .select("id,name,duration_minutes,price_cents,padding_before_minutes,padding_after_minutes,is_active,is_public,barber_id,category,description,image_url,color,sort_order")
      .eq("shop_id", shopId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    admin.from("service_addons").select("id,barber_id,is_active").eq("shop_id", shopId).eq("is_active", true),
  ]);
  if (svcRes.error) throw new AvailabilityLoadError("service_read_failed", 500, svcRes.error.message);
  if (addRes.error) throw new AvailabilityLoadError("addon_read_failed", 500, addRes.error.message);

  const allBarberIds = barbers.map((b) => b.id);
  const addons = (addRes.data ?? []) as Pick<AddonRow, "id" | "barber_id">[];
  return ((svcRes.data ?? []) as ServiceRow[])
    .filter((s) => s.is_public || opts?.staff)
    .map((s) => {
      const calendarIDs = s.barber_id ? allBarberIds.filter((id) => id === s.barber_id) : allBarberIds;
      return {
        id: s.id,
        name: s.name,
        description: s.description ?? "",
        duration: s.duration_minutes,
        price: money(s.price_cents),
        priceCents: s.price_cents,
        category: s.category ?? "",
        color: s.color ?? null,
        image: s.image_url ?? null,
        private: !s.is_public,
        calendarIDs,
        addonIDs: addons.filter((a) => !a.barber_id || calendarIDs.includes(a.barber_id)).map((a) => a.id),
        paddingBefore: s.padding_before_minutes,
        paddingAfter: s.padding_after_minutes,
        sortOrder: s.sort_order,
      };
    });
}

/** Active add-ons. `calendarIDs` is empty for add-ons every barber offers. */
export async function nativeListAddons(admin: Client, shopId: string): Promise<AddonOut[]> {
  await loadNativeShop(admin, shopId);
  const { data, error } = await admin
    .from("service_addons")
    .select("id,name,duration_minutes,price_cents,is_active,barber_id")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new AvailabilityLoadError("addon_read_failed", 500, error.message);
  return ((data ?? []) as AddonRow[]).map((a) => ({
    id: a.id,
    name: a.name,
    duration: a.duration_minutes,
    price: money(a.price_cents),
    priceCents: a.price_cents,
    calendarIDs: a.barber_id ? [a.barber_id] : [],
  }));
}

export interface AvailabilityQuery {
  serviceId: string;
  barberId?: string | null;
  addonIds?: string[];
  staff?: boolean;
  now?: string;
  /** Reschedule pickers: the appointment being moved must not block itself. */
  excludeAppointmentId?: string | null;
}

/** Days of `month` (YYYY-MM) with at least one slot, as [{ date }]. */
export async function nativeListDates(
  admin: Client,
  shopId: string,
  q: AvailabilityQuery & { month: string },
): Promise<Array<{ date: string }>> {
  if (!/^\d{4}-\d{2}$/.test(q.month)) throw new AvailabilityInputError("invalid_month", `invalid month "${q.month}"`);
  const shop = await loadNativeShop(admin, shopId);
  const first = DateTime.fromISO(`${q.month}-01`, { zone: shop.timezone });
  if (!first.isValid) throw new AvailabilityInputError("invalid_month", `invalid month "${q.month}"`);
  const loaded = await loadAvailabilityInput(admin, {
    shopId,
    shop,
    serviceId: q.serviceId,
    barberId: q.barberId,
    addonIds: q.addonIds,
    from: first.toISODate() as string,
    to: first.endOf("month").toISODate() as string,
    now: q.now,
    staff: q.staff,
    excludeAppointmentId: q.excludeAppointmentId,
  });
  return computeAvailability(loaded.input, { firstSlotOnly: true }).days.map((d) => ({ date: d.date }));
}

export interface TimeOut {
  time: string;
  endTime: string;
  slotsAvailable: number;
  barberId: string;
}

/** Slots of one local day, as [{ time, endTime, slotsAvailable, barberId }]. */
export async function nativeListTimes(
  admin: Client,
  shopId: string,
  q: AvailabilityQuery & { date: string },
): Promise<TimeOut[]> {
  const loaded = await loadAvailabilityInput(admin, {
    shopId,
    serviceId: q.serviceId,
    barberId: q.barberId,
    addonIds: q.addonIds,
    from: q.date,
    to: q.date,
    now: q.now,
    staff: q.staff,
    excludeAppointmentId: q.excludeAppointmentId,
  });
  const day = computeAvailability(loaded.input).days[0];
  return (day?.slots ?? []).map((s) => ({ time: s.startsAt, endTime: s.endsAt, slotsAvailable: 1, barberId: s.barberId }));
}

export interface SlotCheckQuery extends AvailabilityQuery {
  barberId: string;
  startsAt: string;
  excludeAppointmentId?: string | null;
  excludeDraftId?: string | null;
  ignoreAdvanceRules?: boolean;
  ignoreHours?: boolean;
  ignoreOverlap?: boolean;
}

/**
 * Validates one requested start with the live data. Returns the loaded
 * service / add-ons too, so callers price and persist from the same read.
 */
export async function nativeCheckSlot(admin: Client, shopId: string, q: SlotCheckQuery) {
  const shop = await loadNativeShop(admin, shopId);
  const date = dayOf(q.startsAt, shop.timezone);
  const loaded = await loadAvailabilityInput(admin, {
    shopId,
    shop,
    serviceId: q.serviceId,
    barberId: q.barberId,
    addonIds: q.addonIds,
    from: date,
    to: date,
    now: q.now,
    excludeAppointmentId: q.excludeAppointmentId,
    excludeDraftId: q.excludeDraftId,
    staff: q.staff,
  });
  const check: SlotCheck = checkSlot(loaded.input, q.barberId, q.startsAt, {
    ignoreAdvanceRules: q.ignoreAdvanceRules,
    ignoreHours: q.ignoreHours,
    ignoreOverlap: q.ignoreOverlap,
  });
  return { check, ...loaded };
}

/** HTTP status for a catalog / availability error. */
export function nativeErrorStatus(e: unknown): number {
  if (e instanceof AvailabilityLoadError) return e.status;
  if (e instanceof AvailabilityInputError) return 400;
  return 500;
}

export function nativeErrorCode(e: unknown): string {
  if (e instanceof AvailabilityLoadError || e instanceof AvailabilityInputError) return e.code;
  return (e as Error)?.message || "native_error";
}
