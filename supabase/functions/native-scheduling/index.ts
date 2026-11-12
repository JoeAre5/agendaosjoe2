// API de agenda para tiendas con shops.booking_provider = 'native' (agenda propia, sin Acuity).
//
// Reemplaza las llamadas del navegador a `acuity-proxy` para las tiendas nativas: catalogo,
// disponibilidad, crear, reprogramar, cancelar. Las tiendas que siguen en Acuity reciben 409
// provider_not_native y siguen usando el proxy de Acuity.
//
// Autenticacion: JWT de Supabase. Dos tipos de usuario:
//   staff   — user_roles owner / super_owner / manager / barber / staff
//   cliente — una fila de clients enlazada al usuario (clients.auth_user_id)
// Los barberos solo escriben en SU calendario (profiles.barber_id); owner, super_owner y manager,
// en cualquiera.
//
// POST { action, ... }
//   list-calendars / list-services / list-addons          (staff ve los no reservables / privados)
//   list-dates   { serviceId, barberId?, addonIds?, month, excludeAppointmentId? }
//   list-times   { serviceId, barberId?, addonIds?, date, excludeAppointmentId? }
//   check-slot   { serviceId, barberId, addonIds?, startsAt, excludeAppointmentId?, respectRules? }
//   get-appointment { appointmentId }
//   create       (staff) { serviceId, barberId, addonIds?, startsAt, client{}, notes?, bookingSource?,
//                          priceCents?, payment{}, respectAvailability?, recurringGroupId?, label? }
//   update       (staff) { appointmentId, serviceId?, addonIds?, notes?, client{}?, priceCents?, editLineItems? }
//   reschedule   (staff | cliente dueño) { appointmentId, startsAt, barberId?, noEmail? }
//   cancel       (staff) { appointmentId, reason?, noEmail? }   — los clientes usan client-booking-refund
//
// Reglas del proyecto que esta funcion respeta (AGENTS.md):
//   * `update` NO recalcula el precio desde el catalogo: el precio y edit_line_items los define el
//     staff de forma explicita (priceCents / editLineItems). Cambiar la duracion pasa por la funcion
//     SQL de reprogramar, que vuelve a comprobar bloqueos, reservas temporales y choques.
//   * Cancelar una cita pagada deja el reembolso como 'manual'. Nunca hay reembolsos automaticos.
//
// Errores: { error: <codigo>, detail? } con los codigos del SQL y del motor
// (slot_taken, slot_blocked, slot_held, outside_hours, too_soon, ...).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ShopContextError, resolveSingleShop } from "../_shared/singleShop.ts";
import { BookingRejectedError, getShopProvider, nativeRpcError } from "../_shared/nativeBooking.ts";
import {
  nativeCheckSlot,
  nativeErrorCode,
  nativeErrorStatus,
  nativeListAddons,
  nativeListCalendars,
  nativeListDates,
  nativeListServices,
  nativeListTimes,
  parseCatalogQuery,
} from "../_shared/native/catalog.ts";
import { queueOrDispatchRecurringPush } from "../_shared/recurringPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const STAFF_ROLES = new Set(["owner", "super_owner", "manager", "barber", "staff"]);
const MANAGER_ROLES = new Set(["owner", "super_owner", "manager"]);
const BOOKING_SOURCES = new Set(["admin_manual", "barber_manual", "walk_in", "phone", "pwa", "public_site"]);

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const rejectedStatus = (e: Error) => (e instanceof BookingRejectedError ? 409 : 500);

interface Caller {
  userId: string;
  staff: boolean;
  manager: boolean;
  role: string | null;
  clientId: string | null;
  barberId: string | null;
}

// deno-lint-ignore no-explicit-any
async function resolveCaller(admin: any, userId: string): Promise<Caller> {
  const [{ data: roleRows }, { data: clientRow }, { data: profile }] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", userId),
    admin.from("clients").select("id").eq("auth_user_id", userId).maybeSingle(),
    admin.from("profiles").select("barber_id").eq("id", userId).maybeSingle(),
  ]);
  const roles: string[] = (roleRows ?? []).map((r: { role: string }) => String(r.role));
  const staffRole = roles.find((r) => STAFF_ROLES.has(r)) ?? null;
  return {
    userId,
    staff: !!staffRole,
    manager: roles.some((r) => MANAGER_ROLES.has(r)),
    role: staffRole,
    clientId: clientRow?.id ?? null,
    barberId: profile?.barber_id ?? null,
  };
}

/** Staff: managers en cualquier calendario; un barbero solo en el suyo. */
const canWriteBarber = (c: Caller, barberId: string | null) =>
  c.staff && (c.manager || (!!barberId && c.barberId === barberId));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "invalid_json" }, 400);
  }
  const action = String(body.action || "");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── autenticacion ──
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return jsonRes({ error: "unauthorized" }, 401);
  const { data: userRes } = await admin.auth.getUser(token).catch(() => ({ data: null }));
  const userId = userRes?.user?.id ?? null;
  if (!userId) return jsonRes({ error: "unauthorized" }, 401);

  let shopId: string;
  try {
    shopId = await resolveSingleShop(admin);
  } catch (e) {
    return jsonRes({ error: e instanceof ShopContextError ? e.code : "shop_context_missing" }, 400);
  }
  const provider = await getShopProvider(admin, shopId);
  if (provider.kind !== "native") return jsonRes({ error: "provider_not_native" }, 409);

  const caller = await resolveCaller(admin, userId);
  if (!caller.staff && !caller.clientId) return jsonRes({ error: "forbidden" }, 403);

  const q = parseCatalogQuery(body);
  const { serviceId, barberId, addonIds, appointmentId } = q;
  const staffOnly = () => jsonRes({ error: "forbidden", detail: "staff only" }, 403);
  const notYourCalendar = () => jsonRes({ error: "forbidden", detail: "only your own calendar" }, 403);

  /** Fila sobre la que el usuario puede actuar: staff -> cualquiera de la tienda; cliente -> las propias. */
  const ownAppointment = async (id: string) => {
    const { data } = await admin.from("appointments").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    if (!caller.staff && data.client_id !== caller.clientId) return null;
    return data;
  };

  try {
    switch (action) {
      case "list-calendars":
        return jsonRes(await nativeListCalendars(admin, shopId, { staff: caller.staff }));
      case "list-services":
        return jsonRes(await nativeListServices(admin, shopId, { staff: caller.staff }));
      case "list-addons":
        return jsonRes(await nativeListAddons(admin, shopId));

      case "list-dates": {
        const month = q.month;
        if (!serviceId || !month) return jsonRes({ error: "missing_fields", detail: "serviceId, month" }, 400);
        return jsonRes(await nativeListDates(admin, shopId, {
          serviceId, barberId, addonIds, month, staff: caller.staff,
          excludeAppointmentId: q.excludeAppointmentId,
        }));
      }
      case "list-times": {
        const date = q.date;
        if (!serviceId || !date) return jsonRes({ error: "missing_fields", detail: "serviceId, date" }, 400);
        // Reprogramar no debe quedar bloqueado por la propia cita que se mueve.
        return jsonRes(await nativeListTimes(admin, shopId, {
          serviceId, barberId, addonIds, date, staff: caller.staff,
          excludeAppointmentId: q.excludeAppointmentId,
        }));
      }
      case "check-slot": {
        const startsAt = q.startsAt;
        if (!serviceId || !barberId || !startsAt) {
          return jsonRes({ error: "missing_fields", detail: "serviceId, barberId, startsAt" }, 400);
        }
        const relaxed = caller.staff && body.respectRules !== true;
        const { check } = await nativeCheckSlot(admin, shopId, {
          serviceId, barberId, addonIds, startsAt,
          excludeAppointmentId: q.excludeAppointmentId,
          ignoreAdvanceRules: relaxed,
          ignoreHours: relaxed,
          staff: caller.staff,
        });
        return jsonRes(check);
      }

      case "get-appointment": {
        if (!appointmentId) return jsonRes({ error: "missing_fields", detail: "appointmentId" }, 400);
        const row = await ownAppointment(appointmentId);
        return row ? jsonRes(row) : jsonRes({ error: "appointment_not_found" }, 404);
      }

      case "create": {
        if (!caller.staff) return staffOnly();
        const startsAt = q.startsAt;
        const client = (body.client && typeof body.client === "object" ? body.client : {}) as Record<string, unknown>;
        if (!serviceId || !barberId || !startsAt) {
          return jsonRes({ error: "missing_fields", detail: "serviceId, barberId, startsAt" }, 400);
        }
        if (!canWriteBarber(caller, barberId)) return notYourCalendar();
        // El staff ignora las reglas de anticipacion (como admin=true en Acuity); con
        // respectAvailability tambien debe caer dentro del horario de trabajo.
        const respect = body.respectAvailability === true;
        const { check } = await nativeCheckSlot(admin, shopId, {
          serviceId, barberId, addonIds, startsAt,
          ignoreAdvanceRules: true,
          ignoreHours: !respect,
          staff: true,
        });
        if (!check.ok) return jsonRes({ error: "slot_unavailable", reason: check.reason }, 409);

        const source = str(body.bookingSource) ?? "admin_manual";
        if (!BOOKING_SOURCES.has(source)) return jsonRes({ error: "invalid_booking_source" }, 400);
        // El pago nunca lo fija el navegador: staff no puede marcar una cita como pagada desde aqui.
        const priceCents = Number.isFinite(Number(body.priceCents)) && body.priceCents !== null && body.priceCents !== undefined
          ? Math.max(0, Math.round(Number(body.priceCents)))
          : null;

        const { data, error } = await admin.rpc("book_native_slot", {
          _shop_id: shopId,
          _barber_id: barberId,
          _service_id: serviceId,
          _starts_at: check.startsAt,
          _client: {
            client_id: str(client.client_id) ?? str(client.clientId),
            first_name: str(client.first_name) ?? str(client.firstName),
            last_name: str(client.last_name) ?? str(client.lastName),
            phone: str(client.phone),
            email: str(client.email),
          },
          _addon_ids: addonIds,
          _notes: str(body.notes),
          _booking_source: source,
          _created_by_role: caller.manager ? "admin" : (caller.role ?? "staff"),
          _created_by_user_id: caller.userId,
          _payment: {},
          _price_cents: priceCents,
          _draft_id: null,
          _recurring_group_id: str(body.recurringGroupId),
          _label: str(body.label),
          // Reserva de staff: servicios privados y barberos no reservables estan permitidos (el motor ya lo valido).
          _as_staff: true,
        });
        if (error || !data) {
          const e = nativeRpcError(error);
          return jsonRes({ error: e instanceof BookingRejectedError ? e.reason : "native_booking_failed", detail: e.message }, rejectedStatus(e));
        }
        return jsonRes(data);
      }

      case "update": {
        if (!caller.staff) return staffOnly();
        if (!appointmentId) return jsonRes({ error: "missing_fields", detail: "appointmentId" }, 400);
        const row = await ownAppointment(appointmentId);
        if (!row) return jsonRes({ error: "appointment_not_found" }, 404);
        if (!canWriteBarber(caller, row.barber_id)) return notYourCalendar();

        const patch: Record<string, unknown> = {};
        const addonsGiven = body.addonIds !== undefined || body.addonIDs !== undefined;
        if (serviceId || addonsGiven) {
          const svcId = serviceId ?? row.service_ref_id;
          if (!svcId) return jsonRes({ error: "service_unavailable", detail: "appointment has no native service" }, 409);
          const { data: svc } = await admin
            .from("services")
            .select("id,name,duration_minutes,is_active")
            .eq("id", svcId)
            .maybeSingle();
          if (!svc || !svc.is_active) return jsonRes({ error: "service_unavailable" }, 404);
          const ids: string[] = [...new Set<string>(addonsGiven ? addonIds : (Array.isArray(row.addon_ref_ids) ? row.addon_ref_ids.map(String) : []))];
          type AddonRow = { id: string; name: string; duration_minutes: number; is_active: boolean };
          let addonRows: AddonRow[] = [];
          if (ids.length > 0) {
            const { data } = await admin.from("service_addons").select("id,name,duration_minutes,is_active").in("id", ids);
            const byId = new Map(((data ?? []) as AddonRow[]).filter((a) => a.is_active).map((a) => [a.id, a]));
            if (byId.size !== ids.length) return jsonRes({ error: "addon_unavailable" }, 404);
            addonRows = ids.map((id) => byId.get(id)!); // en el orden pedido, alineado con addon_ref_ids
          }
          const duration = Number(svc.duration_minutes) + addonRows.reduce((s, a) => s + (Number(a.duration_minutes) || 0), 0);
          patch.service_ref_id = svc.id;
          patch.service_name = svc.name;
          patch.addon_ref_ids = ids;
          patch.addons = addonRows.map((a) => a.name);
          // NO se toca price_cents: el precio (y edit_line_items) los fija el staff de forma explicita.
          // Una cita mas larga debe seguir libre de bloqueos, reservas temporales y choques: el cambio
          // de duracion pasa por la funcion de reprogramar.
          if (duration !== Number(row.duration_minutes)) {
            const { data: moved, error: moveErr } = await admin.rpc("reschedule_native_appointment", {
              _appointment_id: row.id,
              _starts_at: row.starts_at,
              _barber_id: row.barber_id,
              _duration_minutes: duration,
            });
            if (moveErr || !moved) {
              const e = nativeRpcError(moveErr);
              return jsonRes({ error: e instanceof BookingRejectedError ? e.reason : "native_update_failed", detail: e.message }, rejectedStatus(e));
            }
          }
        }
        if (body.priceCents !== undefined && body.priceCents !== null && Number.isFinite(Number(body.priceCents))) {
          patch.price_cents = Math.max(0, Math.round(Number(body.priceCents)));
        }
        if (body.editLineItems !== undefined) patch.edit_line_items = body.editLineItems;
        if (body.notes !== undefined) patch.notes = str(body.notes);
        const client = (body.client && typeof body.client === "object" ? body.client : body) as Record<string, unknown>;
        const first = str(client.firstName) ?? str(client.first_name);
        const last = str(client.lastName) ?? str(client.last_name);
        if (first) patch.client_name = [first, last].filter(Boolean).join(" ");
        if (client.email !== undefined) {
          const email = str(client.email)?.toLowerCase() ?? null;
          patch.client_email = email && !email.endsWith("@placeholder.local") ? email : null;
        }
        if (client.phone !== undefined) patch.client_phone = str(client.phone);
        if (Object.keys(patch).length === 0) return jsonRes(row);

        const { data, error } = await admin.from("appointments").update(patch).eq("id", row.id).select("*").maybeSingle();
        if (error) {
          const e = nativeRpcError(error);
          return jsonRes({ error: e instanceof BookingRejectedError ? e.reason : "native_update_failed", detail: e.message }, rejectedStatus(e));
        }
        return jsonRes(data);
      }

      case "reschedule": {
        const startsAt = q.startsAt;
        if (!appointmentId || !startsAt) return jsonRes({ error: "missing_fields", detail: "appointmentId, startsAt" }, 400);
        const row = await ownAppointment(appointmentId);
        if (!row) return jsonRes({ error: "appointment_not_found" }, 404);
        // Las citas heredadas de Acuity (acuity_id puesto) tambien se reprograman aqui una vez la tienda es nativa.
        if (!row.service_ref_id) return jsonRes({ error: "service_unavailable", detail: "appointment has no native service" }, 409);
        const targetBarber = str(body.barberId) ?? row.barber_id;
        // Un barbero reprograma solo en su calendario (origen y destino); un cliente, solo sus citas.
        if (caller.staff && !(canWriteBarber(caller, row.barber_id) && canWriteBarber(caller, targetBarber))) return notYourCalendar();

        // Los clientes siguen las reglas de reserva; el staff solo evita choques y bloqueos
        // (y el horario de trabajo si respectAvailability esta puesto).
        const relaxed = caller.staff && body.respectAvailability !== true;
        const { check } = await nativeCheckSlot(admin, shopId, {
          serviceId: row.service_ref_id,
          barberId: targetBarber,
          addonIds: Array.isArray(row.addon_ref_ids) ? row.addon_ref_ids : [],
          startsAt,
          excludeAppointmentId: row.id,
          ignoreAdvanceRules: caller.staff,
          ignoreHours: relaxed,
          staff: caller.staff,
        });
        if (!check.ok) return jsonRes({ error: "slot_unavailable", reason: check.reason }, 409);

        const { data, error } = await admin.rpc("reschedule_native_appointment", {
          _appointment_id: row.id,
          _starts_at: check.startsAt,
          _barber_id: targetBarber,
        });
        if (error || !data) {
          const e = nativeRpcError(error);
          return jsonRes({ error: e instanceof BookingRejectedError ? e.reason : "native_reschedule_failed", detail: e.message }, rejectedStatus(e));
        }
        const updated = data as Record<string, unknown>;
        if (body.noEmail !== true && row.client_id) {
          queueOrDispatchRecurringPush({
            admin,
            client_id: row.client_id,
            appointment_id: row.id,
            recurring_group_id: row.recurring_group_id ?? null,
            template_name: "appointment_rescheduled",
            starts_at: String(updated.starts_at),
            service: row.service_name ?? null,
            barber: null,
            event_key: `appt:${row.id}:reschedule:${String(updated.starts_at)}`,
          }).catch((e) => console.warn("[native-scheduling] push warn:", (e as Error).message));
        }
        return jsonRes(updated);
      }

      case "cancel": {
        if (!caller.staff) return staffOnly();
        if (!appointmentId) return jsonRes({ error: "missing_fields", detail: "appointmentId" }, 400);
        const row = await ownAppointment(appointmentId);
        if (!row) return jsonRes({ error: "appointment_not_found" }, 404);
        if (!canWriteBarber(caller, row.barber_id)) return notYourCalendar();
        const { data, error } = await admin.rpc("cancel_native_appointment", {
          _appointment_id: row.id,
          _reason: str(body.reason),
          _cancelled_by_role: caller.role === "barber" ? "barber" : "owner",
          _actor_user_id: caller.userId,
        });
        if (error || !data) {
          const e = nativeRpcError(error);
          return jsonRes({ error: e instanceof BookingRejectedError ? e.reason : "native_cancel_failed", detail: e.message }, rejectedStatus(e));
        }
        if (body.noEmail !== true && row.client_id && row.status === "scheduled") {
          queueOrDispatchRecurringPush({
            admin,
            client_id: row.client_id,
            appointment_id: row.id,
            recurring_group_id: row.recurring_group_id ?? null,
            template_name: "appointment_cancelled_by_shop",
            starts_at: String(row.starts_at),
            service: row.service_name ?? null,
            barber: null,
            event_key: `appt:${row.id}:cancel`,
          }).catch((e) => console.warn("[native-scheduling] push warn:", (e as Error).message));
        }
        return jsonRes(data);
      }

      default:
        return jsonRes({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    const status = nativeErrorStatus(e);
    const code = nativeErrorCode(e);
    console.error(JSON.stringify({ event: "native_scheduling_failed", action, shop_id: shopId, user_id: userId, code, status, detail: (e as Error).message }));
    return jsonRes({ error: code, detail: (e as Error).message }, status);
  }
});
