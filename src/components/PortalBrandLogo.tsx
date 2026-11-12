import { useBrandLogos } from "@/contexts/BrandLogosContext";

/**
 * Shared brand wordmark used on every client portal screen.
 * Mirrors the logo row from AdminHeader so the client app and admin app
 * share the same identity at the top of every page. If an owner has uploaded
 * a custom header logo, it's used in place of the wordmark.
 */
export function PortalBrandLogo() {
  const { headerLogoUrl } = useBrandLogos();

  return (
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
  );
}
