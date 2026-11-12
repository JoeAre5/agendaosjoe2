import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";

const accentColor = "#ceb79e";

// One-tap language switcher. Shows the CURRENT language; tap to switch.
// Since the app only supports es/en, we toggle between them. When a 3rd
// language is added, swap this for a picker.
export default function LanguageToggle() {
  const { language } = useTranslation();
  const { setLanguage } = usePreferences();

  const label = language === "es" ? "Español (PR)" : "English (US)";
  const next = language === "es" ? "en" : "es";

  return (
    <button
      type="button"
      onClick={() => setLanguage(next)}
      className="text-xs font-medium transition-colors"
      style={{ color: accentColor }}
      aria-label={language === "es" ? "Switch to English" : "Cambiar a Español"}
    >
      {label}
    </button>
  );
}
