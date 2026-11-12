import { motion } from "motion/react";
import { CSSProperties, ReactNode } from "react";
import { NAV_PILL_INSET, navGradientBorderStyle } from "@/components/GlobalBottomNavShell";

/**
 * SegmentedTabs — single source of truth for in-page segmented toggles.
 * Mirrors GlobalBottomNavShell tokens (border, pill, blur, shadow, spring).
 *
 * Use anywhere we need a pill-style tab bar (Ventas filters, Reportes
 * Nómina/Cuadre, Disponibilidad barbers, Clientes Nombre/Reciente/VIP,
 * Citas tab Próximas/Historial, etc.).
 */

export interface SegmentedTab<T extends string> {
  id: T;
  label: ReactNode;
  /** Optional leading icon, rendered inside the button before the label */
  leading?: ReactNode;
  /** Optional trailing badge */
  trailing?: ReactNode;
  /** Per-tab override colors (active state) */
  activeBg?: string;
  activeColor?: string;
}

interface SegmentedTabsProps<T extends string> {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Container height. Defaults to 44 (in-page); bottom nav uses 60. */
  height?: number;
  /** Optional explicit width (px). Omit to fill parent. */
  width?: number | string;
  /** Used to namespace the layoutId so multiple bars don't share a pill animation */
  layoutId?: string;
  /** Extra class on outer wrapper */
  className?: string;
  /** Extra style on outer wrapper */
  style?: CSSProperties;
  /** Inactive opacity. Defaults to 1 (color handles dim state via tokens). */
  inactiveOpacity?: number;
  /** When true, pill hugs each tab's content (no equal-width grid). */
  fitContent?: boolean;
  /** Override label font size class (Tailwind). */
  labelClassName?: string;
}

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  height = 44,
  width,
  layoutId = "segmented-tabs-pill",
  className,
  style,
  inactiveOpacity = 1,
  fitContent = false,
  labelClassName,
}: SegmentedTabsProps<T>) {
  const inset = NAV_PILL_INSET;
  const totalInset = inset * 2;
  const activeIdx = Math.max(0, tabs.findIndex((tt) => tt.id === value));
  const activeTab = tabs[activeIdx];

  const containerStyle = {
    height,
    padding: `0 ${inset}px`,
    borderRadius: "var(--radius-pill)",
    boxSizing: "border-box" as const,
    backdropFilter: "blur(32px)",
    WebkitBackdropFilter: "blur(32px)",
    background: "var(--nav-bg)",
    boxShadow: "var(--nav-shadow)",
  };

  const labelClass =
    labelClassName ??
    "text-[10px] sm:text-xs font-medium sm:font-semibold whitespace-nowrap tracking-tight";

  // ── fitContent: pill hugs the active button via layoutId ──────────────
  if (fitContent) {
    return (
      <div className={className} style={{ width: width ?? "100%", ...style }}>
        <div className="relative flex items-center w-full justify-between" style={containerStyle}>
          <div style={navGradientBorderStyle(50)} aria-hidden />
          {tabs.map((t) => {
            const active = value === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className="relative flex items-center justify-center gap-1 h-full px-2.5"
                style={{ zIndex: 1, opacity: active ? 1 : inactiveOpacity }}
              >
                {active && (
                  <motion.div
                    layoutId={layoutId}
                    className="absolute rounded-full"
                    style={{
                      top: inset,
                      bottom: inset,
                      left: 2,
                      right: 2,
                      background: activeTab?.activeBg ?? "var(--nav-pill-bg)",
                      border: "var(--nav-pill-border)",
                      boxShadow: "var(--nav-pill-shadow)",
                      boxSizing: "border-box",
                      zIndex: -1,
                    }}
                    transition={{ type: "spring", damping: 26, stiffness: 520, mass: 0.6 }}
                  />
                )}
                {t.leading}
                <span
                  className={labelClass}
                  style={{ color: active ? (t.activeColor ?? "var(--nav-accent)") : "var(--nav-icon-inactive)" }}
                >
                  {t.label}
                </span>
                {t.trailing}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Default: equal-width pills ────────────────────────────────────────
  const pillWidth = `calc((100% - ${totalInset}px) / ${tabs.length})`;
  const pillLeft = `calc(${inset}px + ${activeIdx} * ((100% - ${totalInset}px) / ${tabs.length}))`;

  return (
    <div className={className} style={{ width: width ?? "100%", ...style }}>
      <div className="relative flex items-center w-full" style={containerStyle}>
        <div style={navGradientBorderStyle(50)} aria-hidden />
        <motion.div
          className="absolute rounded-full"
          style={{
            left: pillLeft,
            top: inset,
            bottom: inset,
            width: pillWidth,
            background: activeTab?.activeBg ?? "var(--nav-pill-bg)",
            border: "var(--nav-pill-border)",
            boxShadow: "var(--nav-pill-shadow)",
            boxSizing: "border-box",
            transform: "translate3d(0, 0, 0)",
            backfaceVisibility: "hidden",
            contain: "paint",
            willChange: "left",
            zIndex: 0,
          }}
          animate={{ left: pillLeft }}
          transition={{ type: "spring", damping: 26, stiffness: 520, mass: 0.6 }}
        />
        {tabs.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className="relative flex items-center justify-center gap-1 flex-1 h-full"
              style={{ zIndex: 1, opacity: active ? 1 : inactiveOpacity }}
            >
              {t.leading}
              <span
                className={labelClass}
                style={{ color: active ? (t.activeColor ?? "var(--nav-accent)") : "var(--nav-icon-inactive)" }}
              >
                {t.label}
              </span>
              {t.trailing}
            </button>
          );
        })}
      </div>
    </div>
  );
}
