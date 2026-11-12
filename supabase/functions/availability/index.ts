// Disponibilidad publica para tiendas con agenda nativa (shops.booking_provider = 'native').
//
// Sin autenticacion. La tienda es la unica tienda activa (ver _shared/singleShop.ts); el
// navegador nunca manda un id de tienda. Las tiendas que no corren en modo nativo reciben
// 409 provider_not_native. Todo fallo es un error, nunca "no hay horarios".
//
// POST { action, ... }
//   list-calendars                              -> [{ id, name, avatarUrl, barberId }]
//   list-services                               -> [{ id, name, duration, price, calendarIDs, addonIDs, ... }]
//   list-addons                                 -> [{ id, name, duration, price, calendarIDs }]
//   list-dates  { serviceId, barberId?, addonIds?, month }  -> [{ date }]
//   list-times  { serviceId, barberId?, addonIds?, date }   -> [{ time, endTime, slotsAvailable, barberId }]
//   check-slot  { serviceId, barberId, addonIds?, startsAt } -> { ok, reason?, startsAt?, endsAt? }
//
// Alias aceptados por el flujo publico de reserva existente:
//   appointmentTypeID = serviceId, calendarID = barberId, addonIDs = addonIds.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ShopContextError, resolveSingleShop } from "../_shared/singleShop.ts";
import { getShopProvider } from "../_shared/nativeBooking.ts";
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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
  let shopId: string;
  try {
    shopId = await resolveSingleShop(admin);
  } catch (e) {
    console.error(JSON.stringify({ event: "shop_context_missing", fn: "availability", action }));
    return jsonRes({ error: e instanceof ShopContextError ? e.code : "shop_context_missing", detail: "Unknown shop for this request." }, 400);
  }
  const provider = await getShopProvider(admin, shopId);
  if (provider.kind !== "native") return jsonRes({ error: "provider_not_native" }, 409);

  // Los llamadores publicos nunca excluyen citas ni ven entradas no publicas.
  const { serviceId, barberId, addonIds, month, date, startsAt } = parseCatalogQuery(body);

  try {
    switch (action) {
      case "list-calendars":
        return jsonRes(await nativeListCalendars(admin, shopId));
      case "list-services":
        return jsonRes(await nativeListServices(admin, shopId));
      case "list-addons":
        return jsonRes(await nativeListAddons(admin, shopId));
      case "list-dates": {
        if (!serviceId || !month) return jsonRes({ error: "missing_fields", detail: "serviceId, month" }, 400);
        return jsonRes(await nativeListDates(admin, shopId, { serviceId, barberId, addonIds, month }));
      }
      case "list-times": {
        if (!serviceId || !date) return jsonRes({ error: "missing_fields", detail: "serviceId, date" }, 400);
        return jsonRes(await nativeListTimes(admin, shopId, { serviceId, barberId, addonIds, date }));
      }
      case "check-slot": {
        if (!serviceId || !barberId || !startsAt) {
          return jsonRes({ error: "missing_fields", detail: "serviceId, barberId, startsAt" }, 400);
        }
        const { check } = await nativeCheckSlot(admin, shopId, { serviceId, barberId, addonIds, startsAt });
        return jsonRes(check);
      }
      default:
        return jsonRes({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    const status = nativeErrorStatus(e);
    const code = nativeErrorCode(e);
    console.error(JSON.stringify({ event: "availability_failed", fn: "availability", action, shop_id: shopId, code, status, detail: (e as Error).message }));
    return jsonRes({ error: code, detail: status >= 500 ? "availability_unavailable" : (e as Error).message }, status);
  }
});
