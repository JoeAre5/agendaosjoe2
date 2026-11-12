/**
 * Shared header for all admin & barber app screens.
 * Shows the barbershop logo, optional page title, and optional greeting.
 */
import { useBrandLogos } from "@/contexts/BrandLogosContext";


interface AdminHeaderProps {
  title?: string;
  titleAdornment?: React.ReactNode;
  onTitleClick?: () => void;
  greeting?: string;
  subtitle?: string;
  es?: boolean;
  actions?: React.ReactNode;
  sticky?: boolean;
}

export function AdminHeader({ title, titleAdornment, onTitleClick, greeting, subtitle, es, actions, sticky }: AdminHeaderProps) {
  const { headerLogoUrl } = useBrandLogos();
  const wrapClass = sticky
    ? "sticky top-0 z-30 px-4 pt-14 pb-3"
    : "px-4 pt-14 pb-3";

  return (
    <div className={wrapClass} style={{ background: "var(--bg-base)" }}>
      {/* Logo row — centered, smaller to maintain ratio with title */}
      <div className="flex items-center mb-5">
        {headerLogoUrl ? (
          <img
            src={headerLogoUrl}
            alt="Charlie's Barbershop"
            style={{ height: 22, width: "auto", objectFit: "contain" }}
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="flex items-center gap-1" style={{ lineHeight: 1.15 }}>
            <span
              className="font-black tracking-tight"
              style={{ fontSize: 11, color: "var(--text-primary)", letterSpacing: "-0.3px" }}
            >
              CHARLIE'S
            </span>
            <span
              className="font-light"
              style={{ fontSize: 11, color: "var(--text-secondary)" }}
            >
              BARBERSHOP
            </span>
          </div>
        )}
      </div>

      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          {/* Page title */}
          {title && (
            onTitleClick ? (
              <button
                onClick={onTitleClick}
                className="flex items-center gap-1.5 text-left active:opacity-70 transition-opacity"
              >
                <h1
                  className="font-black capitalize"
                  style={{ fontSize: 24, color: "var(--text-primary)", letterSpacing: "-0.5px" }}
                >
                  {title}
                </h1>
                {titleAdornment}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <h1
                  className="font-black"
                  style={{ fontSize: 24, color: "var(--text-primary)", letterSpacing: "-0.5px" }}
                >
                  {title}
                </h1>
                {titleAdornment}
              </div>
            )
          )}

          {/* Greeting */}
          {greeting && (
            <span
              className="text-[16px] mt-0.5"
              style={{ color: "var(--greeting-color)", fontWeight: 500, letterSpacing: "-0.5px" }}
            >
              {es ? `Hola, ${greeting}!` : `Hey, ${greeting}!`}
            </span>
          )}
          {subtitle && (
            <span
              className="mt-0.5"
              style={{ fontSize: 12, color: "var(--text-tertiary)", letterSpacing: "-0.2px" }}
            >
              {subtitle}
            </span>
          )}
        </div>

        {/* Right-side action icons */}
        {actions && <div className="flex items-center gap-0.5 mt-0.5">{actions}</div>}
      </div>
    </div>
  );
}
