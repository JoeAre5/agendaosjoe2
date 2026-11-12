import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";

export default function RewardsTerms() {
  const { language } = useTranslation();
  const es = language === "es";

  return (
    <>
      <SEOHead
        title={es ? "Términos del Programa de Recompensas · Charlie's Barbershop" : "Rewards Program Terms · Charlie's Barbershop"}
        description={es
          ? "Cómo se ganan, se reversan y se canjean los puntos del programa de recompensas de Charlie's Barbershop."
          : "How points are earned, reversed and redeemed in the Charlie's Barbershop rewards program."}
        path="/rewards-terms"
      />
      <div className="max-w-3xl mx-auto px-5 py-16 pb-28 md:pb-16">
        <h1
          className="font-black uppercase leading-[0.95] mb-6"
          style={{ fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-1px", color: "var(--text-primary)" }}
        >
          {es ? "Términos del Programa de Recompensas" : "Rewards Program Terms"}
        </h1>
        <p className="text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Última actualización: 20 de noviembre de 2026" : "Last updated: November 20, 2026"}
        </p>

        <div className="space-y-6 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <section>
            <p>
              {es
                ? "Nuestro programa de recompensas permite a clientes elegibles ganar puntos basado en actividad cualificable. Los puntos son promocionales, no tienen valor en efectivo, no son transferibles, no se pueden vender ni cambiar por dinero. Este programa lo opera C&O Ventures, LLC dba Charlie's Barbershop."
                : "Our rewards program lets eligible clients earn points based on qualifying activity. Points are promotional, have no cash value, are not transferable, cannot be sold and cannot be exchanged for cash. The program is operated by C&O Ventures, LLC dba Charlie's Barbershop."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "1. Cómo se ganan puntos" : "1. How Points Are Earned"}
            </h2>
            <p className="mb-2">
              {es
                ? "Solo generan puntos las reservas hechas a través de flujos digitales propietarios aprobados, incluyendo:"
                : "Only bookings made through approved proprietary digital flows earn points, including:"}
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>{es ? "Reservas desde la PWA o portal del cliente." : "Bookings from the client PWA or portal."}</li>
              <li>{es ? "Reservas en la página pública con identidad de cliente rastreable." : "Public booking page bookings with a tracked client identity."}</li>
              <li>{es ? "Reservas en la página pública a través de un enlace de referido válido." : "Public bookings via a valid referral link."}</li>
              <li>{es ? "Correcciones aprobadas por la administración de reservas previamente elegibles." : "Admin-approved corrections of previously eligible bookings."}</li>
            </ul>
            <p className="mt-3">
              {es
                ? "Los puntos se calculan sobre el subtotal elegible. Las propinas no generan puntos. Los montos reembolsados o cancelados no generan puntos."
                : "Points are calculated on the eligible subtotal. Tips do not earn points. Refunded or cancelled amounts do not earn points."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "2. Regla de redondeo" : "2. Rounding Rule"}
            </h2>
            <p>
              {es
                ? "El sistema redondea según la regla aprobada: si los centavos exceden 50, redondea hacia arriba; de lo contrario, redondea hacia abajo. Ejemplo: $34.49 = 34 puntos; $34.50 = 34 puntos; $34.51 = 35 puntos."
                : "The system rounds per the approved rule: if cents exceed 50, round up; otherwise round down. Example: $34.49 = 34 points; $34.50 = 34 points; $34.51 = 35 points."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "3. Actividad no elegible" : "3. Non-Eligible Activity"}
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>{es ? "Walk-ins." : "Walk-ins."}</li>
              <li>{es ? "Reservas por teléfono." : "Phone bookings."}</li>
              <li>{es ? "Citas creadas manualmente por administradores." : "Manually-created admin appointments."}</li>
              <li>{es ? "Citas creadas manualmente por barberos." : "Manually-created barber appointments."}</li>
              <li>{es ? "Citas retroactivas." : "Backdated appointments."}</li>
              <li>{es ? "Citas canceladas o reembolsadas." : "Cancelled or refunded appointments."}</li>
              <li>{es ? "Propinas." : "Tips."}</li>
              <li>{es ? "Cuentas duplicadas, reservas falsas o actividad fraudulenta." : "Duplicate accounts, fake bookings or fraudulent activity."}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "4. Cancelaciones, Reembolsos y Reversiones" : "4. Cancellations, Refunds & Reversals"}
            </h2>
            <p>
              {es
                ? "Si una cita, transacción o pago que generó puntos es cancelado, reembolsado, revertido, disputado o corregido, los puntos correspondientes podrán ser eliminados o revertidos. Si los puntos ya habían sido canjeados, el balance del cliente podrá quedar en negativo hasta acumular nueva actividad."
                : "If an appointment, transaction or payment that generated points is cancelled, refunded, reversed, disputed or corrected, the related points may be removed or reversed. If points had already been redeemed, the client's balance may become negative until new activity accumulates."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "5. Ajustes Manuales" : "5. Manual Adjustments"}
            </h2>
            <p>
              {es
                ? "La administración podrá añadir o restar puntos manualmente para correcciones, recuperación de servicio, excepciones de lealtad, arreglos del sistema o razones aprobadas por la gerencia. Todos los ajustes manuales quedan registrados."
                : "Admin may manually add or remove points for corrections, service recovery, loyalty exceptions, system fixes or manager-approved reasons. All manual adjustments are logged."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "6. Bono de Lanzamiento (única vez)" : "6. Launch Bonus (one-time)"}
            </h2>
            <p>
              {es
                ? "Como cortesía única por el lanzamiento del sistema, otorgamos un bono basado en la última cita elegible completada por clientes que ya estaban usando la PWA, el portal o la página pública rastreada durante el período de lanzamiento. No aplica a citas históricas, walk-ins, reservas por teléfono, citas manuales, canceladas, reembolsadas ni propinas."
                : "As a one-time courtesy at launch, we grant a bonus based on each client's most recent eligible completed appointment for clients already using the PWA, the portal or the tracked public page during the launch window. It does not apply to historical appointments, walk-ins, phone bookings, manual appointments, cancelled or refunded appointments, or tips."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "7. Cambios al programa" : "7. Program Changes"}
            </h2>
            <p>
              {es
                ? "Nos reservamos el derecho de modificar, pausar, limitar o terminar el programa de recompensas en cualquier momento, donde la ley lo permita. También podemos cambiar los puntos requeridos para beneficios, añadir o remover beneficios, actualizar reglas de elegibilidad, o modificar cómo funcionan las recompensas."
                : "We reserve the right to modify, pause, limit or end the rewards program at any time, where allowed by law. We may also change the points required for benefits, add or remove benefits, update eligibility rules, or change how rewards work."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "8. Fraude y abuso" : "8. Fraud & Abuse"}
            </h2>
            <p>
              {es
                ? "Podremos remover puntos, cancelar recompensas, deshabilitar acceso o denegar participación si entendemos que un cliente ha abusado o manipulado el programa. La determinación final de elegibilidad le corresponde al negocio."
                : "We may remove points, cancel rewards, disable access or deny participation if we believe a client has abused or manipulated the program. Final eligibility determinations rest with the business."}
            </p>
          </section>

          <section>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {es ? "Ver también: " : "See also: "}
              <Link to="/referral-terms" className="underline" style={{ color: "var(--accent-color)" }}>
                {es ? "Términos del Programa de Referidos" : "Referral Program Terms"}
              </Link>
              {" · "}
              <Link to="/privacidad" className="underline" style={{ color: "var(--accent-color)" }}>
                {es ? "Política de Privacidad" : "Privacy Policy"}
              </Link>
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
