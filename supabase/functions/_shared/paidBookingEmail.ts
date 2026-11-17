// Correo de confirmacion de una reserva PAGADA, para que todas las rutas que confirman un pago lo manden.
//
// Antes solo lo mandaba el camino "commit-and-book" de pay-then-book. La reserva con Stripe Checkout
// (sondeo de la pantalla de confirmacion y webhook de Stripe) llamaba a commitDraft y nunca enviaba el
// correo: el cliente pagaba y no recibia confirmacion. commitDraft ahora lo envia, UNA vez (solo la
// llamada que de verdad cierra el borrador), y respeta el interruptor app_booking_emails (0026).
// deno-lint-ignore-file no-explicit-any
import { appBookingEmailsEnabled } from "./appEmailSwitch.ts";

export interface PaidBookingEmailInput {
  email: string | null | undefined;
  firstName: string | null | undefined;
  appointmentId: string;
  /** Id de Acuity; null en tiendas nativas. */
  acuityId: number | null;
  startsAt: string;
  serviceName: string;
  barberName: string | null | undefined;
  amountPaidCents: number;
}

/** Misma clave que usa pay-then-book, para que un mismo pago nunca genere dos claves distintas. */
export function paidBookingEmailKey(acuityId: number | null, appointmentId: string): string {
  return `booking-paid-${acuityId ?? appointmentId}`;
}

/** true = se pidio el envio; false = no aplica (sin correo o interruptor apagado) o fallo al pedirlo. */
export async function sendPaidBookingConfirmation(admin: any, input: PaidBookingEmailInput): Promise<boolean> {
  const email = (input.email ?? "").trim();
  if (!email) return false;
  if (!(await appBookingEmailsEnabled(admin))) return false;

  const dateLabel = new Date(input.startsAt).toLocaleString("es-PR", {
    weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/Puerto_Rico",
  });
  try {
    const { error } = await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName: "booking-confirmation",
        recipientEmail: email,
        idempotencyKey: paidBookingEmailKey(input.acuityId, input.appointmentId),
        templateData: {
          clientName: input.firstName,
          serviceName: input.serviceName,
          barberName: input.barberName,
          appointmentDate: dateLabel,
          totalLabel: `$${(input.amountPaidCents / 100).toFixed(2)}`,
          isPaid: true,
        },
      },
    });
    if (error) {
      console.error("[commitDraft] paid confirmation email failed:", (error as Error).message ?? error);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[commitDraft] paid confirmation email failed:", (e as Error).message);
    return false;
  }
}
