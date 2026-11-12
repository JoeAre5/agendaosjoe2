import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";

export default function CookiePolicy() {
  const { language } = useTranslation();
  const es = language === "es";

  return (
    <>
      <SEOHead
        title={es ? "Política de Cookies · Charlie's Barbershop" : "Cookie Policy · Charlie's Barbershop"}
        description={es
          ? "Cómo Charlie's Barbershop usa cookies, píxeles y tecnologías de seguimiento similares."
          : "How Charlie's Barbershop uses cookies, pixels and similar tracking technologies."}
        path="/cookies"
      />
      <div className="max-w-3xl mx-auto px-5 py-16 pb-28 md:pb-16">
        <h1
          className="font-black uppercase leading-[0.95] mb-6"
          style={{ fontSize: "clamp(28px, 5vw, 44px)", letterSpacing: "-1px", color: "var(--text-primary)" }}
        >
          {es ? "Política de Cookies" : "Cookie Policy"}
        </h1>
        <p className="text-xs mb-8" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Última actualización: 20 de noviembre de 2026" : "Last updated: November 20, 2026"}
        </p>

        <div className="space-y-6 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <section>
            <p>
              {es
                ? "Usamos cookies, píxeles, almacenamiento local y tecnologías similares para operar nuestro sitio web, mejorar tu experiencia, medir el desempeño de campañas de mercadeo y apoyar publicidad. Esta política explica qué tecnologías utilizamos, para qué sirven y cómo puedes manejar tus preferencias."
                : "We use cookies, pixels, local storage and similar technologies to operate our website, improve your experience, measure marketing performance and support advertising. This policy explains what technologies we use, what they do, and how you can manage your preferences."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "1. Cookies Esenciales" : "1. Essential Cookies"}
            </h2>
            <p>
              {es
                ? "Necesarias para que el sitio web, el sistema de reservas, el inicio de sesión, la seguridad y la app funcionen correctamente. No se pueden desactivar."
                : "Required for the website, booking system, login, security and app to function correctly. These cannot be disabled."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "2. Cookies Funcionales" : "2. Functional Cookies"}
            </h2>
            <p>
              {es
                ? "Recuerdan tus preferencias (idioma, modo oscuro, barbero favorito) y mejoran la experiencia de uso."
                : "Remember your preferences (language, dark mode, favorite barber) and improve the user experience."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "3. Cookies de Análisis" : "3. Analytics Cookies"}
            </h2>
            <p>
              {es
                ? "Nos ayudan a entender cómo los visitantes usan el sitio, las páginas de reserva y la app. Pueden incluir proveedores como Google Analytics. Solo se activan si das consentimiento."
                : "Help us understand how visitors use the site, booking pages and app. May include providers such as Google Analytics. Only activate with your consent."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "4. Píxeles de Publicidad y Retargeting" : "4. Advertising & Retargeting Pixels"}
            </h2>
            <p>
              {es
                ? "Nos permiten medir el desempeño de anuncios, rastrear conversiones y mostrar publicidad más relevante. Pueden incluir Meta Pixel y herramientas publicitarias de Google. Solo se activan si das consentimiento."
                : "Allow us to measure ad performance, track conversions and show more relevant advertising. May include Meta Pixel and Google advertising tools. Only activate with your consent."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "5. Atribución de Referidos" : "5. Referral Attribution"}
            </h2>
            <p>
              {es
                ? "Cuando un visitante llega por un enlace de referido (/r/codigo), guardamos un token llamado ref_attribution en cookie y almacenamiento local por hasta 90 días. Esto nos permite asignar correctamente el crédito de la referencia a la reserva elegible y prevenir abuso o duplicación. Este token es esencial para el programa de referidos."
                : "When a visitor arrives via a referral link (/r/code), we store a token called ref_attribution in cookie and local storage for up to 90 days. This lets us properly assign referral credit to the eligible booking and prevent abuse or duplicate attribution. This token is essential for the referral program."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "6. Manejo de Preferencias" : "6. Managing Preferences"}
            </h2>
            <p>
              {es
                ? "Puedes aceptar o rechazar el seguimiento no esencial desde el banner de cookies que aparece en tu primera visita, o desde tu navegador. Las cookies esenciales son requeridas para que el sistema funcione."
                : "You can accept or reject non-essential tracking from the cookie banner that appears on your first visit, or via your browser settings. Essential cookies are required for the system to work."}
            </p>
          </section>

          <section>
            <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              {es ? "7. Contacto" : "7. Contact"}
            </h2>
            <p>
              {es
                ? "Si tienes preguntas sobre esta política, escríbenos desde la página de "
                : "If you have questions about this policy, reach us via the "}
              <Link to="/contacto" className="underline" style={{ color: "var(--accent-color)" }}>
                {es ? "Contacto" : "Contact page"}
              </Link>.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
