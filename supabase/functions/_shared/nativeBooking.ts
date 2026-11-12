// Agenda nativa: proveedor de la tienda y traduccion de errores de las funciones SQL de reserva.
//
//   acuity : la cita vive en Acuity y la fila local la refleja (acuity_id puesto).
//   native : la cita vive solo en esta base de datos; book_native_slot() la inserta.
//
// El proveedor sale de shops.booking_provider. Una tienda inactiva o desconocida es 'external'
// (nada reservable).
//
// deno-lint-ignore-file no-explicit-any

type Client = { from: (table: string) => any; rpc: (...args: any[]) => any };

export type BookingProviderKind = "acuity" | "native" | "external";

export interface ShopProvider {
  shopId: string;
  kind: BookingProviderKind;
  timezone: string;
  isActive: boolean;
}

export async function getShopProvider(admin: Client, shopId: string): Promise<ShopProvider> {
  const { data } = await admin
    .from("shops")
    .select("id,booking_provider,timezone,is_active")
    .eq("id", shopId)
    .maybeSingle();
  const kind = (data?.booking_provider as BookingProviderKind) ?? "external";
  return {
    shopId,
    kind: data?.is_active ? kind : "external",
    timezone: (data?.timezone as string) || "America/Puerto_Rico",
    isActive: data?.is_active === true,
  };
}

/** El proveedor rechazo la reserva (horario ocupado, solicitud invalida...). Resultado comprobado. */
export class BookingRejectedError extends Error {
  reason: string;
  constructor(reason: string, message?: string) {
    super(message ?? reason);
    this.name = "BookingRejectedError";
    this.reason = reason;
  }
}

/** El resultado es desconocido (error de transporte, fallo inesperado de la base). */
export class BookingUncertainError extends Error {
  reason: string;
  constructor(reason: string) {
    super(reason);
    this.name = "BookingUncertainError";
    this.reason = reason;
  }
}

const REJECTED_CODES = new Set([
  "slot_taken", "slot_blocked", "slot_held", "barber_unavailable", "service_unavailable",
  "addon_unavailable", "invalid_time", "invalid_booking_source", "provider_not_native",
  "client_name_required", "forbidden", "appointment_not_found", "appointment_not_active",
]);

/** Error de Postgres -> error de proveedor. Las funciones SQL de reserva lanzan codigos estables. */
export function nativeRpcError(err: { message?: string; code?: string } | null): Error {
  const msg = String(err?.message ?? "native_booking_failed");
  const code = msg.split(/[\s:]/)[0];
  if (REJECTED_CODES.has(code)) return new BookingRejectedError(code, msg);
  return new BookingUncertainError(`native_rpc_error: ${msg}`);
}
