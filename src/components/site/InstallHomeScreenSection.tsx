// Reusable "Add to Home Screen" hero block.
// Used both as a standalone section on the public home page and as the
// visual body of /citas/instala (InstallBridge).

import { motion } from "motion/react";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import { useSiteContent } from "@/contexts/SiteContentContext";
import { bi } from "@/lib/siteContent";
import { tapFeedback } from "@/lib/feedback";
import heroLight from "@/assets/hero-add-to-phone-light.webp";
import heroDark from "@/assets/hero-add-to-phone-dark.webp";

const ACCENT = "#D6C3A8";
const ACCENT_LIGHT_BG = "#F1E9DC";
const ACCENT_LIGHT_FG = "#8a6f4a";

type Props = {
  /** Override the CTA label. Defaults to content from site CMS. */
  ctaLabel?: { es: string; en: string };
  /** Override the helper microcopy under the CTA. */
  helperLabel?: { es: string; en: string };
  /** Click handler for the CTA button. */
  onCta: () => void;
};

export default function InstallHomeScreenSection({
  ctaLabel,
  helperLabel,
  onCta,
}: Props) {
  const { language } = useTranslation();
  const { resolvedTheme } = usePreferences();
  const c = useSiteContent().install;
  const isEs = language === "es";
  const isDark = resolvedTheme === "dark";

  const micro = bi(c.eyebrow, language);
  const title = bi(c.title, language);
  const subtitle = bi(c.subtitle, language);
  const paragraph = bi(c.paragraph, language);
  const cta = (ctaLabel && (isEs ? ctaLabel.es : ctaLabel.en)) || bi(c.cta, language);
  const helper = (helperLabel && (isEs ? helperLabel.es : helperLabel.en)) || bi(c.helper, language);

  const heroSrc = isDark ? heroDark : heroLight;

  const handleClick = () => {
    tapFeedback();
    onCta();
  };

  return (
    <div
      className="w-full max-w-[430px] mx-auto flex flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Hero (pre-cropped, pre-rounded composite image, matches public hero spacing) */}
      <div className="w-full px-5 pt-4">
        <motion.img
          key={heroSrc}
          src={heroSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="block w-full h-auto select-none pointer-events-none"
        />
      </div>

      {/* Text + CTA */}
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 0.55 }}
        className="flex-1 flex flex-col items-center text-center px-5 pt-6 pb-10 relative z-20"
      >
        <span
          className="relative z-30 inline-block px-3 py-[5px] rounded-full text-[8px] font-semibold tracking-[0.18em] uppercase mb-4"
          style={{
            background: isDark ? "rgba(214,195,168,0.16)" : ACCENT_LIGHT_BG,
            color: isDark ? ACCENT : ACCENT_LIGHT_FG,
          }}
        >
          {micro}
        </span>

        <h2
          className="font-black text-[24px] leading-[1.05] tracking-[-0.02em] mb-1 whitespace-nowrap"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>

        <p
          className="font-bold text-[14px] leading-snug mb-2.5 max-w-[300px]"
          style={{ color: "var(--text-primary)" }}
        >
          {subtitle}
        </p>

        <p
          className="text-[11px] leading-relaxed mb-6 max-w-[300px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {paragraph}
        </p>

        <button
          onClick={handleClick}
          className="w-full max-w-[320px] rounded-full py-[14px] text-[14px] font-bold transition-transform active:scale-[0.98]"
          style={{
            background: "var(--cta-bg)",
            color: "var(--cta-fg)",
            boxShadow: isDark
              ? "0 10px 28px rgba(214,195,168,0.18)"
              : "0 12px 28px rgba(0,0,0,0.18)",
          }}
        >
          {cta}
        </button>

        <p
          className="text-[9px] mt-3.5"
          style={{ color: isDark ? ACCENT : ACCENT_LIGHT_FG }}
        >
          {helper}
        </p>
      </motion.div>
    </div>
  );
}
