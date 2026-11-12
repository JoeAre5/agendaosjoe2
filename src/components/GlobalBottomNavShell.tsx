import { motion } from "motion/react";
import { CSSProperties, ReactNode } from "react";

/**
 * GLOBAL BOTTOM NAV TEMPLATE — single source of truth.
 *
 * Both the admin BottomNav and the ClientPortal nav render through this shell.
 * All spacing / pill geometry lives HERE. Edit once, propagates everywhere.
 *
 * SPACING CONTRACT (uniform 0.5px gap between pill and container border):
 *   container border : 0.5px
 *   pill inset       : 1px (top/bottom/left/right from container's content box)
 *   pill border      : 0.5px (matches container)
 *   visible gap      : 1px - 0.5px (container border) = 0.5px on every side ✅
 */

export const NAV_PILL_INSET = 6; // px — gap from container content edge to pill outer edge

/**
 * Shared fading-gradient hairline border used by every nav surface
 * (bottom nav shell + in-page SegmentedTabs). Solid at the top, fading
 * to transparent at the bottom so the nav melts into the page bg.
 */
export function navGradientBorderStyle(borderRadius: number = 50): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    borderRadius,
    padding: "0.75px",
    background:
      "linear-gradient(to bottom, var(--nav-border-color) 0%, var(--nav-border-color) 50%, transparent 100%)",
    WebkitMask:
      "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    WebkitMaskComposite: "xor",
    mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
    maskComposite: "exclude",
    pointerEvents: "none",
    zIndex: 2,
  };
}

interface GlobalBottomNavShellProps {
  tabsCount: number;
  activeIndex: number;
  children: ReactNode;
}

export function GlobalBottomNavShell({ tabsCount, activeIndex, children }: GlobalBottomNavShellProps) {
  const inset = NAV_PILL_INSET;
  const totalInset = inset * 2;
  const pillWidth = `calc((100% - ${totalInset}px) / ${tabsCount})`;
  const pillLeft = `calc(${inset}px + ${activeIndex} * ((100% - ${totalInset}px) / ${tabsCount}))`;

  const containerStyle: CSSProperties = {
    maxWidth: 398,
    height: 60,
    padding: `0 ${inset}px`,
    borderRadius: "var(--radius-pill)",
    boxSizing: "border-box",
    backdropFilter: "blur(32px)",
    WebkitBackdropFilter: "blur(32px)",
    background: "var(--nav-bg)",
    boxShadow: "var(--nav-shadow)",
    pointerEvents: "auto",
  };

  const borderOverlayStyle = navGradientBorderStyle(50);

  const pillStyle: CSSProperties = {
    left: pillLeft,
    top: inset,
    bottom: inset,
    width: pillWidth,
    background: "var(--nav-pill-bg)",
    boxShadow: "var(--nav-pill-shadow)",
    border: "var(--nav-pill-border)",
    boxSizing: "border-box",
    transform: "translate3d(0, 0, 0)",
    backfaceVisibility: "hidden",
    contain: "paint",
    willChange: "left",
    zIndex: 0,
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] flex justify-center"
      style={{
        paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        paddingLeft: 16,
        paddingRight: 16,
        pointerEvents: "none",
        // Promote to its own compositor layer so iOS PWA scroll/keyboard
        // events don't cause the bar to drift relative to the viewport.
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
        willChange: "transform",
        backfaceVisibility: "hidden",
      }}
    >
      <div className="relative flex items-center justify-between w-full" style={containerStyle}>
        <div style={borderOverlayStyle} aria-hidden />
        <motion.div
          className="absolute rounded-full"
          style={pillStyle}
          animate={{ left: pillLeft }}
          transition={{ type: "spring", damping: 26, stiffness: 520, mass: 0.6 }}
        />
        {children}
      </div>
    </nav>
  );
}
