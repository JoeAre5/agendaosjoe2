// Scheduling client for the browser (Phase B6).
//
//   schedulingProxy(path, method, body)  – the call every screen makes. Acuity
//     shops reach `acuity-proxy` exactly as before; native shops reach
//     `native-scheduling` through the translator in ./nativeProxy.
//   appointmentRef(appt)                 – the id to put in `/appointments/{id}`:
//     the Acuity id for Acuity rows, the local uuid for native rows.
//   calendarBarberId(cal, barbers)       – barber behind a "calendar" entry.
//
// Provider detection: ./provider (shops.booking_provider, cached per shop).
import { acuityProxy, type ProxyResult } from "./acuityProxy";
import { nativeProxy } from "./nativeProxy";
import { getShopProvider } from "./provider";

export { acuityProxy, callEdgeFunction, EdgeFunctionError } from "./acuityProxy";
export { mapNativeAppointment, nativeProxy, sanitizeSearchTerm, translateAcuityRequest } from "./nativeProxy";
export { getShopProvider, useShopProvider, type BookingProviderKind, type ShopProviderInfo } from "./provider";

/**
 * Provider-aware proxy. Same signature as the old per-page `acuityProxy`.
 * `body.native` carries fields only the native scheduler understands
 * (clientId, bookingSource, recurringGroupId, label, priceCents); it is
 * stripped before anything is sent to Acuity.
 */
export async function schedulingProxy(path: string, method = "GET", body?: unknown): Promise<ProxyResult> {
  const provider = await getShopProvider();
  if (provider.kind === "native") return nativeProxy(path, method, body);
  if (body && typeof body === "object" && "native" in (body as Record<string, unknown>)) {
    const { native: _native, ...rest } = body as Record<string, unknown>;
    return acuityProxy(path, method, rest);
  }
  return acuityProxy(path, method, body);
}

/** Row shape both providers share for `/appointments/{id}` calls. */
export interface AppointmentRefLike {
  id: string;
  acuity_id?: number | null;
}

/**
 * Id segment for `/appointments/{id}`: Acuity id on Acuity shops, the local
 * uuid on native shops (native rows have no acuity_id).
 */
export function appointmentRef(appt: AppointmentRefLike, isNative: boolean): string | number {
  if (isNative || appt.acuity_id === null || appt.acuity_id === undefined) return appt.id;
  return appt.acuity_id;
}

export interface CalendarLike {
  id: string | number;
  name?: string;
  barberId?: string | null;
}

export interface BarberLike {
  id: string;
  name?: string | null;
  acuity_calendar_id?: number | null;
}

/**
 * Barber behind a calendar entry. Native calendars are barbers (id = barber
 * id); Acuity calendars map through barbers.acuity_calendar_id, then by name.
 */
export function calendarBarber<B extends BarberLike>(cal: CalendarLike, barbers: readonly B[]): B | null {
  if (cal.barberId) {
    const byId = barbers.find((b) => b.id === cal.barberId);
    if (byId) return byId;
  }
  const byUuid = barbers.find((b) => b.id === cal.id);
  if (byUuid) return byUuid;
  const byCalendar = barbers.find((b) => b.acuity_calendar_id != null && Number(b.acuity_calendar_id) === Number(cal.id));
  if (byCalendar) return byCalendar;
  const first = (cal.name ?? "").split(" ")[0]?.toUpperCase();
  if (first) {
    const byName = barbers.find((b) => (b.name ?? "").toUpperCase().startsWith(first));
    if (byName) return byName;
  }
  return null;
}
