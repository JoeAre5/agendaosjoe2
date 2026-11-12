/**
 * Cookie / tracking consent banner.
 *
 * Minimal two-button design: OK (accept all) or Customize (manage buckets).
 * Stores the user's choice in localStorage under `cookie_consent_v1`.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const STORAGE_KEY = "cookie_consent_v1";

type Consent = {
  status: "accepted_all" | "essential_only" | "custom";
  analytics: boolean;
  advertising: boolean;
  decidedAt: number;
};

function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Consent;
  } catch {
    return null;
  }
}

function writeConsent(c: Consent) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function CookieBanner() {
  const { language } = useTranslation();
  const es = language === "es";
  const [visible, setVisible] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [advertising, setAdvertising] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!readConsent()) setVisible(true);
    }, 800);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    writeConsent({ status: "accepted_all", analytics: true, advertising: true, decidedAt: Date.now() });
    setVisible(false);
  };
  const saveCustom = () => {
    writeConsent({
      status: analytics || advertising ? "custom" : "essential_only",
      analytics,
      advertising,
      decidedAt: Date.now(),
    });
    setVisible(false);
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[80] px-4 pb-3 pt-3"
      style={{
        background: "var(--bg-surface)",
        borderTop: "1px solid var(--divider)",
        boxShadow: "0 -8px 24px rgba(0,0,0,0.25)",
      }}
      role="dialog"
      aria-live="polite"
      aria-label={es ? "Preferencias de cookies" : "Cookie preferences"}
    >
      <div className="max-w-3xl mx-auto">
        {!showPrefs ? (
          <div className="flex items-start gap-2.5">
            <Cookie
              size={16}
              className="shrink-0 mt-1"
              style={{ color: "var(--text-tertiary)" }}
              aria-hidden="true"
            />
            <div className="flex-1 min-w-0">
              <p
                className="leading-snug mb-2.5"
                style={{ color: "var(--text-secondary)", fontSize: "10px" }}
              >
                {es
                  ? "Este sitio usa cookies para mejorar tu experiencia. Aprende más en nuestra "
                  : "This site uses cookies to help improve your user experience. Learn more about how we use cookies in our "}
                <Link to="/cookies" className="underline" style={{ color: "var(--accent-color)" }}>
                  {es ? "Política de Cookies" : "Cookie Policy"}
                </Link>
                .
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={acceptAll}
                  className="px-4 py-2 rounded-md font-bold uppercase tracking-wider"
                  style={{ background: "var(--cta-bg)", color: "var(--cta-fg)", fontSize: "10px" }}
                >
                  {es ? "OK" : "OK"}
                </button>
                <button
                  onClick={() => setShowPrefs(true)}
                  className="px-4 py-2 rounded-md font-bold uppercase tracking-wider"
                  style={{
                    background: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--divider)",
                    fontSize: "10px",
                  }}
                >
                  {es ? "Personalizar cookies" : "Customize cookies"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Cookie size={14} style={{ color: "var(--text-tertiary)" }} aria-hidden="true" />
              <h3 className="font-bold" style={{ color: "var(--text-primary)", fontSize: "11px" }}>
                {es ? "Preferencias de cookies" : "Cookie preferences"}
              </h3>
            </div>
            <div className="space-y-2" style={{ color: "var(--text-secondary)", fontSize: "10px" }}>
              <label className="flex items-start gap-2 opacity-60">
                <input type="checkbox" checked disabled className="mt-1" />
                <span>
                  <strong>{es ? "Esenciales" : "Essential"}</strong>{" "}
                  {es ? "(requeridas)" : "(required)"}
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <strong>{es ? "Análisis" : "Analytics"}</strong>{" "}
                  {es ? "(uso del sitio)" : "(site usage)"}
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={advertising}
                  onChange={(e) => setAdvertising(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <strong>{es ? "Publicidad" : "Advertising"}</strong>{" "}
                  {es ? "(medición y retargeting)" : "(measurement and retargeting)"}
                </span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveCustom}
                className="px-4 py-2 rounded-md font-bold uppercase tracking-wider"
                style={{ background: "var(--cta-bg)", color: "var(--cta-fg)", fontSize: "10px" }}
              >
                {es ? "Guardar" : "Save"}
              </button>
              <button
                onClick={() => setShowPrefs(false)}
                className="px-4 py-2 rounded-md font-bold uppercase tracking-wider"
                style={{ background: "transparent", color: "var(--text-secondary)", fontSize: "10px" }}
              >
                {es ? "Atrás" : "Back"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Helper that other modules can call before firing analytics/pixel events.
 * Returns true only if the user has opted in to that bucket.
 */
export function hasConsent(bucket: "analytics" | "advertising"): boolean {
  const c = readConsent();
  if (!c) return false;
  if (c.status === "accepted_all") return true;
  if (c.status === "essential_only") return false;
  return bucket === "analytics" ? c.analytics : c.advertising;
}
