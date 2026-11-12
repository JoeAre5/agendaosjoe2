// BrandToggles — language-only toggle (ES/EN), no background or pill.
// Theme follows the device's system preference on these pages, so no theme button.
import { usePreferences } from "@/hooks/usePreferences";

interface Props {
  className?: string;
}

export function BrandToggles({ className = "" }: Props) {
  const { language, setLanguage } = usePreferences();

  return (
    <div className={`bt-wrap ${className}`}>
      <button
        type="button"
        onClick={() => setLanguage(language === "es" ? "en" : "es")}
        className="bt-lang"
        aria-label={language === "es" ? "Switch to English" : "Cambiar a Español"}
      >
        {language === "es" ? "ES" : "EN"}
      </button>

      <style>{`
        .bt-wrap {
          display: inline-flex;
          align-items: center;
        }
        .bt-lang {
          background: transparent;
          border: 0;
          padding: 0;
          margin: 0;
          font-family: inherit;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--bt-fg, rgba(255,255,255,0.78));
          cursor: pointer;
          transition: color 160ms ease, opacity 160ms ease;
          line-height: 1;
        }
        .bt-lang:hover {
          color: var(--bt-fg-hover, #fff);
          opacity: 0.9;
        }
        .bt-lang:focus-visible {
          outline: 1px dashed var(--bt-fg, rgba(255,255,255,0.5));
          outline-offset: 4px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
