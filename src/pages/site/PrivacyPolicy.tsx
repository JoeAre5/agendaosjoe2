import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  const { language } = useTranslation();
  const es = language === "es";

  return (
    <>
    <SEOHead
      title={es ? "Política de Privacidad · Charlie's Barbershop" : "Privacy Policy · Charlie's Barbershop"}
      description={es ? "Cómo C&O Ventures, LLC (Charlie's Barbershop) recopila, usa, comparte y protege tu información personal." : "How C&O Ventures, LLC (Charlie's Barbershop) collects, uses, shares and protects your personal information."}
      path="/privacidad"
    />
    <div className="max-w-3xl mx-auto px-5 py-16 pb-28 md:pb-16">
      <h1
        className="font-black uppercase leading-[0.95] mb-6"
        style={{ fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-1px", color: "var(--text-primary)" }}
      >
        {es ? "Política de Privacidad" : "Privacy Policy"}
      </h1>
      <p className="text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
        {es ? "Última actualización: 14 de mayo de 2026 · Vigente desde: 14 de mayo de 2026" : "Last updated: May 14, 2026 · Effective: May 14, 2026"}
      </p>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        <section>
          <p>
            {es
              ? "Esta Política de Privacidad describe cómo C&O Ventures, LLC, una compañía de responsabilidad limitada organizada bajo las leyes del Estado Libre Asociado de Puerto Rico, haciendo negocios como Charlie's Barbershop (en adelante, \"nosotros\", \"nuestro\" o la \"Compañía\"), recopila, usa, divulga y protege tu información personal cuando visitas nuestro sitio web, usas nuestra aplicación web progresiva (PWA), reservas servicios o interactúas con nosotros de cualquier forma. Al usar nuestros servicios, aceptas las prácticas descritas en esta política."
              : "This Privacy Policy describes how C&O Ventures, LLC, a limited liability company organized under the laws of the Commonwealth of Puerto Rico, doing business as Charlie's Barbershop (\"we\", \"our\" or the \"Company\"), collects, uses, discloses and protects your personal information when you visit our website, use our progressive web application (PWA), book services or interact with us in any way. By using our services, you agree to the practices described in this policy."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "1. Información que Recopilamos" : "1. Information We Collect"}
          </h2>
          <p className="mb-2"><strong>{es ? "1.1 Información que tú nos proporcionas:" : "1.1 Information you provide to us:"}</strong></p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>{es ? "Datos de identidad y contacto: nombre, apellido, número de teléfono, correo electrónico." : "Identity and contact data: first name, last name, phone number, email address."}</li>
            <li>{es ? "Datos de cuenta: contraseña (almacenada de forma cifrada), preferencias de barbero, idioma." : "Account data: password (stored encrypted), barber preferences, language."}</li>
            <li>{es ? "Datos de citas: servicio reservado, fecha y hora, notas, historial de visitas." : "Appointment data: service booked, date and time, notes, visit history."}</li>
            <li>{es ? "Datos de pago: procesados directamente por Stripe, PayPal y ATH Móvil. Nosotros NO almacenamos números completos de tarjeta. Solo guardamos referencias tokenizadas (últimos 4 dígitos, marca, expiración) y un identificador opaco del procesador." : "Payment data: processed directly by Stripe, PayPal and ATH Móvil. We do NOT store full card numbers. We only retain tokenized references (last 4 digits, brand, expiration) and an opaque processor identifier."}</li>
            <li>{es ? "Comunicaciones: mensajes que nos envías por formularios, WhatsApp, correo o el chat con nuestro asistente Filho." : "Communications: messages you send us via forms, WhatsApp, email or our Filho assistant chat."}</li>
          </ul>
          <p className="mt-3 mb-2"><strong>{es ? "1.2 Información recopilada automáticamente:" : "1.2 Information collected automatically:"}</strong></p>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>{es ? "Datos de dispositivo y uso: tipo de dispositivo, sistema operativo, navegador, dirección IP, páginas visitadas, tiempo de sesión." : "Device and usage data: device type, OS, browser, IP address, pages visited, session time."}</li>
            <li>{es ? "Cookies y tecnologías similares: usamos cookies estrictamente necesarias (autenticación, sesión) y cookies analíticas para entender cómo se usa el sitio. No usamos cookies publicitarias de terceros." : "Cookies and similar technologies: we use strictly necessary cookies (authentication, session) and analytics cookies to understand site usage. We do not use third-party advertising cookies."}</li>
            <li>{es ? "Suscripciones de notificaciones push: cuando aceptas notificaciones, almacenamos un endpoint anónimo del navegador para enviarte recordatorios de citas y actualizaciones de servicio." : "Push notification subscriptions: when you accept notifications, we store an anonymous browser endpoint to send you appointment reminders and service updates."}</li>
          </ul>
          <p className="mt-3 mb-2"><strong>{es ? "1.3 Información de terceros:" : "1.3 Information from third parties:"}</strong></p>
          <p>{es ? "Recibimos confirmaciones de pago de Stripe, PayPal y ATH Móvil; datos de calendario y disponibilidad de Acuity Scheduling; y datos de autenticación cuando inicias sesión con Google." : "We receive payment confirmations from Stripe, PayPal and ATH Móvil; calendar and availability data from Acuity Scheduling; and authentication data when you sign in with Google."}</p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "2. Cómo Usamos tu Información" : "2. How We Use Your Information"}
          </h2>
          <p>{es ? "Usamos tu información para los siguientes fines legítimos:" : "We use your information for the following legitimate purposes:"}</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>{es ? "Crear y administrar tu cuenta, autenticarte y mantener la seguridad de la sesión." : "Create and manage your account, authenticate you, and maintain session security."}</li>
            <li>{es ? "Reservar, confirmar, recordar, modificar y cancelar citas." : "Book, confirm, remind, modify and cancel appointments."}</li>
            <li>{es ? "Procesar pagos, propinas y reembolsos manuales." : "Process payments, tips and manual refunds."}</li>
            <li>{es ? "Enviarte comunicaciones transaccionales (confirmaciones, recordatorios, recibos) por correo, SMS y notificaciones push." : "Send you transactional communications (confirmations, reminders, receipts) via email, SMS and push notifications."}</li>
            <li>{es ? "Enviarte comunicaciones promocionales solo si has dado tu consentimiento expreso, con opción de cancelar en cualquier momento." : "Send you promotional communications only if you have given express consent, with opt-out available at any time."}</li>
            <li>{es ? "Mejorar nuestro servicio mediante análisis estadístico agregado." : "Improve our service through aggregated statistical analysis."}</li>
            <li>{es ? "Prevenir fraude, abuso, violaciones de los términos y proteger derechos legales." : "Prevent fraud, abuse, terms violations and protect legal rights."}</li>
            <li>{es ? "Cumplir con obligaciones legales, fiscales y contables aplicables en Puerto Rico y Estados Unidos." : "Comply with legal, tax and accounting obligations applicable in Puerto Rico and the United States."}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "3. Base Legal del Procesamiento" : "3. Legal Basis for Processing"}
          </h2>
          <p>
            {es
              ? "Procesamos tu información sobre las siguientes bases: (a) ejecución del contrato cuando reservas un servicio; (b) tu consentimiento para marketing y notificaciones push; (c) intereses legítimos en operar, asegurar y mejorar el servicio; y (d) cumplimiento de obligaciones legales."
              : "We process your information on the following bases: (a) contract performance when you book a service; (b) your consent for marketing and push notifications; (c) legitimate interests in operating, securing and improving the service; and (d) compliance with legal obligations."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "4. Comunicaciones por SMS y Correo" : "4. SMS and Email Communications"}
          </h2>
          <p>
            {es
              ? "Los recordatorios y confirmaciones por SMS son enviados a través de nuestro proveedor de calendario, Acuity Scheduling (Squarespace, Inc.), que cumple con los requisitos de las redes celulares de EE.UU. (incluyendo el registro 10DLC). Al proporcionar tu número de teléfono y reservar una cita, consientes recibir mensajes transaccionales relacionados con tus citas. Puedes cancelar respondiendo STOP a cualquier mensaje. Pueden aplicar tarifas estándar de mensajería del operador."
              : "SMS reminders and confirmations are delivered through our scheduling provider, Acuity Scheduling (Squarespace, Inc.), which complies with U.S. carrier requirements (including 10DLC registration). By providing your phone number and booking an appointment, you consent to receive transactional messages related to your appointments. You may opt out by replying STOP to any message. Standard carrier messaging rates may apply."}
          </p>
          <p className="mt-2">
            {es
              ? "Los correos transaccionales (confirmaciones, recibos, restablecimientos de contraseña) se envían sin necesidad de opt-in adicional porque son requeridos para entregar el servicio que solicitaste. Los correos promocionales solo se envían a usuarios que se han suscrito explícitamente y cada correo incluye un enlace para cancelar la suscripción."
              : "Transactional emails (confirmations, receipts, password resets) are sent without additional opt-in because they are necessary to deliver the service you requested. Promotional emails are only sent to users who have explicitly subscribed and every email includes an unsubscribe link."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "5. Notificaciones Push" : "5. Push Notifications"}
          </h2>
          <p>
            {es
              ? "Si aceptas notificaciones push en tu navegador o PWA, recibirás recordatorios de citas, confirmaciones, cambios de horario y, ocasionalmente, ofertas. Puedes desactivar las notificaciones push en cualquier momento desde la configuración de tu navegador o sistema operativo, o desde la sección de preferencias dentro de la app."
              : "If you accept push notifications in your browser or PWA, you will receive appointment reminders, confirmations, schedule changes and, occasionally, offers. You can disable push notifications at any time from your browser or operating system settings, or from the preferences section inside the app."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "6. Compartir Información con Terceros" : "6. Sharing Information with Third Parties"}
          </h2>
          <p>{es ? "No vendemos tu información personal. La compartimos solo con proveedores de servicios necesarios para operar el negocio:" : "We do not sell your personal information. We share it only with service providers necessary to operate the business:"}</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>Stripe, Inc.</strong> {es ? "(procesamiento de tarjetas de crédito/débito y Apple Pay/Google Pay)." : "(credit/debit card and Apple Pay/Google Pay processing)."}</li>
            <li><strong>PayPal Holdings, Inc.</strong> {es ? "(procesamiento de pagos PayPal)." : "(PayPal payment processing)."}</li>
            <li><strong>Evertec / ATH Móvil</strong> {es ? "(procesamiento de pagos ATH Móvil)." : "(ATH Móvil payment processing)."}</li>
            <li><strong>Squarespace, Inc. (Acuity Scheduling)</strong> {es ? "(calendario, SMS transaccional, recordatorios)." : "(calendar, transactional SMS, reminders)."}</li>
            <li><strong>Supabase, Inc.</strong> {es ? "(infraestructura de base de datos y autenticación)." : "(database and authentication infrastructure)."}</li>
            <li><strong>Google LLC</strong> {es ? "(autenticación opcional con Google y servicios de mapas)." : "(optional Google sign-in and Maps services)."}</li>
            <li>{es ? "Autoridades gubernamentales cuando sea requerido por ley, orden judicial válida o citación." : "Government authorities when required by law, valid court order or subpoena."}</li>
            <li>{es ? "Asesores legales, contables y auditores bajo deberes de confidencialidad." : "Legal advisors, accountants and auditors under confidentiality duties."}</li>
            <li>{es ? "En caso de fusión, adquisición o venta de activos, donde la información se transferirá al sucesor bajo los mismos compromisos de privacidad." : "In the event of merger, acquisition or asset sale, where information will be transferred to the successor under the same privacy commitments."}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "7. Retención de Datos" : "7. Data Retention"}
          </h2>
          <p>
            {es
              ? "Conservamos tu información mientras tu cuenta esté activa y por el período adicional necesario para cumplir obligaciones fiscales (mínimo 6 años para registros financieros bajo requisitos del Departamento de Hacienda de Puerto Rico y el IRS), resolver disputas, hacer cumplir nuestros acuerdos y proteger derechos legales. Puedes solicitar la eliminación de tu cuenta y datos personales no obligados por ley enviando un correo a la dirección al final de esta política."
              : "We retain your information while your account is active and for the additional period necessary to comply with tax obligations (minimum 6 years for financial records under Puerto Rico Treasury Department and IRS requirements), resolve disputes, enforce our agreements and protect legal rights. You may request deletion of your account and personal data not required by law by emailing the address at the end of this policy."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "8. Tus Derechos" : "8. Your Rights"}
          </h2>
          <p>{es ? "Tienes los siguientes derechos respecto a tu información personal:" : "You have the following rights regarding your personal information:"}</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li><strong>{es ? "Acceso:" : "Access:"}</strong> {es ? "Solicitar una copia de la información que tenemos sobre ti." : "Request a copy of the information we hold about you."}</li>
            <li><strong>{es ? "Corrección:" : "Correction:"}</strong> {es ? "Actualizar información inexacta o incompleta directamente desde tu perfil o solicitándolo." : "Update inaccurate or incomplete information directly from your profile or by request."}</li>
            <li><strong>{es ? "Eliminación:" : "Deletion:"}</strong> {es ? "Solicitar la eliminación de tu cuenta y datos personales (sujeto a obligaciones legales de retención)." : "Request deletion of your account and personal data (subject to legal retention obligations)."}</li>
            <li><strong>{es ? "Portabilidad:" : "Portability:"}</strong> {es ? "Recibir tus datos en formato estructurado y legible por máquina." : "Receive your data in a structured, machine-readable format."}</li>
            <li><strong>{es ? "Oposición y limitación:" : "Objection and restriction:"}</strong> {es ? "Oponerte al procesamiento para marketing directo en cualquier momento." : "Object to processing for direct marketing at any time."}</li>
            <li><strong>{es ? "Retiro de consentimiento:" : "Withdraw consent:"}</strong> {es ? "Retirar tu consentimiento sin que afecte la legalidad del procesamiento previo." : "Withdraw consent without affecting the lawfulness of prior processing."}</li>
            <li><strong>{es ? "No discriminación:" : "Non-discrimination:"}</strong> {es ? "No te negaremos servicio, ni cobraremos precios diferentes, por ejercer estos derechos (consistente con CCPA/CPRA de California, aplicable solo a residentes elegibles)." : "We will not deny service, or charge different prices, for exercising these rights (consistent with California CCPA/CPRA, applicable only to eligible residents)."}</li>
          </ul>
          <p className="mt-2">{es ? "Para ejercer cualquiera de estos derechos, escríbenos a la dirección al final de esta política. Responderemos dentro de 30 días." : "To exercise any of these rights, contact us at the address at the end of this policy. We will respond within 30 days."}</p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "9. Seguridad de los Datos" : "9. Data Security"}
          </h2>
          <p>
            {es
              ? "Implementamos medidas técnicas y organizativas razonables para proteger tu información: cifrado en tránsito (TLS), cifrado en reposo, control de acceso por roles (Row-Level Security), autenticación con contraseña hasheada, registros de auditoría y separación financiera por barbero. Ningún sistema es 100% seguro; en caso de una violación de datos que afecte tu información personal, te notificaremos sin demora indebida según lo requiera la ley aplicable."
              : "We implement reasonable technical and organizational measures to protect your information: encryption in transit (TLS), encryption at rest, role-based access control (Row-Level Security), hashed-password authentication, audit logs and per-barber financial isolation. No system is 100% secure; in the event of a data breach affecting your personal information, we will notify you without undue delay as required by applicable law."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "10. Menores de Edad" : "10. Minors"}
          </h2>
          <p>
            {es
              ? "Nuestros servicios no están dirigidos a menores de 13 años y no recopilamos a sabiendas información personal de niños menores de 13. Los menores entre 13 y 17 años solo pueden reservar servicios con consentimiento y supervisión de un padre o tutor legal. Si crees que un menor nos ha proporcionado información sin consentimiento, contáctanos y la eliminaremos."
              : "Our services are not directed to children under 13 and we do not knowingly collect personal information from children under 13. Minors between 13 and 17 may only book services with consent and supervision of a parent or legal guardian. If you believe a minor has provided us information without consent, contact us and we will delete it."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "11. Transferencias Internacionales" : "11. International Transfers"}
          </h2>
          <p>
            {es
              ? "Nuestros proveedores de infraestructura (Supabase, Stripe, PayPal, Google) operan principalmente desde Estados Unidos. Tu información puede ser procesada en EE.UU. continental u otras jurisdicciones donde estos proveedores operen, sujeta a sus propias políticas de privacidad y salvaguardas estándar de la industria."
              : "Our infrastructure providers (Supabase, Stripe, PayPal, Google) operate primarily from the United States. Your information may be processed in the U.S. mainland or other jurisdictions where these providers operate, subject to their own privacy policies and industry-standard safeguards."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "12. Datos Biométricos" : "12. Biometric Data"}
          </h2>
          <p>
            {es
              ? "No recopilamos, almacenamos ni procesamos datos biométricos (huellas dactilares, reconocimiento facial, voz). Si en el futuro habilitamos autenticación biométrica, será mediante APIs nativas del dispositivo donde los datos biométricos nunca salen de tu equipo."
              : "We do not collect, store or process biometric data (fingerprints, face recognition, voice). If we enable biometric authentication in the future, it will be through native device APIs where biometric data never leaves your device."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "13. Cookies y Tecnologías de Seguimiento" : "13. Cookies and Tracking Technologies"}
          </h2>
          <p>
            {es
              ? "Usamos cookies de sesión y tokens locales (localStorage) para mantenerte autenticado, recordar tu idioma y guardar preferencias de la app. Usamos analítica básica para entender el rendimiento del sitio. No usamos cookies publicitarias de terceros, ni pixeles de seguimiento publicitario, ni vendemos información a corredores de datos. Puedes deshabilitar las cookies desde tu navegador, aunque algunas funciones (como permanecer conectado) dejarán de operar."
              : "We use session cookies and local tokens (localStorage) to keep you signed in, remember your language and save app preferences. We use basic analytics to understand site performance. We do not use third-party advertising cookies, advertising tracking pixels, or sell information to data brokers. You may disable cookies in your browser, though some features (such as staying signed in) will stop working."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "14. Enlaces a Sitios de Terceros" : "14. Third-Party Links"}
          </h2>
          <p>
            {es
              ? "Nuestro sitio puede enlazar a sitios de terceros (Google Maps, redes sociales, procesadores de pago). No somos responsables de las prácticas de privacidad de esos sitios. Te recomendamos revisar sus políticas antes de proporcionar información."
              : "Our site may link to third-party sites (Google Maps, social media, payment processors). We are not responsible for the privacy practices of those sites. We recommend reviewing their policies before providing information."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "15. Aviso a Residentes de California (CCPA/CPRA)" : "15. Notice to California Residents (CCPA/CPRA)"}
          </h2>
          <p>
            {es
              ? "Si eres residente de California, la Ley de Privacidad del Consumidor de California (CCPA), modificada por la Ley de Derechos de Privacidad de California (CPRA), te otorga derechos adicionales sobre tu información personal. En los últimos 12 meses, hemos recopilado las categorías descritas en la Sección 1 (identificadores, información de contacto, datos comerciales de citas y pagos, datos de internet/dispositivo, e inferencias limitadas para mejorar el servicio). NO vendemos ni compartimos tu información personal para publicidad conductual de contexto cruzado, y no hemos hecho ninguna venta o compartición en los últimos 12 meses según se definen estos términos en CCPA/CPRA. Como residente de California tienes derecho a: (a) saber qué información personal recopilamos, usamos y divulgamos; (b) solicitar la eliminación de tu información personal; (c) corregir información inexacta; (d) limitar el uso de información personal sensible; y (e) no recibir trato discriminatorio por ejercer estos derechos. Para ejercer estos derechos, escríbenos al correo o dirección al final de esta política identificándote como residente de California; verificaremos tu identidad antes de procesar la solicitud y responderemos dentro de 45 días. Puedes designar a un agente autorizado por escrito para presentar solicitudes en tu nombre."
              : "If you are a California resident, the California Consumer Privacy Act (CCPA), as amended by the California Privacy Rights Act (CPRA), grants you additional rights regarding your personal information. In the past 12 months, we have collected the categories described in Section 1 (identifiers, contact information, commercial appointment and payment data, internet/device data, and limited inferences to improve service). We do NOT sell or share your personal information for cross-context behavioral advertising, and we have not made any sale or sharing in the past 12 months as those terms are defined under CCPA/CPRA. As a California resident you have the right to: (a) know what personal information we collect, use and disclose; (b) request deletion of your personal information; (c) correct inaccurate information; (d) limit the use of sensitive personal information; and (e) not receive discriminatory treatment for exercising these rights. To exercise these rights, write to the email or address at the end of this policy identifying yourself as a California resident; we will verify your identity before processing the request and will respond within 45 days. You may designate an authorized agent in writing to submit requests on your behalf."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "16. Accesibilidad (ADA / WCAG)" : "16. Accessibility (ADA / WCAG)"}
          </h2>
          <p>
            {es
              ? "C&O Ventures, LLC se compromete a proporcionar un sitio web, PWA y experiencia presencial accesibles a personas con discapacidades, en línea con la Ley de Estadounidenses con Discapacidades (ADA) y los esfuerzos continuos para cumplir con las Pautas de Accesibilidad para el Contenido Web (WCAG) 2.1 nivel AA. Trabajamos activamente para mejorar el contraste, navegación con teclado, etiquetas ARIA y compatibilidad con lectores de pantalla. Nuestra barbería física en Camuy, PR ofrece acceso a personas con movilidad reducida. Si encuentras una barrera de accesibilidad en nuestro sitio, app o local, o necesitas un formato alternativo de comunicación o asistencia para reservar una cita, contáctanos al +1 (787) 348-1281 o por correo y haremos esfuerzos razonables para acomodarte sin costo adicional. Esta declaración será revisada periódicamente."
              : "C&O Ventures, LLC is committed to providing an accessible website, PWA and in-person experience to people with disabilities, in line with the Americans with Disabilities Act (ADA) and ongoing efforts to conform with the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. We actively work to improve contrast, keyboard navigation, ARIA labels and screen-reader compatibility. Our physical barbershop in Camuy, PR provides access for people with reduced mobility. If you encounter an accessibility barrier on our site, app or premises, or need an alternative communication format or assistance booking an appointment, contact us at +1 (787) 348-1281 or by email and we will make reasonable efforts to accommodate you at no additional cost. This statement will be reviewed periodically."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "17. Cambios a esta Política" : "17. Changes to this Policy"}
          </h2>
          <p>
            {es
              ? "Podemos actualizar esta Política de Privacidad periódicamente. Si los cambios son materiales, te notificaremos por correo electrónico, notificación push o aviso destacado en el sitio al menos 15 días antes de que entren en vigor. La fecha de \"Última actualización\" indica la versión vigente."
              : "We may update this Privacy Policy from time to time. If changes are material, we will notify you by email, push notification or a prominent site notice at least 15 days before they take effect. The \"Last updated\" date indicates the version in effect."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "18. Asistente de IA Filho" : "18. Filho AI Assistant"}
          </h2>
          <p>
            {es
              ? "Filho es un asistente conversacional impulsado por inteligencia artificial, ofrecido como una funcionalidad opcional dentro de la plataforma de Charlie's Barbershop. Cuando interactúas con Filho, los mensajes que escribes (y, para usuarios autenticados, un identificador de tu cuenta y el contexto mínimo necesario, como tu próxima cita o barbero preferido) se envían a un proveedor externo de modelos de lenguaje grandes (LLM) bajo acuerdos comerciales de procesamiento de datos. NO enviamos al proveedor del modelo: contraseñas, números completos de tarjeta, tokens de pago, ni información biométrica. Las conversaciones pueden ser registradas por la Compañía y por el proveedor del modelo por períodos limitados (típicamente hasta 30 días por el proveedor del modelo, hasta 90 días por nosotros) con fines de seguridad, prevención de abuso, depuración y mejora del servicio. No usamos el contenido de tus conversaciones con Filho para entrenar modelos de inteligencia artificial de terceros. Filho puede ofrecer respuestas inexactas, incompletas o desactualizadas; sus respuestas son generadas por IA y no constituyen asesoramiento profesional, médico, legal ni financiero. Si necesitas confirmación oficial sobre precios, citas o políticas, consulta con un barbero humano o el administrador. Puedes dejar de usar Filho en cualquier momento cerrando la ventana del chat."
              : "Filho is a conversational assistant powered by artificial intelligence, offered as an optional feature inside the Charlie's Barbershop platform. When you interact with Filho, the messages you type (and, for authenticated users, an account identifier and the minimum context needed, such as your next appointment or preferred barber) are sent to a third-party large language model (LLM) provider under commercial data-processing agreements. We do NOT send the model provider: passwords, full card numbers, payment tokens or biometric information. Conversations may be logged by the Company and by the model provider for limited periods (typically up to 30 days by the model provider, up to 90 days by us) for security, abuse prevention, debugging and service improvement. We do not use the content of your Filho conversations to train third-party AI models. Filho may produce inaccurate, incomplete or outdated responses; its replies are AI-generated and do not constitute professional, medical, legal or financial advice. For official confirmation about prices, appointments or policies, consult a human barber or the administrator. You may stop using Filho at any time by closing the chat window."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "18A. Programa de Recompensas y Referidos" : "18A. Rewards & Referral Program"}
          </h2>
          <p>
            {es
              ? "Si participas en el Programa de Recompensas o de Referidos, procesamos datos necesarios para acreditar puntos, atribuir referidos y prevenir abuso: identificador de cliente, citas elegibles, monto pagado, fuente de la reserva (PWA, sitio público, enlace de referido, walk-in, manual), código de referido capturado (cookie/localStorage ref_attribution por hasta 90 días), parámetros UTM y dispositivo asociado. La elegibilidad para acumular puntos está limitada a reservas que entran por flujos digitales rastreables; las reservas walk-in, manuales o telefónicas no acumulan puntos automáticamente. Los puntos no son dinero, no devengan interés y no son canjeables por efectivo. Podemos revertir, ajustar o anular puntos en casos de fraude, abuso, reembolso, cancelación o uso indebido. Consulta los "
              : "If you participate in the Rewards or Referral Program, we process data needed to credit points, attribute referrals and prevent abuse: client identifier, eligible appointments, amount paid, booking source (PWA, public site, referral link, walk-in, manual), captured referral code (cookie/localStorage ref_attribution for up to 90 days), UTM parameters and associated device. Eligibility to earn points is limited to bookings entering through trackable digital flows; walk-in, manual or phone bookings do not earn points automatically. Points are not money, do not accrue interest and are not redeemable for cash. We may reverse, adjust or void points in cases of fraud, abuse, refund, cancellation or misuse. See the "}
            <Link to="/terminos-recompensas" className="underline">{es ? "Términos de Recompensas" : "Rewards Terms"}</Link>{" · "}
            <Link to="/terminos-referidos" className="underline">{es ? "Términos de Referidos" : "Referral Terms"}</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "18B. Píxeles, Análisis y Publicidad" : "18B. Pixels, Analytics & Advertising"}
          </h2>
          <p>
            {es
              ? "Cuando das tu consentimiento en el banner de cookies, podemos activar herramientas de medición y publicidad de terceros, incluyendo Google Analytics y Meta Pixel (Facebook/Instagram), para entender el desempeño del sitio, medir conversiones de campañas y mostrar anuncios más relevantes. Estas herramientas pueden recopilar dirección IP truncada, identificador de navegador/dispositivo, páginas visitadas, eventos de reserva y datos de campaña. No compartimos con estos proveedores tu correo, teléfono ni datos de pago en texto plano. Puedes rechazar el seguimiento no esencial desde el banner de cookies o cambiar tus preferencias en cualquier momento; las cookies esenciales y la atribución de referidos seguirán activas por ser necesarias para operar el servicio. Más detalles en nuestra "
              : "When you consent via the cookie banner, we may activate third-party measurement and advertising tools, including Google Analytics and Meta Pixel (Facebook/Instagram), to understand site performance, measure campaign conversions and show more relevant advertising. These tools may collect truncated IP address, browser/device identifier, pages visited, booking events and campaign data. We do not share your email, phone or payment data in plain text with these providers. You may reject non-essential tracking from the cookie banner or change your preferences at any time; essential cookies and referral attribution remain active because they are necessary to operate the service. See our "}
            <Link to="/cookies" className="underline">{es ? "Política de Cookies" : "Cookie Policy"}</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "18C. Periodos de Retención Específicos" : "18C. Specific Retention Periods"}
          </h2>
          <ul className="list-disc pl-5 mt-1 space-y-1">
            <li>{es ? "Cuenta, perfil y preferencias: mientras la cuenta esté activa." : "Account, profile and preferences: while the account is active."}</li>
            <li>{es ? "Citas e historial de visitas: mínimo 6 años desde la última actividad (requisito fiscal PR/IRS)." : "Appointments and visit history: minimum 6 years from last activity (PR/IRS tax requirement)."}</li>
            <li>{es ? "Transacciones y registros financieros: 6-10 años." : "Transactions and financial records: 6-10 years."}</li>
            <li>{es ? "Datos de pago tokenizados: mientras tengas un método guardado." : "Tokenized payment data: while a saved method exists."}</li>
            <li>{es ? "Suscripciones push: hasta que las desactives o caduque el endpoint." : "Push subscriptions: until you disable them or the endpoint expires."}</li>
            <li>{es ? "Atribución de referidos (ref_attribution): hasta 90 días desde el último clic." : "Referral attribution (ref_attribution): up to 90 days from last click."}</li>
            <li>{es ? "Consentimiento de cookies: hasta 12 meses." : "Cookie consent: up to 12 months."}</li>
            <li>{es ? "Logs de análisis/píxeles agregados: 14-26 meses según el proveedor." : "Aggregated analytics/pixel logs: 14-26 months depending on provider."}</li>
            <li>{es ? "Conversaciones con Filho (IA): hasta 90 días por nosotros, hasta 30 días por el proveedor del modelo." : "Filho (AI) conversations: up to 90 days by us, up to 30 days by the model provider."}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            {es ? "19. Contacto" : "19. Contact"}
          </h2>
          <p>
            {es
              ? "Para preguntas, solicitudes de ejercicio de derechos, o reportes de incidentes de privacidad, contáctanos en:"
              : "For questions, rights requests or privacy incident reports, contact us at:"}
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
            <Link to="/terminos" className="underline">{es ? "Términos y Condiciones" : "Terms & Conditions"}</Link>{" · "}
            <Link to="/reembolsos" className="underline">{es ? "Política de Reembolsos" : "Refund Policy"}</Link>{" · "}
            <Link to="/politica-reservas" className="underline">{es ? "Política de Reservas" : "Booking Policy"}</Link>
          </p>
        </section>
      </div>
    </div>
    </>
  );
}
