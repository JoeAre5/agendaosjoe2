// Que agenda usa la tienda (agenda nativa).
//
//   acuity   – las citas viven en Acuity; el navegador habla con `acuity-proxy`
//   native   – las citas viven solo en esta base de datos; el navegador habla con
//              `native-scheduling` (staff / clientes) y `public-booking-create`
//   external – sin reserva en linea
//
// Se resuelve una vez desde `shops.booking_provider` y se guarda en cache. Hoy hay una sola tienda
// activa (ver supabase/functions/_shared/singleShop.ts), asi que se lee esa fila. Si no se puede
// leer o no hay exactamente una tienda, se cae a Acuity, que es lo que asumia toda pantalla antes
// de la agenda nativa: ante la duda, nada cambia.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type BookingProviderKind = "acuity" | "native" | "external";

export interface ShopProviderInfo {
  shopId: string | null;
  kind: BookingProviderKind;
  /** Compatibilidad: true mientras la tienda siga en Acuity. */
  acuityEnabled: boolean;
  timezone: string;
}

const FALLBACK: ShopProviderInfo = { shopId: null, kind: "acuity", acuityEnabled: true, timezone: "America/Puerto_Rico" };

let cached: ShopProviderInfo | null = null;
let inflight: Promise<ShopProviderInfo> | null = null;

/** Proveedor de la tienda; se guarda en cache tras la primera lectura. */
export async function getShopProvider(force = false): Promise<ShopProviderInfo> {
  if (!force && cached) return cached;
  if (inflight && !force) return inflight;
  inflight = (async () => {
    let info: ShopProviderInfo = FALLBACK;
    let resolved = false;
    try {
      // 1) Funcion segura legible por todos (visitantes y clientes no pueden leer `shops`).
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)("get_shop_booking_provider");
      const r = rpcData as { shop_id?: string; booking_provider?: string; timezone?: string } | null;
      if (!rpcError && r?.shop_id) {
        const kind = (r.booking_provider as BookingProviderKind) || "acuity";
        info = { shopId: r.shop_id, kind, acuityEnabled: kind === "acuity", timezone: r.timezone || FALLBACK.timezone };
        resolved = true;
      } else {
        // 2) Respaldo: lectura directa (staff). Sirve mientras la funcion no este desplegada.
        const { data } = await supabase
          .from("shops")
          .select("id, booking_provider, timezone, is_active")
          .eq("is_active", true)
          .limit(2);
        if (data && data.length === 1) {
          const row = data[0];
          const kind = (row.booking_provider as BookingProviderKind) || "acuity";
          info = { shopId: row.id, kind, acuityEnabled: kind === "acuity", timezone: row.timezone || FALLBACK.timezone };
          resolved = true;
        }
      }
    } catch {
      /* se conserva el valor por defecto (Acuity) */
    }
    // Solo se guarda en cache una lectura real: un fallo transitorio no debe dejar la sesion en Acuity.
    if (resolved) cached = info;
    inflight = null;
    return info;
  })();
  return inflight;
}

/** Hook de React: `{ provider, isNative, loading }` para la tienda. */
export function useShopProvider() {
  const [provider, setProvider] = useState<ShopProviderInfo | null>(cached);
  useEffect(() => {
    let alive = true;
    getShopProvider().then((p) => {
      if (alive) setProvider(p);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { provider, isNative: provider?.kind === "native", loading: provider === null };
}
