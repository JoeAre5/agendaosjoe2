import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";

export default function BookingPolicy() {
  const { language } = useTranslation();
  const es = language === "es";

  return (
    <>
    <SEOHead
      title={es ? "Política de Reservas y No-Show · Charlie's Barbershop" : "Booking & No-Show Policy · Charlie's Barbershop"}
      description={es ? "Reglas para reservar, modificar, cancelar y honrar citas en Charlie's Barbershop." : "Rules for booking, modifying, canceling and honoring appointments at Charlie's Barbershop."}
      path="/politica-reservas"
    />
    <div className="max-w-3xl mx-auto px-5 py-16 pb-28 md:pb-16">
      <h1
        className="font-black uppercase leading-[0.95] mb-6"
        style={{ fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-1px", color: "var(--text-primary)" }}
      >
        {es ? "Política de Reservas y No-Show" : "Booking & No-Show Policy"}
      </h1>
      <p className="text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
        {es ? "Última actualización: 14 de mayo de 2026 · Vigente desde: 14 de mayo de 2026" : "Last updated: May 14, 2026 · Effective: May 14, 2026"}
      </p>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        <section>
          <p>
            {es
              ? "Esta Política de Reservas y No-Show forma parte integral de los Términos y Condiciones de C&O Ventures, LLC dba Charlie's Barbershop. Al reservar una cita, aceptas estas reglas."
              : "This Booking and No-Show Policy is incorporated into and forms part of the Terms and Conditions of C&O Ventures, LLC dba Charlie's Barbershop. By booking an appointment, you agree to these rules."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "1. Cómo Reservar" : "1. How to Book"}
          </h2>
          <p>
            {es
              ? "Las citas pueden reservarse en línea desde nuestro sitio o PWA, o en persona en el local. Se requiere proporcionar nombre, teléfono y correo válidos. Algunos servicios pueden requerir el pago al momento de reservar para asegurar el espacio."
              : "Appointments can be booked online from our site or PWA, or in person at the location. Valid name, phone and email are required. Some services may require payment at the time of booking to secure the slot."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "2. Confirmaciones y Recordatorios" : "2. Confirmations and Reminders"}
          </h2>
          <p>
            {es
              ? "Recibirás confirmación por correo, SMS y/o notificación push una vez creada la cita. Los recordatorios se envían 24 horas y 2 horas antes de tu cita. Es responsabilidad del cliente revisar estos avisos y mantener el dispositivo accesible."
              : "You will receive confirmation by email, SMS and/or push notification once the appointment is created. Reminders are sent 24 hours and 2 hours before your appointment. It is the client's responsibility to check these notices and keep the device accessible."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "3. Ventana de Cancelación y Reagendamiento" : "3. Cancellation and Rescheduling Window"}
          </h2>
          <p>
            {es
              ? "Puedes cancelar o reagendar tu cita por la plataforma hasta las "
              : "You can cancel or reschedule your appointment through the platform until "}
            <strong>{es ? "11:59 PM (hora de Puerto Rico, AST) del día anterior a la cita" : "11:59 PM (Puerto Rico time, AST) the day before the appointment"}</strong>
            {es
              ? ". A partir de las 12:00 AM del día de la cita, los cambios deben coordinarse directamente con el Barbero por teléfono o WhatsApp y quedan sujetos a su discreción."
              : ". Starting at 12:00 AM on the day of the appointment, changes must be coordinated directly with the Barber by phone or WhatsApp and are subject to their discretion."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "4. Excepciones a Discreción del Barbero" : "4. Exceptions at Barber Discretion"}
          </h2>
          <p>
            {es
              ? "El Barbero puede aceptar excepciones fuera de la ventana evaluando: (a) historial del cliente (nuevo, recurrente con buena reputación, recurrente con historial de no-shows); (b) urgencia o circunstancia atenuante; (c) impacto en la agenda. Las decisiones se toman caso por caso y son finales."
              : "The Barber may accept out-of-window exceptions by evaluating: (a) client history (new, returning in good standing, returning with no-show history); (b) urgency or mitigating circumstance; (c) schedule impact. Decisions are made case by case and are final."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "5. No-Show" : "5. No-Show"}
          </h2>
          <p>
            {es
              ? "Si reservaste y pagaste, y no te presentaste sin cancelar dentro de la ventana, "
              : "If you booked and paid, and did not show up without canceling within the window, "}
            <strong>{es ? "se cobra el monto total y no es reembolsable" : "the full amount is charged and non-refundable"}</strong>
            {es
              ? ". Esto compensa el tiempo bloqueado y la pérdida de oportunidad para otro cliente. Tres (3) o más no-shows pueden resultar en la suspensión de la cuenta o la exigencia de prepago obligatorio para futuras citas."
              : ". This compensates for the blocked time and the lost opportunity for another client. Three (3) or more no-shows may result in account suspension or mandatory prepayment for future appointments."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "6. Llegadas Tarde" : "6. Late Arrivals"}
          </h2>
          <p>
            {es
              ? "Recomendamos llegar 5 minutos antes. Una llegada con más de 10 minutos de retraso puede resultar en: (a) un servicio reducido para no afectar al siguiente cliente, sin descuento en el precio; o (b) la reprogramación o cancelación a discreción del Barbero, con tratamiento equivalente a no-show si el retraso impide ejecutar el servicio."
              : "We recommend arriving 5 minutes early. Arrivals more than 10 minutes late may result in: (a) a shortened service so as not to affect the next client, with no price reduction; or (b) rescheduling or cancellation at the Barber's discretion, with treatment equivalent to no-show if the delay prevents the service from being performed."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "7. Citas Recurrentes" : "7. Recurring Appointments"}
          </h2>
          <p>
            {es
              ? "Las citas recurrentes (cada semana, dos semanas, mes) se crean como ocurrencias individuales y cada una se rige independientemente por esta política. Cancelar una ocurrencia no cancela la serie; cancelar la serie debe coordinarse expresamente con el Barbero."
              : "Recurring appointments (weekly, biweekly, monthly) are created as individual occurrences and each is governed independently by this policy. Canceling one occurrence does not cancel the series; canceling the series must be expressly coordinated with the Barber."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "8. Cambios por Parte del Negocio" : "8. Business-Initiated Changes"}
          </h2>
          <p>
            {es
              ? "Si necesitamos cancelar o reagendar tu cita por causas atribuibles a nosotros, te notificaremos lo antes posible y te ofreceremos un nuevo espacio prioritario o reembolso completo a tu elección, según la "
              : "If we need to cancel or reschedule your appointment for causes attributable to us, we will notify you as soon as possible and offer you a priority new slot or full refund at your choice, in accordance with the "}
            <Link to="/reembolsos" className="underline" style={{ color: "var(--text-primary)" }}>
              {es ? "Política de Reembolsos" : "Refund Policy"}
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "9. Salud y Seguridad" : "9. Health and Safety"}
          </h2>
          <p>
            {es
              ? "Por respeto al personal y demás clientes, te pedimos no asistir si presentas síntomas contagiosos (fiebre, gripe, conjuntivitis, infecciones de la piel del cuero cabelludo). En estos casos, contacta al Barbero para reagendar; se aplicará la mayor flexibilidad razonable."
              : "Out of respect for staff and other clients, we ask you not to attend if you have contagious symptoms (fever, flu, conjunctivitis, scalp skin infections). In these cases, contact the Barber to reschedule; the greatest reasonable flexibility will be applied."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "10. Contacto" : "10. Contact"}
          </h2>
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
            C&O Ventures, LLC d/b/a Charlie's Barbershop<br />
            PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627<br />
            WhatsApp / Tel: +1 (787) 348-1281
          </p>
        </section>

        <section className="pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {es ? "Documentos relacionados:" : "Related documents:"}{" "}
            <Link to="/terminos" className="underline">{es ? "Términos y Condiciones" : "Terms & Conditions"}</Link>{" · "}
            <Link to="/privacidad" className="underline">{es ? "Política de Privacidad" : "Privacy Policy"}</Link>{" · "}
            <Link to="/reembolsos" className="underline">{es ? "Política de Reembolsos" : "Refund Policy"}</Link>
          </p>
        </section>
      </div>
    </div>
    </>
  );
}
