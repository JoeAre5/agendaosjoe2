import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";

export default function RefundPolicy() {
  const { language } = useTranslation();
  const es = language === "es";

  return (
    <>
    <SEOHead
      title={es ? "Política de Reembolsos · Charlie's Barbershop" : "Refund Policy · Charlie's Barbershop"}
      description={es ? "Cómo solicitar y procesar reembolsos en Charlie's Barbershop. Todos los reembolsos se gestionan manualmente." : "How to request and process refunds at Charlie's Barbershop. All refunds are handled manually."}
      path="/reembolsos"
    />
    <div className="max-w-3xl mx-auto px-5 py-16 pb-28 md:pb-16">
      <h1
        className="font-black uppercase leading-[0.95] mb-6"
        style={{ fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-1px", color: "var(--text-primary)" }}
      >
        {es ? "Política de Reembolsos" : "Refund Policy"}
      </h1>
      <p className="text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
        {es ? "Última actualización: 14 de mayo de 2026 · Vigente desde: 14 de mayo de 2026" : "Last updated: May 14, 2026 · Effective: May 14, 2026"}
      </p>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        <section>
          <p>
            {es
              ? "Esta Política de Reembolsos forma parte integral de los Términos y Condiciones de C&O Ventures, LLC dba Charlie's Barbershop. Léela cuidadosamente antes de reservar y pagar una cita."
              : "This Refund Policy is incorporated into and forms part of the Terms and Conditions of C&O Ventures, LLC dba Charlie's Barbershop. Read it carefully before booking and paying for an appointment."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "1. Principio General: Reembolsos Manuales" : "1. General Principle: Manual Refunds"}
          </h2>
          <p>
            {es
              ? "Todos los reembolsos en Charlie's Barbershop se procesan de forma manual por el administrador. La plataforma NO ofrece ningún botón ni acción que dispare un reembolso automático: ni el botón de cancelar, ni el de reagendar, ni ningún otro. La cancelación de una cita en la app no genera, por sí sola, una devolución de dinero."
              : "All refunds at Charlie's Barbershop are processed manually by the administrator. The platform does NOT offer any button or action that triggers an automatic refund: not the cancel button, not the reschedule button, not any other. Canceling an appointment in the app does not, by itself, generate a money-back transaction."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "2. Ventana de Cancelación" : "2. Cancellation Window"}
          </h2>
          <p>
            {es
              ? "El cliente puede cancelar o reagendar a través de la plataforma hasta las "
              : "The client may cancel or reschedule through the platform until "}
            <strong>{es ? "11:59 PM (hora de Puerto Rico, AST) del día anterior a la cita" : "11:59 PM (Puerto Rico time, AST) the day before the appointment"}</strong>
            {es
              ? ". A partir de las 12:00 AM del día de la cita, la cancelación se considera fuera de ventana y, como regla general, no es elegible para reembolso a través de los canales automáticos de la plataforma."
              : ". Starting at 12:00 AM on the day of the appointment, the cancellation is considered out-of-window and, as a general rule, is not eligible for refund through the platform's standard channels."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "3. Discreción del Barbero (Excepciones)" : "3. Barber Discretion (Exceptions)"}
          </h2>
          <p>
            {es
              ? "Si el cliente necesita cancelar o reagendar fuera de la ventana, debe contactar al Barbero directamente por teléfono o WhatsApp. El Barbero puede otorgar excepciones de forma subjetiva, considerando las circunstancias particulares de cada caso. Como guía no vinculante:"
              : "If the client needs to cancel or reschedule outside the window, they must contact the Barber directly by phone or WhatsApp. The Barber may grant exceptions subjectively, considering the particular circumstances of each case. As a non-binding guide:"}
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>
              <strong>{es ? "Cliente nuevo:" : "First-time client:"}</strong>{" "}
              {es ? "tendencia a la mayor flexibilidad." : "tendency toward maximum flexibility."}
            </li>
            <li>
              <strong>{es ? "Cliente recurrente con buena reputación:" : "Returning client in good standing:"}</strong>{" "}
              {es ? "flexibilidad razonable según el contexto." : "reasonable flexibility based on context."}
            </li>
            <li>
              <strong>{es ? "Cliente con historial de no-shows:" : "Client with no-show history:"}</strong>{" "}
              {es ? "menor flexibilidad; las excepciones son improbables." : "reduced flexibility; exceptions are unlikely."}
            </li>
          </ul>
          <p className="mt-2">
            {es
              ? "La decisión final corresponde exclusivamente al Barbero y no es apelable."
              : "The final decision belongs exclusively to the Barber and is not appealable."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "4. No-Show (Inasistencia sin Cancelar)" : "4. No-Show (Failure to Show without Canceling)"}
          </h2>
          <p>
            {es
              ? "Si el cliente reservó y pagó una cita y no se presenta sin haber cancelado dentro de la ventana, "
              : "If the client booked and paid for an appointment and does not show up without canceling within the window, "}
            <strong>{es ? "pierde el monto total pagado" : "the full amount paid is forfeited"}</strong>
            {es
              ? ". Este monto se considera compensación por el tiempo bloqueado en agenda y la oportunidad perdida de servir a otro cliente."
              : ". This amount is considered compensation for the time blocked on the schedule and the lost opportunity to serve another client."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "5. Cómo Solicitar un Reembolso" : "5. How to Request a Refund"}
          </h2>
          <p>
            {es
              ? "Si has cancelado dentro de la ventana (antes de las 11:59 PM del día anterior) y crees que tienes derecho a reembolso, sigue estos pasos:"
              : "If you canceled within the window (before 11:59 PM the day before) and believe you are entitled to a refund, follow these steps:"}
          </p>
          <ol className="list-decimal pl-5 mt-2 space-y-1">
            <li>
              {es
                ? "Contáctanos por WhatsApp al +1 (787) 348-1281 o por correo, indicando: nombre, fecha de la cita cancelada, método de pago usado y monto."
                : "Contact us via WhatsApp at +1 (787) 348-1281 or email, indicating: name, date of the canceled appointment, payment method used and amount."}
            </li>
            <li>
              {es
                ? "El administrador verificará la transacción en Stripe, PayPal o ATH Móvil y confirmará la fecha y hora exacta de la cancelación."
                : "The administrator will verify the transaction in Stripe, PayPal or ATH Móvil and confirm the exact date and time of the cancellation."}
            </li>
            <li>
              {es
                ? "Si la cancelación ocurrió dentro de la ventana, el reembolso se procesará al método original. Si ocurrió fuera, el reembolso será denegado, salvo que aplique una excepción otorgada por el Barbero."
                : "If the cancellation occurred within the window, the refund will be processed to the original method. If it occurred outside, the refund will be denied, unless a Barber-granted exception applies."}
            </li>
          </ol>
          <p className="mt-2">
            {es
              ? "Es responsabilidad del cliente solicitar el reembolso. Si el administrador no es notificado, no hay procesamiento automático."
              : "It is the client's responsibility to request the refund. If the administrator is not notified, no automatic processing occurs."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "6. Tiempos de Procesamiento" : "6. Processing Times"}
          </h2>
          <p>
            {es
              ? "Una vez aprobado, el reembolso se inicia en un plazo de hasta cinco (5) días hábiles. El tiempo en que los fondos aparezcan en tu cuenta depende del método de pago original:"
              : "Once approved, the refund is initiated within up to five (5) business days. The time for funds to appear in your account depends on the original payment method:"}
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>{es ? "Tarjeta de crédito/débito (Stripe): 5 a 10 días hábiles." : "Credit/debit card (Stripe): 5 to 10 business days."}</li>
            <li>{es ? "PayPal: 3 a 5 días hábiles." : "PayPal: 3 to 5 business days."}</li>
            <li>{es ? "ATH Móvil: típicamente inmediato una vez procesado." : "ATH Móvil: typically immediate once processed."}</li>
            <li>{es ? "Efectivo: en la próxima visita o por transferencia ATH Móvil acordada." : "Cash: on the next visit or by agreed ATH Móvil transfer."}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "7. Conceptos No Reembolsables" : "7. Non-Refundable Items"}
          </h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{es ? "Propinas pagadas voluntariamente." : "Tips paid voluntarily."}</li>
            <li>{es ? "Cargos de procesamiento de pasarela (Stripe, PayPal) cuando el procesador los retiene." : "Payment gateway processing fees (Stripe, PayPal) when the processor retains them."}</li>
            <li>{es ? "Servicios ya prestados o iniciados, salvo defecto material acordado por el Barbero." : "Services already rendered or started, except for a material defect acknowledged by the Barber."}</li>
            <li>{es ? "Productos abiertos o usados." : "Opened or used products."}</li>
            <li>{es ? "Membresías o paquetes prepagados, parcialmente consumidos." : "Memberships or prepaid packages, partially consumed."}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "8. Disputas con el Procesador (Chargebacks)" : "8. Processor Disputes (Chargebacks)"}
          </h2>
          <p>
            {es
              ? "Antes de iniciar un reclamo (chargeback) con tu banco, PayPal o tarjeta, te pedimos contactarnos primero. Los chargebacks fraudulentos o presentados sin haber agotado los canales internos pueden resultar en: (a) prohibición permanente de usar nuestros servicios, (b) acciones legales por costos administrativos y daños, y (c) inclusión en listas internas de clientes vetados."
              : "Before initiating a chargeback with your bank, PayPal or card, we ask that you contact us first. Fraudulent chargebacks or those filed without exhausting internal channels may result in: (a) permanent ban from our services, (b) legal action for administrative costs and damages, and (c) inclusion in internal banned-client lists."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "9. Cancelaciones por Parte del Negocio" : "9. Cancellations by the Business"}
          </h2>
          <p>
            {es
              ? "Si la Compañía cancela una cita por causas atribuibles a nosotros (enfermedad del Barbero, cierre por emergencia, fallo del local), ofreceremos: (a) reagendamiento sin cargo, o (b) reembolso completo del monto pagado, a elección del cliente. No habrá compensación adicional más allá del monto pagado."
              : "If the Company cancels an appointment for causes attributable to us (Barber illness, emergency closure, premises failure), we will offer: (a) free rescheduling, or (b) full refund of the amount paid, at the client's election. No additional compensation will be provided beyond the amount paid."}
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
            <Link to="/politica-reservas" className="underline">{es ? "Política de Reservas" : "Booking Policy"}</Link>
          </p>
        </section>
      </div>
    </div>
    </>
  );
}
