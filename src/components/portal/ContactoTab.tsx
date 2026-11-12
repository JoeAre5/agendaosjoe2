import { MapPin, Clock, Phone, Mail } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { PortalBrandLogo } from "@/components/PortalBrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { normalizePhone10, formatPhoneDisplay } from "@/lib/phone";

const WHATSAPP_SVG = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

// Sensible defaults if the owner hasn't filled the shop info yet.
const FALLBACK = {
  address: "PR-2 Km 93.3 Bo. Membrillo, Camuy 00627",
  phone: "+1 (787) 348-1281",
  whatsapp: "+1 (787) 348-1281",
  maps_url: "",
};

interface ContactoTabProps {
  firstName?: string;
}

interface ShopInfo {
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  maps_url: string | null;
}

export default function ContactoTab({ firstName }: ContactoTabProps) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ShopInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("shop_settings_public" as any)
      .select("address, phone, whatsapp, email, maps_url")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setInfo(data as any);
      });
    return () => { cancelled = true; };
  }, []);

  const greeting = firstName
    ? t("portal.contacto.greetingNamed", { name: firstName })
    : t("portal.contacto.greetingAnon");

  const phoneDisplay = info?.phone?.trim() || FALLBACK.phone;
  const phoneTel = normalizePhone10(phoneDisplay) || normalizePhone10(FALLBACK.phone);
  const waSource = info?.whatsapp?.trim() || info?.phone?.trim() || FALLBACK.whatsapp;
  const waDigits = normalizePhone10(waSource);
  const whatsappUrl = `https://wa.me/1${waDigits}?text=${encodeURIComponent(greeting)}`;

  const addressLine = info?.address?.trim() || FALLBACK.address;
  const mapsLink =
    info?.maps_url?.trim() ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`;
  const mapsEmbed = `https://maps.google.com/maps?q=${encodeURIComponent(addressLine)}&output=embed`;
  const email = info?.email?.trim() || "";

  const items: Array<{ icon: any; title: string; content: React.ReactNode }> = [
    {
      icon: MapPin,
      title: t("portal.contacto.address"),
      content: (
        <a
          href={mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {addressLine}
        </a>
      ),
    },
    {
      icon: Clock,
      title: t("portal.contacto.hours"),
      content: (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {t("portal.contacto.hoursLine")}
        </p>
      ),
    },
    {
      icon: Phone,
      title: t("portal.contacto.phone"),
      content: (
        <a
          href={`tel:+1${phoneTel}`}
          className="text-sm font-medium underline active:opacity-70"
          style={{ color: "var(--accent-color)" }}
        >
          {/^\+/.test(phoneDisplay) ? phoneDisplay : `+1 ${formatPhoneDisplay(phoneDisplay)}`}
        </a>
      ),
    },
  ];

  if (email) {
    items.push({
      icon: Mail,
      title: "Email",
      content: (
        <a
          href={`mailto:${email}`}
          className="text-sm font-medium underline active:opacity-70"
          style={{ color: "var(--accent-color)" }}
        >
          {email}
        </a>
      ),
    });
  }

  return (
    <div className="px-4 pt-14 pb-4">
      <PortalBrandLogo />
      <motion.h1
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl mb-6"
        style={{ fontWeight: 900, letterSpacing: "-1px", color: "var(--text-primary)" }}
      >
        {t("portal.contacto.title")}
      </motion.h1>

      <div className="space-y-1 mb-6">
        {items.map(({ icon: Icon, title, content }, i) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className={`flex items-start gap-4 px-4 py-4 ${i > 0 ? "divider-hairline" : ""}`}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "var(--bg-surface-2)" }}
            >
              <Icon size={18} style={{ color: "var(--accent-color)" }} />
            </div>
            <div className="pt-0.5">
              <p
                className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                {title}
              </p>
              {content}
            </div>
          </motion.div>
        ))}

        {/* WhatsApp */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.21 }}
          className="divider-hairline flex items-start gap-4 px-4 py-4"
        >
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--bg-surface-2)", color: "var(--accent-color)" }}
          >
            {WHATSAPP_SVG}
          </div>
          <div className="pt-0.5">
            <p
              className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              {t("portal.contacto.whatsapp")}
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
              style={{ color: "var(--accent-color)" }}
            >
              {t("portal.contacto.whatsappCta")}
            </a>
          </div>
        </motion.div>
      </div>

      {/* Google Maps live embed — driven by the saved address */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid var(--divider)", background: "var(--bg-surface-2)" }}
      >
        <iframe
          title={t("portal.contacto.mapAlt")}
          src={mapsEmbed}
          className="w-full block"
          style={{ border: 0, height: 280 }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </motion.div>
    </div>
  );
}
