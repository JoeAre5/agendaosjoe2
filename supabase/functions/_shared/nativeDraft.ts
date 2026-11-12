// Agenda nativa: piezas compartidas por las reservas pagadas (borrador -> pago -> cita).
//
//   nativeShopFor(admin, draft)   proveedor de la tienda de un borrador (o de la tienda unica)
//   nativeQuote(...)              precio y rango horario de una reserva, desde el catalogo local y
//                                 las mismas reglas que ve el cliente (nunca desde el navegador)
//
// El precio sale de services/service_addons de la base propia. La disponibilidad usa el mismo motor
// que la pagina publica, asi que "lo que se cobra" y "lo que se ofrecio" no pueden divergir.
//
// deno-lint-ignore-file no-explicit-any
import { getShopProvider, type ShopProvider } from "./nativeBooking.ts";
import { resolveSingleShop } from "./singleShop.ts";
import { nativeCheckSlot, nativeErrorCode, nativeErrorStatus } from "./native/catalog.ts";

type Client = { from: (table: string) => any; rpc: (...args: any[]) => any };

/** Proveedor de la tienda de un borrador; si el borrador no trae shop_id, la tienda unica. */
export async function nativeShopFor(admin: Client, draft?: { shop_id?: string | null } | null): Promise<ShopProvider & { shopId: string }> {
  const shopId = draft?.shop_id || (await resolveSingleShop(admin as any));
  return await getShopProvider(admin, shopId);
}

export interface NativeQuoteInput {
  serviceId: string;
  barberId: string;
  addonIds: string[];
  startsAt: string;
}

export type NativeQuote =
  | {
      ok: true;
      startsAt: string;
      endsAt: string;
      serviceName: string;
      serviceCents: number;
      addonsCents: number;
      totalDurationMinutes: number;
    }
  | { ok: false; error: string; status: number };

/**
 * Valida el horario con las reglas publicas (anticipacion, horario, bloqueos, citas, reservas
 * temporales) y devuelve el precio del catalogo. No escribe nada.
 */
export async function nativeQuote(admin: Client, shopId: string, q: NativeQuoteInput): Promise<NativeQuote> {
  try {
    const { check, service, addons } = await nativeCheckSlot(admin as any, shopId, {
      serviceId: q.serviceId,
      barberId: q.barberId,
      addonIds: q.addonIds,
      startsAt: q.startsAt,
      staff: false,
    });
    if (!check.ok) return { ok: false, error: "slot_unavailable", status: 409 };
    const startMs = new Date(check.startsAt).getTime();
    const endMs = new Date(check.endsAt).getTime();
    return {
      ok: true,
      startsAt: check.startsAt,
      endsAt: check.endsAt,
      serviceName: service.name,
      serviceCents: Math.max(0, Number(service.price_cents) || 0),
      addonsCents: addons.reduce((s, a) => s + Math.max(0, Number(a.price_cents) || 0), 0),
      totalDurationMinutes: Math.round((endMs - startMs) / 60000),
    };
  } catch (e) {
    return { ok: false, error: nativeErrorCode(e), status: nativeErrorStatus(e) };
  }
}

/**
 * True when the shop books natively. Acuity sync/webhook functions use it to stand down: once a shop
 * is native its own database is the source of truth, and an Acuity event must never rewrite it.
 * A lookup failure returns false (the Acuity functions behave exactly as before).
 */
export async function isNativeMode(admin: Client): Promise<boolean> {
  try {
    return (await nativeShopFor(admin, null)).kind === "native";
  } catch {
    return false;
  }
}
