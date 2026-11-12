import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Menu, X, Sun, Moon, Monitor, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";
import { useSiteContent } from "@/contexts/SiteContentContext";
import { bi } from "@/lib/siteContent";

const NAV_LINKS = [
  { to: "/", labelEs: "Inicio", labelEn: "Home" },
  { to: "/citas", labelEs: "Citas", labelEn: "Booking" },
  { to: "/titulares", labelEs: "Titulares", labelEn: "Headlines" },
  { to: "/unete", labelEs: "Únete", labelEn: "Join Us" },
  { to: "/contacto", labelEs: "Contacto", labelEn: "Contact" },
];

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const { language } = useTranslation();
  const { theme, setTheme, setLanguage } = usePreferences();
  const header = useSiteContent().header;
  const location = useLocation();
  const currentPath = location.pathname;

  // Close menu on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const themeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  const ThemeIcon = themeIcon;
  const nextTheme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";

  return (
    <>
      <header
        className="sticky top-0 z-50 w-full"
        style={{
          background: "var(--nav-bg)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
          borderBottom: "1px solid var(--divider)",
          paddingTop: "max(env(safe-area-inset-top), 14px)",
        }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 md:px-8 lg:px-12 h-16 md:h-20 lg:h-24">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-lg md:text-xl font-black tracking-tight" style={{ color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
              {header.brand_top}
            </span>
            <span className="text-lg md:text-xl font-light" style={{ color: "var(--text-secondary)" }}>
              {header.brand_bottom}
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-10 xl:gap-12">
            {NAV_LINKS.map(({ to, labelEs, labelEn }) => {
              const active = currentPath === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className="text-xs font-semibold uppercase tracking-widest transition-opacity hover:opacity-100"
                  style={{
                    color: active ? "var(--accent-color)" : "var(--text-primary)",
                    opacity: active ? 1 : 0.9,
                  }}>
                  {language === "es" ? labelEs : labelEn}
                </Link>
              );
            })}

            {/* Login / Sign up */}
            <Link
              to="/citas/acceso"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest px-3 py-2 rounded-full transition-opacity hover:opacity-80"
              style={{
                color: "var(--bg-base)",
                background: "var(--text-primary)",
              }}>
              <UserRound size={14} strokeWidth={2} />
              {bi(header.sign_in, language)}
            </Link>

            {/* Theme toggle */}
            <button onClick={() => setTheme(nextTheme)} className="p-2 rounded-full" style={{ color: "var(--text-secondary)" }}>
              <ThemeIcon size={16} />
            </button>

            {/* Language toggle */}
            <button
              onClick={() => setLanguage(language === "es" ? "en" : "es")}
              className="p-2 rounded-full text-xs font-bold"
              style={{ color: "var(--text-secondary)" }}>
              {language === "es" ? "EN" : "ES"}
            </button>
          </nav>

          {/* Mobile hamburger */}
          <button onClick={() => setOpen(!open)} className="md:hidden p-2" style={{ color: "var(--text-primary)" }}>
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      {open && (
          <div
            
            className="fixed inset-0 z-40"
            style={{
              background: "var(--bg-base)",
              paddingTop: "calc(max(env(safe-area-inset-top), 14px) + 64px)",
            }}>
            <nav className="flex flex-col items-center gap-6 pt-12">
              {NAV_LINKS.map(({ to, labelEs, labelEn }) => {
                const isActive = currentPath === to;
                return (
                  <Link
                    key={to}
                    to={to}
                    className="text-2xl font-black uppercase tracking-wide"
                    style={{ color: isActive ? "var(--accent-color)" : "var(--text-primary)" }}>
                    {language === "es" ? labelEs : labelEn}
                  </Link>
                );
              })}

              <Link
                to="/citas/acceso"
                className="inline-flex items-center gap-2 mt-2 px-6 py-3 rounded-full text-base font-bold uppercase tracking-wide"
                style={{ background: "var(--text-primary)", color: "var(--bg-base)" }}>
                <UserRound size={18} strokeWidth={2} />
                {bi(header.sign_in_mobile, language)}
              </Link>

              <div className="flex gap-4 mt-6">
                <button onClick={() => setTheme(nextTheme)} className="p-3 rounded-full" style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                  <ThemeIcon size={20} />
                </button>
                <button
                  onClick={() => setLanguage(language === "es" ? "en" : "es")}
                  className="p-3 rounded-full text-sm font-bold"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                  {language === "es" ? "EN" : "ES"}
                </button>
              </div>
            </nav>
          </div>
        )}
    </>
  );
}
