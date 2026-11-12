// Native scheduler behind the Acuity proxy contract (Phase B6).
//
// The admin and client screens were written against Acuity's REST paths
// (`/calendars`, `/appointment-types`, `/availability/times?…`,
// `PUT /appointments/{id}/reschedule` …). For shops on the native scheduler
// those same calls are translated to `native-scheduling` actions and the
// answers are shaped like Acuity's, so a screen works for both providers.
//
// Ids differ: native ids are the local uuids (services.id, barbers.id,
// service_addons.id, appointments.id). Native appointments carry
// `provider: "native"` and `localId` so screens can skip the local mirror
// they keep for Acuity rows.
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction, EdgeFunctionError, type ProxyResult } from "./acuityProxy";

export interface NativeCall {
  action: string;
  payload: Record<string, unknown>;
}

export type TranslatedRequest =
  | { kind: "edge"; call: NativeCall; pickId?: string }
  | { kind: "clients-search"; query: string }
  | { kind: "clients-update" }
  | { kind: "unsupported"; reason: string };

const str = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/** Pure: an Acuity-style proxy request → the native call that serves it. */
export function translateAcuityRequest(path: string, method = "GET", body?: unknown): TranslatedRequest {
  const [rawPath, rawQuery = ""] = path.split("?");
  const p = rawPath.replace(/\/+$/, "");
  const q = new URLSearchParams(rawQuery);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const m = method.toUpperCase();

  if (p === "/calendars" && m === "GET") return { kind: "edge", call: { action: "list-calendars", payload: {} } };
  if (p === "/appointment-types" && m === "GET") return { kind: "edge", call: { action: "list-services", payload: {} } };
  const typeOne = p.match(/^\/appointment-types\/([^/]+)$/);
  if (typeOne && m === "GET") return { kind: "edge", call: { action: "list-services", payload: {} }, pickId: typeOne[1] };
  if ((p === "/appointment-addons" || p === "/addons") && m === "GET") {
    return { kind: "edge", call: { action: "list-addons", payload: {} } };
  }

  if (p === "/availability/dates" && m === "GET") {
    return {
      kind: "edge",
      call: {
        action: "list-dates",
        payload: {
          serviceId: q.get("appointmentTypeID"),
          barberId: q.get("calendarID"),
          month: q.get("month"),
          addonIds: list(q.getAll("addonIDs[]").length ? q.getAll("addonIDs[]") : q.get("addonIDs")?.split(",")),
          excludeAppointmentId: q.get("excludeAppointmentId"),
        },
      },
    };
  }
  if (p === "/availability/times" && m === "GET") {
    return {
      kind: "edge",
      call: {
        action: "list-times",
        payload: {
          serviceId: q.get("appointmentTypeID"),
          barberId: q.get("calendarID"),
          date: q.get("date"),
          addonIds: list(q.getAll("addonIDs[]").length ? q.getAll("addonIDs[]") : q.get("addonIDs")?.split(",")),
          excludeAppointmentId: q.get("excludeAppointmentId"),
        },
      },
    };
  }

  if (p === "/appointments" && m === "POST") {
    const native = (b.native && typeof b.native === "object" ? b.native : {}) as Record<string, unknown>;
    return {
      kind: "edge",
      call: {
        action: "create",
        payload: {
          serviceId: str(b.appointmentTypeID),
          barberId: str(b.calendarID),
          startsAt: str(b.datetime),
          addonIds: list(b.addonIDs),
          client: {
            client_id: str(native.clientId),
            first_name: str(b.firstName),
            last_name: str(b.lastName),
            phone: str(b.phone),
            email: str(b.email)?.toLowerCase().endsWith("@placeholder.local") ? null : str(b.email),
          },
          notes: str(b.notes),
          respectAvailability: b.respectAvailability === true,
          noEmail: b.noEmail === true,
          allowOverlap: native.allowOverlap === true,
          bookingSource: str(native.bookingSource) ?? "admin_manual",
          recurringGroupId: str(native.recurringGroupId),
          label: str(native.label),
          priceCents: native.priceCents ?? null,
          payment: native.payment ?? {},
        },
      },
    };
  }

  const appt = p.match(/^\/appointments\/([^/]+)(?:\/(reschedule|cancel))?$/);
  if (appt) {
    const appointmentId = appt[1];
    const sub = appt[2];
    if (!sub && m === "GET") return { kind: "edge", call: { action: "get-appointment", payload: { appointmentId } } };
    if (sub === "reschedule" && m === "PUT") {
      return {
        kind: "edge",
        call: {
          action: "reschedule",
          payload: {
            appointmentId,
            startsAt: str(b.datetime),
            barberId: str(b.calendarID),
            noEmail: b.noEmail === true,
            respectAvailability: b.respectAvailability === true,
            allowOverlap: (b.native as Record<string, unknown> | undefined)?.allowOverlap === true,
          },
        },
      };
    }
    if (sub === "cancel" && m === "PUT") {
      return {
        kind: "edge",
        call: { action: "cancel", payload: { appointmentId, reason: str(b.cancelNote), noEmail: b.noEmail === true } },
      };
    }
    if (!sub && m === "PUT") {
      if (b.canceled === true) {
        return { kind: "edge", call: { action: "cancel", payload: { appointmentId, noEmail: b.noEmail === true } } };
      }
      const payload: Record<string, unknown> = { appointmentId };
      if (b.appointmentTypeID !== undefined) payload.serviceId = str(b.appointmentTypeID);
      if (b.addonIDs !== undefined) payload.addonIds = list(b.addonIDs);
      if (b.notes !== undefined) payload.notes = b.notes;
      const client: Record<string, unknown> = {};
      if (b.firstName !== undefined) client.firstName = b.firstName;
      if (b.lastName !== undefined) client.lastName = b.lastName;
      if (b.phone !== undefined) client.phone = b.phone;
      if (b.email !== undefined) client.email = b.email;
      if (Object.keys(client).length) payload.client = client;
      return { kind: "edge", call: { action: "update", payload } };
    }
    if (m === "DELETE") return { kind: "edge", call: { action: "cancel", payload: { appointmentId, noEmail: true } } };
  }

  if (p === "/clients" && m === "GET") return { kind: "clients-search", query: q.get("search") ?? "" };
  if (/^\/clients\/[^/]+$/.test(p)) return { kind: "clients-update" };
  if (p.startsWith("/blocks")) {
    return { kind: "unsupported", reason: "native_blocks_direct: native shops write block_times directly" };
  }
  return { kind: "unsupported", reason: `native_unsupported_path: ${m} ${p}` };
}

/** Native appointment row → Acuity-shaped appointment (plus `provider` / `localId`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapNativeAppointment(row: Record<string, any> | null | undefined): ProxyResult {
  if (!row || !row.id) return null;
  const name = String(row.client_name ?? "").trim();
  const [firstName, ...rest] = name ? name.split(" ") : [""];
  const addonIds: string[] = Array.isArray(row.addon_ref_ids) ? row.addon_ref_ids : [];
  const addonNames: string[] = Array.isArray(row.addons) ? row.addons : [];
  return {
    id: row.id,
    localId: row.id,
    provider: "native",
    datetime: row.starts_at,
    endTime: row.ends_at,
    duration: Number(row.duration_minutes) || 0,
    type: row.service_name ?? "",
    appointmentTypeID: row.service_ref_id ?? null,
    calendarID: row.barber_id ?? null,
    calendar: null,
    firstName,
    lastName: rest.join(" "),
    email: row.client_email ?? "",
    phone: row.client_phone ?? "",
    notes: row.notes ?? "",
    price: ((Number(row.price_cents) || 0) / 100).toFixed(2),
    addons: addonIds.map((id, i) => ({ id, name: addonNames[i] ?? "" })),
    addonIDs: addonIds,
    canceled: row.status === "cancelled",
    status: row.status,
    clientId: row.client_id ?? null,
    recurringGroupId: row.recurring_group_id ?? null,
  };
}

/** Local clients row → Acuity-shaped client (search results). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapNativeClient(row: Record<string, any>): ProxyResult {
  return {
    id: row.id,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    notes: row.notes ?? "",
  };
}

async function callNative(call: NativeCall): Promise<ProxyResult> {
  const { status, json } = await callEdgeFunction("native-scheduling", { action: call.action, ...call.payload });
  if (status >= 400) {
    const code = json?.error || `native_scheduling_error_${status}`;
    const detail = json?.reason || json?.detail;
    throw new EdgeFunctionError(status, code, detail && detail !== code ? `${code}: ${detail}` : code, json?.reason ?? null);
  }
  return json;
}

/**
 * PostgREST filter values cannot carry the characters that structure a
 * filter expression (`,` `(` `)` `.` `"` `\`); strip them so a name such
 * as "Pérez, Ana" still searches instead of breaking the request.
 */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()."\\%_]/g, " ").replace(/\s+/g, " ").trim();
}

const APPOINTMENT_ACTIONS = new Set(["create", "get-appointment", "update", "reschedule", "cancel"]);

/** Drop-in for `acuityProxy(path, method, body)` on shops that run natively. */
export async function nativeProxy(path: string, method = "GET", body?: unknown): Promise<ProxyResult> {
  const t = translateAcuityRequest(path, method, body);
  switch (t.kind) {
    case "edge": {
      const result = await callNative(t.call);
      if (APPOINTMENT_ACTIONS.has(t.call.action)) return mapNativeAppointment(result);
      if (t.pickId) return Array.isArray(result) ? result.find((s: { id: string }) => s.id === t.pickId) ?? null : null;
      return result;
    }
    case "clients-search": {
      const term = sanitizeSearchTerm(t.query);
      if (!term) return [];
      const digits = term.replace(/\D/g, "");
      let query = supabase.from("clients").select("id, first_name, last_name, phone, email, notes").limit(20);
      query = digits.length >= 4
        ? query.ilike("phone", `%${digits.slice(-10)}%`)
        : query.or(`email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
      const { data, error } = await query;
      if (error) throw new Error(`client_search_failed: ${error.message}`);
      return (data ?? []).map(mapNativeClient);
    }
    case "clients-update":
      return { ok: true, provider: "native" };
    case "unsupported":
      throw new Error(t.reason);
  }
}
