// Adaptador de UNA sola tienda para la agenda nativa.
//
// El codigo de agenda nativa (que viene del diseño multi-tienda de la rama Hasib) necesita saber
// "de que tienda hablamos". Hoy este proyecto opera una sola barberia, asi que la tienda es la unica
// tienda activa. Cuando llegue el multi-tienda, esta es la unica pieza que se cambia (por la
// resolucion por dominio o por membresia), sin tocar los motores de disponibilidad ni de reserva.
//
// deno-lint-ignore-file no-explicit-any

export class ShopContextError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.name = "ShopContextError";
    this.code = code;
  }
}

/** Id de la unica tienda activa. Falla de forma explicita si no hay exactamente una. */
export async function resolveSingleShop(admin: { from: (t: string) => any; rpc: (...a: any[]) => any }): Promise<string> {
  const rpc = await admin.rpc("resolve_single_active_shop");
  if (!rpc.error && typeof rpc.data === "string" && rpc.data) return rpc.data;

  const { data, error } = await admin.from("shops").select("id").eq("is_active", true).limit(2);
  if (error) throw new ShopContextError("shop_context_missing");
  if (!data || data.length !== 1) throw new ShopContextError("shop_context_missing");
  return String(data[0].id);
}
