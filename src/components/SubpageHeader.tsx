import { ArrowLeft } from "lucide-react";
import { ReactNode, CSSProperties } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Shared subpage header for every screen reached via back-arrow navigation.
 *
 * Uses the global header tokens (--header-pad-top, --header-title-*) so the
 * page title sits at the same Y as the Panel/AdminHeader title — i.e. the
 * gap between the iOS status bar and the title is uniform across the app.
 *
 * NEVER inline `pt-14` + a custom h1 again — use this component.
 */
interface SubpageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backTo?: string;
  actions?: ReactNode;
  /** Override title color (e.g. owner brand color). */
  titleColor?: string;
  sticky?: boolean;
}

export function SubpageHeader({
  title,
  subtitle,
  onBack,
  backTo,
  actions,
  titleColor,
  sticky,
}: SubpageHeaderProps) {
  const navigate = useNavigate();
  const handleBack = () => {
    if (onBack) return onBack();
    if (backTo) return navigate(backTo);
    navigate(-1);
  };

  const titleStyle: CSSProperties = titleColor ? { color: titleColor } : {};

  return (
    <div className={`app-page-header ${sticky ? "sticky top-0 z-30" : ""}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="p-1 -ml-1 active:opacity-60 transition-opacity"
          aria-label="Back"
        >
          <ArrowLeft size={20} style={{ color: "var(--accent-color)" }} />
        </button>
        <h1 className="app-page-title flex-1 truncate" style={titleStyle}>
          {title}
        </h1>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {subtitle && (
        <p
          className="mt-1 text-[13px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
