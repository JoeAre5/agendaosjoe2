// Interruptor del correo de confirmacion de reserva de la app (ver 0026_app_booking_email_switch.sql).
// Cuando un CRM envia los correos desde los webhooks de salida, se apaga el de la app para no
// duplicarlo. Encendido por defecto: ante cualquier duda o error se sigue enviando como siempre.
// deno-lint-ignore-file no-explicit-any
export async function appBookingEmailsEnabled(admin: any): Promise<boolean> {
  try {
    const { data, error } = await admin.from("outbound_webhook_config").select("app_booking_emails").eq("id", true).maybeSingle();
    if (error || !data) return true;
    return data.app_booking_emails !== false;
  } catch {
    return true;
  }
}
