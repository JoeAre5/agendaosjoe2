import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";

export default function TermsOfService() {
  const { language } = useTranslation();
  const es = language === "es";

  return (
    <>
    <SEOHead
      title={es ? "Términos y Condiciones · Charlie's Barbershop" : "Terms & Conditions · Charlie's Barbershop"}
      description={es ? "Términos y condiciones de uso de los servicios y plataforma de C&O Ventures, LLC dba Charlie's Barbershop." : "Terms and conditions for using C&O Ventures, LLC dba Charlie's Barbershop services and platform."}
      path="/terminos"
    />
    <div className="max-w-3xl mx-auto px-5 py-16 pb-28 md:pb-16">
      <h1
        className="font-black uppercase leading-[0.95] mb-6"
        style={{ fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-1px", color: "var(--text-primary)" }}
      >
        {es ? "Términos y Condiciones" : "Terms & Conditions"}
      </h1>
      <p className="text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
        {es ? "Última actualización: 14 de mayo de 2026 · Vigente desde: 14 de mayo de 2026 · Versión 2.1 (Sección 13 refinada: tope auto-escalable y exclusiones obligatorias)" : "Last updated: May 14, 2026 · Effective: May 14, 2026 · Version 2.1 (Section 13 refined: self-scaling cap and mandatory carve-outs)"}
      </p>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        <section>
          <p>
            {es
              ? "Estos Términos y Condiciones (los \"Términos\") constituyen un acuerdo legalmente vinculante entre tú (el \"Cliente\" o \"Usuario\") y C&O Ventures, LLC, una compañía de responsabilidad limitada organizada bajo las leyes del Estado Libre Asociado de Puerto Rico, haciendo negocios como Charlie's Barbershop (la \"Compañía\", \"nosotros\" o \"nuestro\"). Al acceder o usar nuestro sitio web, PWA, sistema de reservas o servicios presenciales, aceptas estar legalmente obligado por estos Términos. Si no estás de acuerdo, no uses los servicios."
              : "These Terms and Conditions (the \"Terms\") are a legally binding agreement between you (the \"Client\" or \"User\") and C&O Ventures, LLC, a limited liability company organized under the laws of the Commonwealth of Puerto Rico, doing business as Charlie's Barbershop (the \"Company\", \"we\" or \"our\"). By accessing or using our website, PWA, booking system or in-person services, you agree to be legally bound by these Terms. If you do not agree, do not use the services."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "1. Elegibilidad" : "1. Eligibility"}
          </h2>
          <p>
            {es
              ? "Debes tener al menos 18 años para crear una cuenta y aceptar estos Términos. Los menores entre 13 y 17 años solo pueden reservar servicios con consentimiento expreso y supervisión de un padre o tutor legal, quien será responsable solidario por todas las obligaciones derivadas. No prestamos servicios a menores de 13 años."
              : "You must be at least 18 years old to create an account and accept these Terms. Minors between 13 and 17 may only book services with the express consent and supervision of a parent or legal guardian, who shall be jointly liable for all resulting obligations. We do not provide services to children under 13."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "2. Descripción de los Servicios" : "2. Description of Services"}
          </h2>
          <p>
            {es
              ? "Ofrecemos servicios profesionales de barbería, incluyendo cortes de cabello, cuidado y arreglo de barba, experiencias premium y productos relacionados, prestados desde nuestro local en Camuy, Puerto Rico. La plataforma digital permite reservar, modificar, pagar y administrar citas. Los precios, duraciones y disponibilidad pueden variar por barbero y se muestran al momento de reservar. Nos reservamos el derecho de modificar, suspender o descontinuar cualquier servicio en cualquier momento, con o sin previo aviso, sin responsabilidad hacia ti."
              : "We offer professional barbering services, including haircuts, beard care and grooming, premium experiences and related products, provided from our location in Camuy, Puerto Rico. The digital platform allows you to book, modify, pay and manage appointments. Prices, durations and availability may vary by barber and are shown at the time of booking. We reserve the right to modify, suspend or discontinue any service at any time, with or without notice, without liability to you."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "3. Cuenta de Usuario" : "3. User Account"}
          </h2>
          <p>
            {es
              ? "Eres responsable de mantener la confidencialidad de tu contraseña, de toda actividad bajo tu cuenta y de proporcionar información veraz y actualizada. Notifícanos inmediatamente cualquier uso no autorizado. Podemos suspender o cerrar cuentas que violen estos Términos, presenten información falsa, generen historial de no-shows reiterados o representen riesgo legal o de seguridad."
              : "You are responsible for maintaining the confidentiality of your password, all activity under your account and providing accurate, current information. Notify us immediately of any unauthorized use. We may suspend or terminate accounts that violate these Terms, present false information, accumulate repeated no-shows, or pose legal or security risk."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "4. Reservas, Cancelaciones y No-Shows" : "4. Bookings, Cancellations and No-Shows"}
          </h2>
          <p>
            {es
              ? "Las reglas detalladas se encuentran en nuestra "
              : "Detailed rules are in our "}
            <Link to="/politica-reservas" className="underline" style={{ color: "var(--text-primary)" }}>
              {es ? "Política de Reservas y No-Show" : "Booking and No-Show Policy"}
            </Link>
            {es
              ? ", la cual forma parte integral de estos Términos. En resumen: el cliente puede cancelar o reagendar a través de la plataforma hasta las 11:59 PM del día anterior a la cita. Después de esa hora, los cambios deben coordinarse directamente con el Barbero, quien puede ejercer discreción según las circunstancias. Los no-shows pierden el monto total pagado al momento de la reserva."
              : ", which is incorporated into and forms part of these Terms. In summary: the client may cancel or reschedule through the platform until 11:59 PM the day before the appointment. After that time, changes must be coordinated directly with the Barber, who may exercise discretion based on the circumstances. No-shows forfeit the full amount paid at booking."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "5. Métodos de Pago y Procesamiento" : "5. Payment Methods and Processing"}
          </h2>
          <p>
            {es
              ? "Aceptamos efectivo, tarjetas de crédito/débito (procesadas por Stripe), Apple Pay y Google Pay (mediante Stripe), PayPal y ATH Móvil. Todos los pagos electrónicos son procesados por terceros independientes; sus términos y políticas de privacidad aplican adicionalmente. Los precios incluyen el Impuesto sobre Ventas y Uso (IVU) de Puerto Rico cuando aplica. Las propinas son voluntarias y, una vez pagadas, no son reembolsables."
              : "We accept cash, credit/debit cards (processed by Stripe), Apple Pay and Google Pay (via Stripe), PayPal and ATH Móvil. All electronic payments are processed by independent third parties; their terms and privacy policies additionally apply. Prices include Puerto Rico Sales and Use Tax (IVU) where applicable. Tips are voluntary and, once paid, are non-refundable."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "6. Métodos de Pago Guardados (Billetera)" : "6. Saved Payment Methods (Wallet)"}
          </h2>
          <p>
            {es
              ? "Al pagar con tarjeta, aceptas que tu método se guarde de forma segura con Stripe para pagos futuros; no guardamos el número completo de tu tarjeta. Tu método se guarda como método reciente y el más reciente se establece automáticamente como preferido. Puedes cambiar el preferido o eliminar métodos guardados en cualquier momento desde la sección Billetera. Para citas confirmadas, autorizas a la Compañía a cobrar el método guardado al completarse el servicio o ante un no-show, conforme a la "
              : "By paying with a card, you agree that your method is securely saved with Stripe for future payments; we never store your full card number. Your method is saved as a recent method and the most recent is automatically set as preferred. You may change the preferred method or remove saved methods at any time from the Wallet section. For confirmed appointments, you authorize the Company to charge the saved method upon service completion or upon no-show, in accordance with the "}
            <Link to="/reembolsos" className="underline" style={{ color: "var(--text-primary)" }}>
              {es ? "Política de Reembolsos" : "Refund Policy"}
            </Link>
            {es
              ? ". Los tokens de Apple Pay y Google Pay no son cobrables fuera de sesión por limitaciones de las redes de pago; solo el método de tarjeta subyacente es reusable."
              : ". Apple Pay and Google Pay tokens are not chargeable off-session due to payment network limitations; only the underlying physical card method is reusable."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "7. Reembolsos" : "7. Refunds"}
          </h2>
          <p>
            {es
              ? "Todos los reembolsos se procesan manualmente. No existe ningún botón en la plataforma que dispare un reembolso automático. Las condiciones, ventanas de elegibilidad y proceso de solicitud están descritos en nuestra "
              : "All refunds are processed manually. No button on the platform triggers an automatic refund. The conditions, eligibility windows and request process are described in our "}
            <Link to="/reembolsos" className="underline" style={{ color: "var(--text-primary)" }}>
              {es ? "Política de Reembolsos" : "Refund Policy"}
            </Link>
            {es ? ", que forma parte integral de estos Términos." : ", which is incorporated into and forms part of these Terms."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "8. Conducta del Cliente" : "8. Client Conduct"}
          </h2>
          <p>{es ? "Al usar nuestros servicios y local, aceptas:" : "By using our services and premises, you agree to:"}</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>{es ? "Tratar a los barberos, personal y demás clientes con respeto." : "Treat barbers, staff and other clients with respect."}</li>
            <li>{es ? "No presentarte bajo influencia de sustancias que pongan en riesgo tu seguridad o la del personal." : "Not show up under the influence of substances that endanger your safety or that of staff."}</li>
            <li>{es ? "Informar al barbero de condiciones médicas, alergias o sensibilidades de la piel y cuero cabelludo antes del servicio." : "Inform the barber of any medical conditions, allergies or skin/scalp sensitivities before the service."}</li>
            <li>{es ? "No grabar audio o video del personal o de otros clientes sin consentimiento expreso." : "Not record audio or video of staff or other clients without express consent."}</li>
            <li>{es ? "No usar la plataforma para propósitos ilegales, fraudulentos o que dañen los sistemas." : "Not use the platform for illegal, fraudulent purposes or to harm our systems."}</li>
          </ul>
          <p className="mt-2">
            {es
              ? "Nos reservamos el derecho de negar el servicio, expulsar del local o cerrar cuentas de quienes violen estas reglas."
              : "We reserve the right to refuse service, expel from the premises or terminate accounts of those who violate these rules."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "9. Comunicaciones Electrónicas" : "9. Electronic Communications"}
          </h2>
          <p>
            {es
              ? "Al proporcionar tu número de teléfono y correo, consientes recibir comunicaciones electrónicas (SMS, correo, notificaciones push) relacionadas con tus citas, recordatorios, recibos, alertas de servicio y, cuando hayas optado in expresamente, mensajes promocionales. Puedes cancelar SMS promocionales respondiendo STOP, cancelar correos promocionales con el enlace de cada correo, y desactivar notificaciones push desde tu dispositivo o las preferencias de la app. Las comunicaciones transaccionales son inherentes al servicio y no pueden desactivarse mientras tengas una cita activa."
              : "By providing your phone number and email, you consent to receive electronic communications (SMS, email, push notifications) related to your appointments, reminders, receipts, service alerts and, where you have expressly opted in, promotional messages. You may opt out of promotional SMS by replying STOP, opt out of promotional email via the link in each message, and disable push notifications from your device or app preferences. Transactional communications are inherent to the service and cannot be disabled while you have an active appointment."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "10. Propiedad Intelectual" : "10. Intellectual Property"}
          </h2>
          <p>
            {es
              ? "El nombre comercial \"Charlie's Barbershop\", el logo, la marca AgendaOS™, la marca de agua Renova360™, el asistente Filho, el sistema de identidad visual, el código fuente, la base de datos, las imágenes, los textos editoriales (incluyendo Titulares), las recetas de servicios y todo el contenido del sitio son propiedad exclusiva de C&O Ventures, LLC o de sus licenciantes y están protegidos por las leyes de derechos de autor, marcas comerciales, secreto comercial y propiedad intelectual de Puerto Rico, Estados Unidos y tratados internacionales. Se te otorga una licencia personal, limitada, no exclusiva, no transferible y revocable para usar la plataforma con el único propósito de gestionar tus citas. Queda prohibido copiar, reproducir, distribuir, modificar, hacer ingeniería inversa, descompilar, hacer scraping, o crear obras derivadas, sin nuestro consentimiento previo por escrito. Cualquier comentario, reseña o sugerencia que nos envíes podrá ser usado por la Compañía sin compensación ni atribución."
              : "The trade name \"Charlie's Barbershop\", the logo, the AgendaOS™ mark, the Renova360™ watermark, the Filho assistant, the visual identity system, the source code, the database, the images, the editorial content (including Headlines), the service recipes and all site content are the exclusive property of C&O Ventures, LLC or its licensors and are protected by copyright, trademark, trade secret and intellectual property laws of Puerto Rico, the United States and international treaties. You are granted a personal, limited, non-exclusive, non-transferable, revocable license to use the platform solely to manage your appointments. Copying, reproduction, distribution, modification, reverse engineering, decompilation, scraping or creation of derivative works is prohibited without our prior written consent. Any feedback, review or suggestion you send us may be used by the Company without compensation or attribution."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "11. Reseñas y Contenido del Usuario" : "11. Reviews and User Content"}
          </h2>
          <p>
            {es
              ? "Si publicas reseñas, fotos o cualquier contenido visible públicamente, declaras tener todos los derechos sobre dicho contenido y otorgas a la Compañía una licencia mundial, gratuita, perpetua, irrevocable, sublicenciable y transferible para usarlo, reproducirlo, modificarlo y mostrarlo en cualquier medio para fines promocionales y operativos. Te comprometes a no publicar contenido falso, difamatorio, obsceno, discriminatorio, o que viole derechos de terceros. Podemos remover contenido a nuestra discreción."
              : "If you post reviews, photos or any publicly visible content, you represent that you own all rights to such content and grant the Company a worldwide, royalty-free, perpetual, irrevocable, sublicensable and transferable license to use, reproduce, modify and display it in any medium for promotional and operational purposes. You agree not to post false, defamatory, obscene, discriminatory content or content that violates third-party rights. We may remove content at our discretion."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "12. Descargo de Garantías" : "12. Disclaimer of Warranties"}
          </h2>
          <p>
            {es
              ? "Los servicios y la plataforma se proporcionan \"COMO ESTÁN\" y \"SEGÚN DISPONIBILIDAD\", sin garantías de ningún tipo, expresas o implícitas, incluyendo pero no limitadas a garantías de comerciabilidad, idoneidad para un propósito particular, no infracción, disponibilidad ininterrumpida o ausencia de errores. No garantizamos resultados estéticos específicos. Las reacciones individuales a productos o servicios pueden variar; debes informar de cualquier alergia o sensibilidad antes del servicio."
              : "The services and platform are provided \"AS IS\" and \"AS AVAILABLE\", without warranties of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose, non-infringement, uninterrupted availability or error-free operation. We do not guarantee specific aesthetic results. Individual reactions to products or services may vary; you must disclose any allergy or sensitivity before the service."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "13. Limitación de Responsabilidad" : "13. Limitation of Liability"}
          </h2>
          <p>
            {es
              ? "EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY APLICABLE, ACEPTAS LAS SIGUIENTES LIMITACIONES, LAS CUALES SON UN ELEMENTO ESENCIAL DEL ACUERDO ENTRE LAS PARTES Y SIN LAS CUALES LA COMPAÑÍA NO ESTARÍA EN POSICIÓN DE OFRECER LOS SERVICIOS A LOS PRECIOS PUBLICADOS:"
              : "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, YOU ACCEPT THE FOLLOWING LIMITATIONS, WHICH ARE AN ESSENTIAL ELEMENT OF THE BARGAIN BETWEEN THE PARTIES AND WITHOUT WHICH THE COMPANY WOULD NOT BE ABLE TO OFFER THE SERVICES AT THE PUBLISHED PRICES:"}
          </p>
          <p className="mt-2">
            <strong>{es ? "(a) Tope individual por reclamante. " : "(a) Per-claimant cap. "}</strong>
            {es
              ? "LA RESPONSABILIDAD TOTAL ACUMULADA DE LA COMPAÑÍA, SUS MIEMBROS, DIRECTORES, EMPLEADOS, BARBEROS, CONTRATISTAS, AGENTES, AFILIADOS Y PROVEEDORES DE SERVICIOS (CONJUNTAMENTE LAS \"PARTES EXIMIDAS\") FRENTE A CUALQUIER USUARIO INDIVIDUAL, POR TODAS LAS RECLAMACIONES RELACIONADAS DE CUALQUIER MANERA CON LOS SERVICIOS, LA PLATAFORMA, FILHO O ESTOS TÉRMINOS, NO EXCEDERÁ EL MAYOR DE: (i) EL MONTO TOTAL EFECTIVAMENTE PAGADO POR ESE USUARIO A LA COMPAÑÍA EN LOS DOCE (12) MESES INMEDIATAMENTE ANTERIORES AL EVENTO QUE DA ORIGEN A LA RECLAMACIÓN; O (ii) DOSCIENTOS DÓLARES (US$200)."
              : "THE TOTAL CUMULATIVE LIABILITY OF THE COMPANY, ITS MEMBERS, DIRECTORS, EMPLOYEES, BARBERS, CONTRACTORS, AGENTS, AFFILIATES AND SERVICE PROVIDERS (COLLECTIVELY THE \"RELEASED PARTIES\") TO ANY INDIVIDUAL USER, FOR ALL CLAIMS RELATED IN ANY WAY TO THE SERVICES, THE PLATFORM, FILHO OR THESE TERMS, SHALL NOT EXCEED THE GREATER OF: (i) THE TOTAL AMOUNT ACTUALLY PAID BY THAT USER TO THE COMPANY IN THE TWELVE (12) MONTHS IMMEDIATELY BEFORE THE EVENT GIVING RISE TO THE CLAIM; OR (ii) TWO HUNDRED DOLLARS (US$200)."}
          </p>
          <p className="mt-2">
            <strong>{es ? "(b) Tope agregado anual de la Compañía. " : "(b) Company aggregate annual cap. "}</strong>
            {es
              ? "LA RESPONSABILIDAD AGREGADA TOTAL DE LAS PARTES EXIMIDAS FRENTE A TODOS LOS USUARIOS, EN CONJUNTO, POR TODAS LAS RECLAMACIONES QUE SURJAN DENTRO DE UN MISMO AÑO CALENDARIO, INDEPENDIENTEMENTE DEL NÚMERO DE RECLAMANTES, DE SI LAS RECLAMACIONES ESTÁN COORDINADAS, CONSOLIDADAS, AGRUPADAS, O PRESENTADAS COMO ARBITRAJES MASIVOS, NO EXCEDERÁ EL MONTO TOTAL DE TARIFAS EFECTIVAMENTE RECIBIDAS POR LA COMPAÑÍA DE TODOS LOS RECLAMANTES, EN CONJUNTO, EN LOS DOCE (12) MESES INMEDIATAMENTE ANTERIORES A LA PRIMERA RECLAMACIÓN DEL GRUPO. SI LAS RECLAMACIONES AGREGADAS EXCEDEN ESTE TOPE, EL FONDO DISPONIBLE SE PRORRATEARÁ ENTRE LOS RECLAMANTES ELEGIBLES SEGÚN EL ORDEN DE PRESENTACIÓN."
              : "THE TOTAL AGGREGATE LIABILITY OF THE RELEASED PARTIES TO ALL USERS, COMBINED, FOR ALL CLAIMS ARISING WITHIN A SINGLE CALENDAR YEAR, REGARDLESS OF THE NUMBER OF CLAIMANTS, WHETHER THE CLAIMS ARE COORDINATED, CONSOLIDATED, BATCHED, OR FILED AS MASS ARBITRATIONS, SHALL NOT EXCEED THE TOTAL AMOUNT OF FEES ACTUALLY RECEIVED BY THE COMPANY FROM ALL CLAIMANTS, COMBINED, IN THE TWELVE (12) MONTHS IMMEDIATELY BEFORE THE FIRST CLAIM IN THE GROUP. IF AGGREGATE CLAIMS EXCEED THIS CAP, THE AVAILABLE FUND SHALL BE PRORATED AMONG ELIGIBLE CLAIMANTS IN ORDER OF FILING."}
          </p>
          <p className="mt-2">
            <strong>{es ? "(c) Daños excluidos. " : "(c) Excluded damages. "}</strong>
            {es
              ? "EN NINGÚN CASO LAS PARTES EXIMIDAS SERÁN RESPONSABLES POR DAÑOS INDIRECTOS, INCIDENTALES, ESPECIALES, CONSECUENTES, EJEMPLARES, MORALES O PUNITIVOS, INCLUYENDO PERO NO LIMITADO A LUCRO CESANTE, PÉRDIDA DE INGRESOS, PÉRDIDA DE OPORTUNIDAD, PÉRDIDA DE DATOS, INTERRUPCIÓN DE NEGOCIO, ANGUSTIA EMOCIONAL O DAÑO REPUTACIONAL, AUN CUANDO HAYAN SIDO ADVERTIDAS DE LA POSIBILIDAD DE TALES DAÑOS, Y AUN CUANDO UN REMEDIO LIMITADO SE CONSIDERE QUE NO HA CUMPLIDO SU PROPÓSITO ESENCIAL."
              : "IN NO EVENT SHALL THE RELEASED PARTIES BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, MORAL OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOST PROFITS, LOST REVENUE, LOST OPPORTUNITY, LOST DATA, BUSINESS INTERRUPTION, EMOTIONAL DISTRESS OR REPUTATIONAL HARM, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES, AND EVEN IF A LIMITED REMEDY IS DEEMED TO HAVE FAILED OF ITS ESSENTIAL PURPOSE."}
          </p>
          <p className="mt-2">
            <strong>{es ? "(d) Plazo de prescripción contractual. " : "(d) Contractual limitations period. "}</strong>
            {es
              ? "CUALQUIER RECLAMACIÓN O CAUSA DE ACCIÓN DERIVADA DE O RELACIONADA CON LOS SERVICIOS O ESTOS TÉRMINOS DEBE PRESENTARSE DENTRO DE UN (1) AÑO CONTADO DESDE EL EVENTO QUE LA ORIGINA, O QUEDARÁ PERMANENTE Y EXPRESAMENTE RENUNCIADA, EN LA MÁXIMA MEDIDA PERMITIDA POR LA LEY."
              : "ANY CLAIM OR CAUSE OF ACTION ARISING OUT OF OR RELATED TO THE SERVICES OR THESE TERMS MUST BE BROUGHT WITHIN ONE (1) YEAR FROM THE EVENT GIVING RISE TO IT, OR IT IS PERMANENTLY AND EXPRESSLY WAIVED, TO THE MAXIMUM EXTENT PERMITTED BY LAW."}
          </p>
          <p className="mt-2">
            <strong>{es ? "(e) Aplicabilidad. " : "(e) Applicability. "}</strong>
            {es
              ? "ESTAS LIMITACIONES APLICAN INDEPENDIENTEMENTE DE LA TEORÍA LEGAL DE LA RECLAMACIÓN (CONTRATO, AGRAVIO, NEGLIGENCIA, RESPONSABILIDAD ESTRICTA, ESTATUTO U OTRA), Y SOBREVIVEN A LA TERMINACIÓN DE ESTOS TÉRMINOS. ALGUNAS JURISDICCIONES NO PERMITEN ALGUNAS DE ESTAS LIMITACIONES; EN ESE CASO, LAS LIMITACIONES APLICAN AL MÁXIMO PERMITIDO POR LA LEY."
              : "THESE LIMITATIONS APPLY REGARDLESS OF THE LEGAL THEORY OF THE CLAIM (CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, STATUTE OR OTHERWISE), AND SURVIVE TERMINATION OF THESE TERMS. SOME JURISDICTIONS DO NOT ALLOW SOME OF THESE LIMITATIONS; IN THAT CASE, THE LIMITATIONS APPLY TO THE FULLEST EXTENT PERMITTED BY LAW."}
          </p>
          <p className="mt-2">
            <strong>{es ? "(f) Exclusiones obligatorias (carve-outs). " : "(f) Mandatory carve-outs. "}</strong>
            {es
              ? "Sin perjuicio de cualquier disposición en contrario en estos Términos, los topes y exclusiones de los apartados (a) a (e) NO aplican a, y nada en estos Términos limita la responsabilidad por: (i) muerte o lesiones corporales causadas por la negligencia o conducta dolosa de las Partes Eximidas; (ii) fraude, declaración fraudulenta o tergiversación intencional; (iii) negligencia grave o conducta intencional dolosa; (iv) infracción de derechos de propiedad intelectual de la otra parte; (v) obligaciones de indemnización conforme a la Sección 14 de cualquiera de las partes; (vi) cualquier responsabilidad que, por ley aplicable de Puerto Rico o federal, no pueda ser limitada o excluida contractualmente. Esta cláusula está diseñada para preservar la validez y exigibilidad del resto de la Sección 13 conforme a la doctrina de inconsciencia (unconscionability) y al orden público."
              : "Notwithstanding anything to the contrary in these Terms, the caps and exclusions in subsections (a) through (e) do NOT apply to, and nothing in these Terms limits liability for: (i) death or bodily injury caused by the negligence or willful misconduct of the Released Parties; (ii) fraud, fraudulent misrepresentation or intentional misrepresentation; (iii) gross negligence or willful misconduct; (iv) infringement of the other party's intellectual property rights; (v) either party's indemnification obligations under Section 14; (vi) any liability that, under applicable Puerto Rico or U.S. federal law, cannot be contractually limited or excluded. This clause is designed to preserve the validity and enforceability of the remainder of Section 13 under the doctrine of unconscionability and public policy."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "14. Indemnización" : "14. Indemnification"}
          </h2>
          <p>
            {es
              ? "Aceptas indemnizar, defender y eximir de responsabilidad a la Compañía, sus miembros, empleados, barberos, agentes y proveedores de servicios, por cualquier reclamación, demanda, daño, pérdida, costo o gasto (incluyendo honorarios razonables de abogados) que surjan de: (a) tu uso de los servicios o plataforma; (b) tu violación de estos Términos o de cualquier ley aplicable; (c) tu violación de derechos de terceros; o (d) contenido que publiques o transmitas a través de la plataforma."
              : "You agree to indemnify, defend and hold harmless the Company, its members, employees, barbers, agents and service providers, from any claim, demand, damage, loss, cost or expense (including reasonable attorney fees) arising from: (a) your use of the services or platform; (b) your violation of these Terms or any applicable law; (c) your violation of third-party rights; or (d) content you post or transmit through the platform."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "15. Ley Aplicable y Foro" : "15. Governing Law and Venue"}
          </h2>
          <p>
            {es
              ? "Estos Términos se rigen e interpretan conforme a las leyes del Estado Libre Asociado de Puerto Rico, sin atender a sus principios de conflicto de leyes. Las partes someten cualquier controversia a la jurisdicción exclusiva de los Tribunales de Primera Instancia de Puerto Rico, Sala Superior de Aguadilla o Arecibo, según corresponda territorialmente, salvo que la ley federal de Estados Unidos exija lo contrario. Renuncias a cualquier defensa basada en falta de jurisdicción personal o foro inconveniente."
              : "These Terms are governed by and construed under the laws of the Commonwealth of Puerto Rico, without regard to its conflict-of-laws principles. The parties submit any controversy to the exclusive jurisdiction of the Court of First Instance of Puerto Rico, Aguadilla or Arecibo Superior Section, as territorially appropriate, except where U.S. federal law requires otherwise. You waive any defense based on lack of personal jurisdiction or forum non conveniens."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "16. Resolución de Disputas, Arbitraje Vinculante y Renuncia a Demanda Colectiva" : "16. Dispute Resolution, Binding Arbitration and Class Action Waiver"}
          </h2>

          <p>
            <strong>{es ? "16.1 Aviso previo y negociación informal. " : "16.1 Pre-dispute notice and informal negotiation. "}</strong>
            {es
              ? "Antes de iniciar cualquier procedimiento formal, la parte que reclama deberá enviar un \"Aviso de Disputa\" por escrito al correo legal@charliesbarbershop.co (o a la dirección postal de la Sección 22) describiendo la naturaleza y base de la reclamación y el remedio buscado. Las partes acuerdan negociar de buena fe durante sesenta (60) días contados desde la recepción del Aviso. Ningún arbitraje ni acción legal podrá iniciarse antes de agotar este período."
              : "Before initiating any formal proceeding, the claiming party shall send a written \"Notice of Dispute\" to legal@charliesbarbershop.co (or the postal address in Section 22) describing the nature and basis of the claim and the remedy sought. The parties agree to negotiate in good faith for sixty (60) days from receipt of the Notice. No arbitration or legal action may begin before this period is exhausted."}
          </p>

          <p className="mt-2">
            <strong>{es ? "16.2 Arbitraje individual vinculante. " : "16.2 Binding individual arbitration. "}</strong>
            {es
              ? "SALVO LAS EXCEPCIONES INDICADAS EN LA SECCIÓN 16.6, TODA CONTROVERSIA, RECLAMACIÓN O DISPUTA QUE SURJA DE O SE RELACIONE CON ESTOS TÉRMINOS, LOS SERVICIOS, LA PLATAFORMA O FILHO, NO RESUELTA EN EL PERÍODO INFORMAL, SE RESOLVERÁ EXCLUSIVAMENTE MEDIANTE ARBITRAJE INDIVIDUAL VINCULANTE Y CONFIDENCIAL, ADMINISTRADO POR LA AMERICAN ARBITRATION ASSOCIATION (AAA) BAJO SUS REGLAS DE ARBITRAJE DEL CONSUMIDOR ENTONCES VIGENTES. EL LUGAR DEL ARBITRAJE SERÁ SAN JUAN, PUERTO RICO, CON OPCIÓN DE AUDIENCIAS POR VIDEOCONFERENCIA. EL ÁRBITRO ÚNICO TENDRÁ AUTORIDAD EXCLUSIVA PARA RESOLVER CUALQUIER CUESTIÓN DE ARBITRABILIDAD, INCLUYENDO LA VALIDEZ, ALCANCE O EJECUTABILIDAD DE ESTE ACUERDO DE ARBITRAJE. EL LAUDO SERÁ FINAL Y EJECUTABLE EN CUALQUIER TRIBUNAL COMPETENTE. ESTE ACUERDO SE RIGE POR LA LEY FEDERAL DE ARBITRAJE (FAA), 9 U.S.C. § 1 ET SEQ."
              : "EXCEPT FOR THE CARVE-OUTS IN SECTION 16.6, ANY CONTROVERSY, CLAIM OR DISPUTE ARISING OUT OF OR RELATING TO THESE TERMS, THE SERVICES, THE PLATFORM OR FILHO, NOT RESOLVED IN THE INFORMAL PERIOD, SHALL BE RESOLVED EXCLUSIVELY BY BINDING, CONFIDENTIAL INDIVIDUAL ARBITRATION ADMINISTERED BY THE AMERICAN ARBITRATION ASSOCIATION (AAA) UNDER ITS THEN-CURRENT CONSUMER ARBITRATION RULES. THE PLACE OF ARBITRATION SHALL BE SAN JUAN, PUERTO RICO, WITH OPTIONAL VIDEO HEARINGS. A SINGLE ARBITRATOR SHALL HAVE EXCLUSIVE AUTHORITY TO RESOLVE ANY ISSUE OF ARBITRABILITY, INCLUDING THE VALIDITY, SCOPE OR ENFORCEABILITY OF THIS ARBITRATION AGREEMENT. THE AWARD SHALL BE FINAL AND ENFORCEABLE IN ANY COURT OF COMPETENT JURISDICTION. THIS AGREEMENT IS GOVERNED BY THE FEDERAL ARBITRATION ACT (FAA), 9 U.S.C. § 1 ET SEQ."}
          </p>

          <p className="mt-2">
            <strong>{es ? "16.3 Renuncia a demanda colectiva y acción representativa. " : "16.3 Class action and representative action waiver. "}</strong>
            {es
              ? "CADA PARTE RENUNCIA EXPRESA E IRREVOCABLEMENTE AL DERECHO DE: (a) PARTICIPAR EN UNA DEMANDA COLECTIVA, DEMANDA AGRUPADA, ACCIÓN REPRESENTATIVA, ACCIÓN PRIVADA DE FISCAL GENERAL O CUALQUIER OTRO PROCEDIMIENTO MULTIPARTE; (b) ACTUAR COMO REPRESENTANTE DE OTROS RECLAMANTES; Y (c) CONSOLIDAR SU RECLAMACIÓN CON LA DE OTROS USUARIOS. EL ÁRBITRO NO PODRÁ CONSOLIDAR LAS RECLAMACIONES DE MÁS DE UN USUARIO NI PRESIDIR PROCEDIMIENTO COLECTIVO ALGUNO. SI ESTA RENUNCIA SE DECLARA INEJECUTABLE EN ALGÚN ASPECTO, ESE ASPECTO PARTICULAR SE LITIGARÁ ÚNICAMENTE EN EL TRIBUNAL DE PRIMERA INSTANCIA DE PUERTO RICO Y EL RESTO DE ESTA SECCIÓN 16 PERMANECERÁ EN VIGOR."
              : "EACH PARTY EXPRESSLY AND IRREVOCABLY WAIVES THE RIGHT TO: (a) PARTICIPATE IN A CLASS ACTION, MASS ACTION, REPRESENTATIVE ACTION, PRIVATE ATTORNEY GENERAL ACTION, OR ANY OTHER MULTI-PARTY PROCEEDING; (b) ACT AS A REPRESENTATIVE OF OTHER CLAIMANTS; AND (c) CONSOLIDATE THEIR CLAIM WITH THAT OF OTHER USERS. THE ARBITRATOR MAY NOT CONSOLIDATE MORE THAN ONE USER'S CLAIMS NOR PRESIDE OVER ANY COLLECTIVE PROCEEDING. IF THIS WAIVER IS DECLARED UNENFORCEABLE IN ANY ASPECT, THAT PARTICULAR ASPECT SHALL BE LITIGATED EXCLUSIVELY IN THE COURT OF FIRST INSTANCE OF PUERTO RICO, AND THE REMAINDER OF THIS SECTION 16 SHALL REMAIN IN EFFECT."}
          </p>

          <p className="mt-2">
            <strong>{es ? "16.4 Protocolo de arbitraje masivo. " : "16.4 Mass arbitration protocol. "}</strong>
            {es
              ? "SI VEINTICINCO (25) O MÁS RECLAMACIONES DE ARBITRAJE INDIVIDUAL, RELACIONADAS POR HECHOS, REPRESENTACIÓN LEGAL O ABOGADO COORDINADOR COMÚN, SE PRESENTAN EN UN PERÍODO DE SESENTA (60) DÍAS, LAS PARTES ACUERDAN EL SIGUIENTE PROCEDIMIENTO ESPECIAL, QUE SUSTITUYE LAS REGLAS ESTÁNDAR DE LA AAA EN ESTE ASPECTO: (i) las reclamaciones se agruparán en lotes de hasta cincuenta (50) casos; (ii) cada lote se asignará a un (1) árbitro y se procesará secuencialmente, no en paralelo; (iii) los honorarios y costos administrativos del arbitraje los pagará la Compañía SOLO para el primer lote; los lotes subsiguientes únicamente avanzarán si los reclamantes restantes pagan su porción proporcional de los honorarios administrativos conforme a las reglas de la AAA, sin que ello sea coercitivo; (iv) tras completarse los primeros tres (3) lotes, las partes y un mediador independiente designado por la AAA participarán en una mediación global obligatoria de hasta noventa (90) días antes de continuar lotes adicionales; (v) los plazos de prescripción se suspenden únicamente para los reclamantes cuyo lote esté activamente en cola. ESTE PROTOCOLO ESTÁ DISEÑADO PARA EVITAR ABUSOS DE ARBITRAJE MASIVO COORDINADO Y SE APLICARÁ EN ADICIÓN AL TOPE AGREGADO DE LA SECCIÓN 13(b)."
              : "IF TWENTY-FIVE (25) OR MORE INDIVIDUAL ARBITRATION CLAIMS, RELATED BY FACTS, LEGAL REPRESENTATION OR COORDINATING COUNSEL, ARE FILED WITHIN A SIXTY (60) DAY PERIOD, THE PARTIES AGREE TO THE FOLLOWING SPECIAL PROCEDURE, WHICH SUPERSEDES STANDARD AAA RULES IN THIS RESPECT: (i) the claims shall be grouped into batches of up to fifty (50) cases; (ii) each batch shall be assigned to one (1) arbitrator and processed sequentially, not in parallel; (iii) administrative fees and costs of arbitration shall be paid by the Company ONLY for the first batch; subsequent batches shall proceed only if the remaining claimants pay their proportional share of administrative fees per AAA rules, without coercion; (iv) after the first three (3) batches are completed, the parties and an independent AAA-appointed mediator shall participate in a mandatory global mediation of up to ninety (90) days before additional batches continue; (v) statutes of limitations are tolled only for claimants whose batch is actively in queue. THIS PROTOCOL IS DESIGNED TO PREVENT COORDINATED MASS-ARBITRATION ABUSE AND APPLIES IN ADDITION TO THE AGGREGATE CAP IN SECTION 13(b)."}
          </p>

          <p className="mt-2">
            <strong>{es ? "16.5 Derecho de exclusión (opt-out). " : "16.5 Opt-out right. "}</strong>
            {es
              ? "Puedes optar por NO sujetarte a esta cláusula de arbitraje y renuncia a demanda colectiva enviando una notificación escrita firmada a legal@charliesbarbershop.co dentro de los sesenta (60) días siguientes a la primera fecha en que aceptaste estos Términos (o esta versión actualizada). La notificación debe incluir tu nombre legal, correo, teléfono asociado a la cuenta y una declaración clara de exclusión. La exclusión no afectará el resto de los Términos. Si optas por excluirte, las disputas se litigarán en los foros descritos en la Sección 15, manteniéndose la renuncia a acción colectiva en la medida permitida por ley."
              : "You may opt OUT of this arbitration and class waiver clause by sending a signed written notice to legal@charliesbarbershop.co within sixty (60) days of the first date you accepted these Terms (or this updated version). The notice must include your legal name, email, phone associated with the account and a clear opt-out statement. Opting out will not affect the rest of the Terms. If you opt out, disputes shall be litigated in the venues described in Section 15, with the class action waiver remaining to the extent permitted by law."}
          </p>

          <p className="mt-2">
            <strong>{es ? "16.6 Excepciones. " : "16.6 Carve-outs. "}</strong>
            {es
              ? "Esta Sección 16 no aplica a: (a) reclamaciones en tribunales de reclamaciones menores siempre que el caso permanezca en ese foro y de manera individual; (b) acciones para proteger derechos de propiedad intelectual (incluyendo medidas cautelares); (c) acciones para cobrar montos vencidos por servicios prestados; y (d) cualquier derecho irrenunciable bajo la ley aplicable."
              : "This Section 16 does not apply to: (a) claims brought in small-claims court so long as the case remains in that venue and on an individual basis; (b) actions to protect intellectual property rights (including injunctive relief); (c) actions to collect amounts past due for services rendered; and (d) any non-waivable right under applicable law."}
          </p>

          <p className="mt-2">
            <strong>{es ? "16.7 Divisibilidad de esta Sección. " : "16.7 Severability of this Section. "}</strong>
            {es
              ? "Si alguna parte de esta Sección 16 (excepto la renuncia a demanda colectiva de la Sección 16.3) se declara inejecutable, esa parte se eliminará y el resto permanecerá en pleno vigor. Si la renuncia a demanda colectiva se declara inejecutable de forma íntegra, entonces la totalidad de esta Sección 16 quedará nula y la disputa se litigará conforme a la Sección 15, manteniéndose plenamente vigentes las limitaciones de responsabilidad de la Sección 13."
              : "If any part of this Section 16 (except the class action waiver in Section 16.3) is declared unenforceable, that part shall be severed and the remainder shall remain in full force. If the class action waiver is declared unenforceable in its entirety, then this entire Section 16 shall be void and the dispute shall be litigated in accordance with Section 15, with the limitations of liability in Section 13 remaining fully in force."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "17. Fuerza Mayor" : "17. Force Majeure"}
          </h2>
          <p>
            {es
              ? "No seremos responsables por incumplimientos o demoras causados por eventos fuera de nuestro control razonable, incluyendo desastres naturales, huracanes, terremotos, pandemias, apagones, fallas de telecomunicaciones, actos gubernamentales, conflictos laborales o ataques cibernéticos."
              : "We will not be liable for failures or delays caused by events beyond our reasonable control, including natural disasters, hurricanes, earthquakes, pandemics, power outages, telecommunications failures, government actions, labor disputes or cyberattacks."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "18. Modificaciones a los Términos" : "18. Modifications to the Terms"}
          </h2>
          <p>
            {es
              ? "Podemos modificar estos Términos en cualquier momento. Los cambios materiales serán notificados con al menos quince (15) días de anticipación por correo, push o aviso destacado en el sitio. El uso continuado del servicio después de la fecha de vigencia constituye aceptación de la nueva versión. Si no estás de acuerdo, debes dejar de usar el servicio."
              : "We may modify these Terms at any time. Material changes will be notified at least fifteen (15) days in advance via email, push or prominent site notice. Continued use of the service after the effective date constitutes acceptance of the new version. If you do not agree, you must stop using the service."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "19. Cesión" : "19. Assignment"}
          </h2>
          <p>
            {es
              ? "No puedes ceder ni transferir estos Términos sin nuestro consentimiento previo por escrito. Podemos ceder estos Términos libremente, incluyendo en el contexto de una fusión, adquisición o venta de activos."
              : "You may not assign or transfer these Terms without our prior written consent. We may assign these Terms freely, including in the context of a merger, acquisition or asset sale."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "20. Divisibilidad e Integralidad" : "20. Severability and Entire Agreement"}
          </h2>
          <p>
            {es
              ? "Si alguna disposición de estos Términos es considerada inválida o inaplicable por un tribunal competente, las demás disposiciones permanecerán en pleno vigor. Estos Términos, junto con la Política de Privacidad, la Política de Reembolsos y la Política de Reservas, constituyen el acuerdo íntegro entre las partes y reemplazan cualquier acuerdo previo verbal o escrito sobre la materia."
              : "If any provision of these Terms is held invalid or unenforceable by a competent court, the remaining provisions shall remain in full effect. These Terms, together with the Privacy Policy, Refund Policy and Booking Policy, constitute the entire agreement between the parties and supersede any prior oral or written agreement on the subject matter."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "21. Asistente de IA Filho" : "21. Filho AI Assistant"}
          </h2>
          <p>
            {es
              ? "Filho es un asistente conversacional impulsado por inteligencia artificial provisto como funcionalidad opcional dentro de la plataforma. El uso de Filho está sujeto a estos Términos y a la Política de Privacidad. Al usar Filho aceptas que: (a) las respuestas se generan automáticamente y se ofrecen \"COMO ESTÁN\", sin garantía de exactitud, completitud, idoneidad ni actualidad; (b) Filho NO sustituye el juicio profesional de un barbero, médico, abogado, contable ni de ningún otro profesional, y no debe ser interpretado como asesoramiento profesional, médico, legal, financiero ni regulatorio; (c) en caso de discrepancia entre una respuesta de Filho y la información oficial provista por un barbero humano, el administrador o cualquier documento legal de la Compañía, prevalece la fuente humana u oficial; (d) está prohibido usar Filho para: intentar evadir restricciones de seguridad o filtros (jailbreaking), generar contenido ilegal, abusivo, difamatorio, discriminatorio, sexualmente explícito o violento, hacer ingeniería inversa del sistema, scraping automatizado, revender o redistribuir las salidas con propósitos comerciales sin autorización por escrito, o suplantar a otra persona; (e) las salidas generadas por Filho pueden usarse únicamente para tu propio gestión de citas y consultas personales; los modelos de lenguaje subyacentes son propiedad de sus respectivos proveedores; (f) la limitación de responsabilidad establecida en la Sección 13 (incluyendo el tope de US$200) y la indemnización de la Sección 14 aplican plenamente a tu uso de Filho. La Compañía se reserva el derecho de suspender, limitar o descontinuar Filho en cualquier momento, sin previo aviso y sin responsabilidad."
              : "Filho is a conversational assistant powered by artificial intelligence offered as an optional feature within the platform. Use of Filho is subject to these Terms and the Privacy Policy. By using Filho you accept that: (a) responses are generated automatically and provided \"AS IS\", without warranty of accuracy, completeness, fitness or currency; (b) Filho does NOT replace the professional judgment of a barber, physician, attorney, accountant or any other professional, and must not be construed as professional, medical, legal, financial or regulatory advice; (c) in case of discrepancy between a Filho response and official information provided by a human barber, the administrator or any Company legal document, the human or official source prevails; (d) you may not use Filho to: attempt to bypass security restrictions or filters (jailbreaking), generate illegal, abusive, defamatory, discriminatory, sexually explicit or violent content, reverse-engineer the system, perform automated scraping, resell or redistribute outputs for commercial purposes without written authorization, or impersonate another person; (e) outputs generated by Filho may be used solely for your own appointment management and personal inquiries; the underlying language models are the property of their respective providers; (f) the limitation of liability set forth in Section 13 (including the US$200 cap) and the indemnification in Section 14 apply fully to your use of Filho. The Company reserves the right to suspend, limit or discontinue Filho at any time, without prior notice and without liability."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "21A. Programa de Recompensas (Puntos)" : "21A. Rewards Program (Points)"}
          </h2>
          <p>
            {es
              ? "El Programa de Recompensas otorga puntos por reservas elegibles completadas y pagadas dentro de la plataforma. Los puntos: (a) no son dinero, no devengan interés, no son canjeables por efectivo, y no son transferibles entre cuentas; (b) se acreditan únicamente cuando la cita se completa y el pago se asienta como elegible; (c) pueden ser revertidos automáticamente ante reembolso, cancelación tardía, no-show o detección de fraude o abuso; (d) pueden ajustarse manualmente por el administrador para corregir errores o aplicar ajustes operativos; (e) pueden expirar tras un periodo prolongado de inactividad si así se comunica con al menos 30 días de antelación. La Compañía se reserva el derecho de modificar las reglas, los niveles de beneficios, las equivalencias en puntos o descontinuar el programa en cualquier momento. Reglas detalladas en los "
              : "The Rewards Program awards points for eligible bookings completed and paid through the platform. Points: (a) are not money, do not accrue interest, are not redeemable for cash, and are not transferable between accounts; (b) are credited only when the appointment is completed and the payment settles as eligible; (c) may be automatically reversed upon refund, late cancellation, no-show or detection of fraud or abuse; (d) may be manually adjusted by the administrator to correct errors or apply operational adjustments; (e) may expire after a prolonged period of inactivity if communicated at least 30 days in advance. The Company reserves the right to modify rules, benefit tiers, point equivalencies, or discontinue the program at any time. Detailed rules in the "}
            <Link to="/terminos-recompensas" className="underline" style={{ color: "var(--text-primary)" }}>
              {es ? "Términos del Programa de Recompensas" : "Rewards Program Terms"}
            </Link>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "21B. Programa de Referidos" : "21B. Referral Program"}
          </h2>
          <p>
            {es
              ? "Cada cliente recibe un enlace personal de referidos. Cuando una persona nueva llega por ese enlace, crea su cuenta, reserva y paga su primera cita a través de un flujo digital rastreable, ambos (quien refiere y quien fue referido) reciben un bono de puntos. No se otorgan puntos por: auto-referidos, cuentas duplicadas, walk-ins, citas creadas manualmente por personal, citas no pagadas o canceladas, o cuando la atribución del referido no puede ser verificada técnicamente. Está prohibido: comprar, vender, intercambiar o publicar masivamente el enlace en directorios de spam, foros de fraude o programas de incentivos no autorizados. La Compañía puede invalidar puntos, suspender enlaces y/o terminar cuentas ante violaciones. Reglas detalladas en los "
              : "Each client receives a personal referral link. When a new person arrives via that link, creates their account, books and pays their first appointment through a trackable digital flow, both the referrer and the referred receive a points bonus. No points are granted for: self-referrals, duplicate accounts, walk-ins, appointments created manually by staff, unpaid or cancelled appointments, or when referral attribution cannot be technically verified. It is prohibited to: buy, sell, exchange or mass-post the link in spam directories, fraud forums or unauthorized incentive programs. The Company may void points, suspend links and/or terminate accounts upon violations. Detailed rules in the "}
            <Link to="/terminos-referidos" className="underline" style={{ color: "var(--text-primary)" }}>
              {es ? "Términos del Programa de Referidos" : "Referral Program Terms"}
            </Link>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "21C. Antifraude y Reversión de Puntos" : "21C. Anti-Fraud and Points Reversal"}
          </h2>
          <p>
            {es
              ? "La Compañía puede revertir, congelar o anular puntos, bonificaciones o beneficios cuando exista evidencia razonable de: fraude, suplantación de identidad, uso de información falsa, manipulación de la atribución de referidos (incluyendo limpiar y volver a abrir el mismo enlace, usar VPNs o múltiples dispositivos para simular tráfico distinto), cuentas duplicadas, chargebacks, devoluciones, cancelaciones tardías reiteradas, no-shows reiterados o cualquier otra conducta abusiva. Esta facultad es discrecional y final, sin afectar otros remedios legales disponibles."
              : "The Company may reverse, freeze or void points, bonuses or benefits when there is reasonable evidence of: fraud, identity impersonation, use of false information, manipulation of referral attribution (including clearing and re-opening the same link, using VPNs or multiple devices to fake distinct traffic), duplicate accounts, chargebacks, refunds, repeated late cancellations, repeated no-shows or any other abusive behavior. This authority is discretionary and final, without affecting other available legal remedies."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "21D. Píxeles, Análisis y Publicidad" : "21D. Pixels, Analytics & Advertising"}
          </h2>
          <p>
            {es
              ? "Al aceptar el banner de cookies, autorizas la activación de herramientas de medición y publicidad de terceros (Google Analytics, Meta Pixel y similares) descritas en la "
              : "By accepting the cookie banner, you authorize the activation of third-party measurement and advertising tools (Google Analytics, Meta Pixel and similar) described in the "}
            <Link to="/privacidad" className="underline" style={{ color: "var(--text-primary)" }}>{es ? "Política de Privacidad" : "Privacy Policy"}</Link>
            {es ? " y la " : " and the "}
            <Link to="/cookies" className="underline" style={{ color: "var(--text-primary)" }}>{es ? "Política de Cookies" : "Cookie Policy"}</Link>
            {es
              ? ". Puedes rechazar el seguimiento no esencial en cualquier momento; las cookies esenciales y la atribución de referidos seguirán activas por ser necesarias para operar el servicio."
              : ". You may reject non-essential tracking at any time; essential cookies and referral attribution remain active because they are necessary to operate the service."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "22. Contacto" : "22. Contact"}
          </h2>
          <p>
            {es ? "Para preguntas sobre estos Términos:" : "For questions about these Terms:"}
          </p>
          <p className="mt-2 font-semibold" style={{ color: "var(--text-primary)" }}>
            C&O Ventures, LLC<br />
            d/b/a Charlie's Barbershop<br />
            PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627<br />
            +1 (787) 348-1281
          </p>
        </section>

        <section className="pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {es ? "Documentos relacionados:" : "Related documents:"}{" "}
            <Link to="/privacidad" className="underline">{es ? "Política de Privacidad" : "Privacy Policy"}</Link>{" · "}
            <Link to="/reembolsos" className="underline">{es ? "Política de Reembolsos" : "Refund Policy"}</Link>{" · "}
            <Link to="/politica-reservas" className="underline">{es ? "Política de Reservas" : "Booking Policy"}</Link>
          </p>
        </section>
      </div>
    </div>
    </>
  );
}
