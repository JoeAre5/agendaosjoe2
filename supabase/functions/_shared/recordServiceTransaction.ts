// Guarda la transaccion de SERVICIO de una reserva pagada UNA sola vez.
//
// Por que existe: commitDraft puede ejecutarse dos veces casi a la vez para el mismo pago (la pantalla
// de confirmacion, el webhook de Stripe, un reintento). La segunda ejecucion reutiliza la cita ya creada
// y, sin esta guarda, volvia a insertar la transaccion: el cobro de Stripe era uno y la app mostraba dos
// (y los reportes sumaban el doble). La restriccion unica de athmovil_transaction_id solo cubria ATH Movil.
//
// Defensa en dos capas:
//   1. Antes de insertar, busca una transaccion de servicio completada de ESA cita y ese metodo de pago.
//   2. Si dos llamadas pasan la busqueda a la vez, el indice unico de la migracion 0030 rechaza la segunda
//      (23505) y aqui se trata como "ya existia", no como error.
// deno-lint-ignore-file no-explicit-any

export type ServiceTransactionRow = {
  appointment_id: string;
  payment_method: string;
  stripe_payment_id?: string | null;
  [key: string]: unknown;
};

export type RecordResult = "inserted" | "exists" | "error";

export async function recordServiceTransactionOnce(
  admin: any,
  row: ServiceTransactionRow,
  log: (msg: string) => void = (m) => console.log(m),
): Promise<RecordResult> {
  try {
    let q = admin
      .from("transactions")
      .select("id")
      .eq("appointment_id", row.appointment_id)
      .eq("type", "service")
      .eq("status", "completed")
      .eq("payment_method", row.payment_method);
    if (row.stripe_payment_id) q = q.eq("stripe_payment_id", row.stripe_payment_id);
    const { data: existing } = await q.limit(1).maybeSingle();
    if (existing) {
      log(`[commitDraft] Service transaction already recorded (${existing.id}) — skipping insert`);
      return "exists";
    }
  } catch (e) {
    // Si la busqueda falla, se intenta insertar igual: el indice unico sigue protegiendo.
    log(`[commitDraft] existing-transaction lookup warning: ${(e as Error).message}`);
  }

  const { error } = await admin.from("transactions").insert(row);
  if (!error) return "inserted";
  if ((error as { code?: string }).code === "23505") {
    log("[commitDraft] Service transaction insert rejected as duplicate (23505) — already recorded");
    return "exists";
  }
  log(`[commitDraft] Service transaction insert warning: ${error.message}`);
  return "error";
}
