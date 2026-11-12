import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";
import { usePublicationSettings } from "@/hooks/usePublicationSettings";
import { useSiteContent } from "@/contexts/SiteContentContext";
import { bi } from "@/lib/siteContent";
import { WhatsAppGlyph, FacebookGlyph, InstagramGlyph, YouTubeGlyph } from "./SocialIcons";

type SocialItem = { key: string; href: string; label: string; Icon: React.ComponentType<{ size?: number }> };

export function PublicFooter() {
  const { language } = useTranslation();
  const { data: pub } = usePublicationSettings();
  const f = useSiteContent().footer;

  const socials: SocialItem[] = [];
  if (pub?.social_whatsapp) {
    const phone = pub.social_whatsapp.replace(/\D/g, "");
    if (phone) socials.push({ key: "wa", href: `https://wa.me/${phone}`, label: "WhatsApp", Icon: WhatsAppGlyph });
  }
  if (pub?.social_facebook) socials.push({ key: "fb", href: pub.social_facebook, label: "Facebook", Icon: FacebookGlyph });
  if (pub?.social_instagram) socials.push({ key: "ig", href: pub.social_instagram, label: "Instagram", Icon: InstagramGlyph });
  if (pub?.social_youtube) socials.push({ key: "yt", href: pub.social_youtube, label: "YouTube", Icon: YouTubeGlyph });

  return (
    <footer style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--divider)" }}>
      <div className="max-w-6xl mx-auto px-5 py-12 grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Brand */}
        <div>
          <h3 className="text-lg font-black tracking-tight mb-3" style={{ color: "var(--text-primary)" }}>
            {f.brand}
          </h3>
          <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-secondary)" }}>
            {bi(f.tagline, language)}
          </p>
          {socials.length > 0 && (
            <div className="flex items-center gap-3">
              {socials.map(({ key, href, label, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target={href.startsWith("mailto:") ? undefined : "_blank"}
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="transition-opacity hover:opacity-100 active:scale-95"
                  style={{ color: "var(--text-secondary)", opacity: 0.7 }}
                >
                  <Icon size={20} />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Links */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--accent-color)" }}>
            {bi(f.links_heading, language)}
          </h4>
          <div className="flex flex-col gap-2">
            {[
              { to: "/citas", es: "Reservar Cita", en: "Book Appointment" },
              { to: "/titulares", es: "Titulares", en: "Headlines" },
              { to: "/unete", es: "Únete al Equipo", en: "Join the Team" },
              { to: "/contacto", es: "Contacto", en: "Contact" },
            ].map(({ to, es, en }) => (
              <Link key={to} to={to} className="text-sm hover:underline" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? es : en}
              </Link>
            ))}
          </div>

          <h4 className="text-xs font-bold uppercase tracking-widest mt-6 mb-4" style={{ color: "var(--accent-color)" }}>
            {bi(f.legal_heading, language)}
          </h4>
          <div className="flex flex-col gap-2">
            {[
              { to: "/privacidad", es: "Privacidad", en: "Privacy" },
              { to: "/terminos", es: "Términos", en: "Terms" },
              { to: "/cookies", es: "Cookies", en: "Cookies" },
              { to: "/rewards-terms", es: "Programa de Recompensas", en: "Rewards Program" },
              { to: "/referral-terms", es: "Programa de Referidos", en: "Referral Program" },
              { to: "/reembolsos", es: "Reembolsos", en: "Refunds" },
              { to: "/politica-reservas", es: "Política de Reservas", en: "Booking Policy" },
            ].map(({ to, es, en }) => (
              <Link key={to} to={to} className="text-sm hover:underline" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? es : en}
              </Link>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--accent-color)" }}>
            {bi(f.contact_heading, language)}
          </h4>
          <div className="flex flex-col gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <span>{f.address_line1}</span>
            <span>{f.address_line2}</span>
            <a
              href={`https://wa.me/${(pub?.social_whatsapp || f.phone).replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--text-secondary)" }}
            >
              {f.phone}
            </a>
            <span>{bi(f.hours, language)}</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 pb-6">
        <div className="pt-4 text-center text-xs" style={{ borderTop: "1px solid var(--divider)", color: "var(--text-tertiary)" }}>
          © {new Date().getFullYear()} {f.copyright_entity}. {bi(f.rights, language)}
        </div>
      </div>
    </footer>
  );
}
