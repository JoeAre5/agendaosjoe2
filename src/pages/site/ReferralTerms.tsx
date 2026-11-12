import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";

export default function ReferralTerms() {
  const { language } = useTranslation();
  const es = language === "es";

  return (
    <>
      <SEOHead
        title={es ? "Términos del Programa de Referidos · Charlie's Barbershop" : "Referral Program Terms · Charlie's Barbershop"}
        description={es
          ? "Reglas del programa de referidos: enlaces personales, atribución, elegibilidad, y bono por referir."
          : "Referral program rules: personal links, attribution, eligibility and matching bonus."}
        path="/referral-terms"
      />
      <div className="max-w-3xl mx-auto px-5 py-16 pb-28 md:pb-16">
        <h1
          className="font-black uppercase leading-[0.95] mb-6"
          style={{ fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-1px", color: "var(--text-primary)" }}
        >
          {es ? "Términos del Programa de Referidos" : "Referral Program Terms"}
        </h1>
        <p className="text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Última actualización: 20 de noviembre de 2026" : "Last updated: November 20, 2026"}
        </p>

        <div className="space-y-6 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <section>
            <p>
              {es
                ? "Nuestro programa de referidos permite a clientes elegibles compartir un enlace personal y ganar recompensas cuando nuevos clientes completan actividad cualificable. El programa lo opera C&O Ventures, LLC dba Charlie's Barbershop."
                : "Our referral program lets eligible clients share a personal link and earn rewards when new clients complete qualifying activity. The program is operated by C&O Ventures, LLC dba Charlie's Barbershop."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "1. Cómo funcionan los enlaces" : "1. How Referral Links Work"}
            </h2>
            <p>
              {es
                ? "Cada cliente elegible puede recibir un enlace o slug personal de referido. Cuando alguien usa ese enlace, el sistema rastrea la fuente de la referencia y conecta al cliente referido con el referidor correcto. La atribución se guarda por identificador interno, no solo por el texto del enlace. Esto significa que cambiar tu slug no borra atribuciones previas válidas."
                : "Each eligible client may receive a personal referral link or slug. When someone uses that link, the system tracks the referral source and connects the referred client to the correct referrer. Attribution is stored by internal ID, not only by the link text. This means changing your slug does not erase previously valid attribution."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "2. Bono por Referir" : "2. Matching Bonus"}
            </h2>
            <p className="mb-2">
              {es
                ? "Un Bono por Referir (en inglés: Matching Bonus) puede aplicar cuando se cumplen TODAS estas condiciones:"
                : "A Matching Bonus (in Spanish: Bono por Referir) may apply only when ALL of the following are met:"}
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>{es ? "Se usó un enlace de referido válido." : "A valid referral link was used."}</li>
              <li>{es ? "El cliente referido cualifica." : "The referred client qualifies."}</li>
              <li>{es ? "El cliente referido completa su primera reserva pagada elegible." : "The referred client completes their first eligible paid booking."}</li>
              <li>{es ? "La fuente de la reserva es elegible." : "The booking source is eligible."}</li>
              <li>{es ? "La transacción no ha generado un bono de referido previamente." : "The transaction has not already generated a referral bonus."}</li>
              <li>{es ? "La actividad no es fraudulenta, abusiva ni auto-referida." : "The activity is not fraudulent, abusive or self-referring."}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "3. Actividad no elegible para referidos" : "3. Non-Eligible Referral Activity"}
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>{es ? "Walk-ins, reservas por teléfono, citas creadas manualmente por administradores o barberos." : "Walk-ins, phone bookings, manually-created admin or barber appointments."}</li>
              <li>{es ? "Reservas falsas, cuentas duplicadas, auto-referidos." : "Fake bookings, duplicate accounts, self-referrals."}</li>
              <li>{es ? "Citas canceladas, reembolsadas o retroactivas." : "Cancelled, refunded or backdated appointments."}</li>
              <li>{es ? "Actividad abusiva o manipulada." : "Abusive or manipulated activity."}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "4. Atribución de referidos" : "4. Referral Attribution"}
            </h2>
            <p>
              {es
                ? "La atribución de referidos se rastrea por hasta 90 días desde la visita inicial. Si la reserva se completa fuera del flujo elegible, podría no cualificar para crédito de referido."
                : "Referral attribution is tracked for up to 90 days from the initial visit. If a booking is completed outside the eligible flow, it may not qualify for referral credit."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "5. Slugs personalizados" : "5. Custom Referral Slugs"}
            </h2>
            <p>
              {es
                ? "Los clientes podrán personalizar su slug de referido. Los slugs deben ser únicos y podrán ser denegados, removidos o cambiados si son abusivos, engañosos, ofensivos, ya están tomados o violan las reglas del programa. Los clientes podrán cambiar su slug una vez cada 30 días."
                : "Clients may customize their referral slug. Slugs must be unique and may be denied, removed or changed if they are abusive, misleading, offensive, already taken or violate program rules. Clients may change their slug once every 30 days."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "6. Fraude y abuso" : "6. Fraud & Abuse"}
            </h2>
            <p>
              {es
                ? "Podremos remover puntos, cancelar bonos, deshabilitar enlaces de referido, revertir recompensas o suspender la participación si entendemos que el sistema de referidos ha sido abusado."
                : "We may remove points, cancel bonuses, disable referral links, reverse rewards or suspend participation if we believe the referral system has been abused."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "7. Cambios al programa" : "7. Program Changes"}
            </h2>
            <p>
              {es
                ? "Nos reservamos el derecho de modificar, pausar, limitar o terminar el programa de referidos en cualquier momento, donde la ley lo permita."
                : "We reserve the right to modify, pause, limit or end the referral program at any time, where allowed by law."}
            </p>
          </section>

          <section>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {es ? "Ver también: " : "See also: "}
              <Link to="/rewards-terms" className="underline" style={{ color: "var(--accent-color)" }}>
                {es ? "Términos del Programa de Recompensas" : "Rewards Program Terms"}
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
