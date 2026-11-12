import { useEffect, useState } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

const MOBILE_MAX = 767;   // <768 → mobile
const TABLET_MAX = 1023;  // 768–1023 → tablet, ≥1024 → desktop

function compute(width: number): Breakpoint {
  if (width <= MOBILE_MAX) return "mobile";
  if (width <= TABLET_MAX) return "tablet";
  return "desktop";
}

/**
 * Responsive breakpoint hook for the admin shell.
 * - mobile  : <768px   → original AppShell (BottomNav, 430px column)
 * - tablet  : 768–1023 → DesktopAdminShell with collapsed-by-default sidebar
 * - desktop : ≥1024    → DesktopAdminShell with expanded sidebar
 */
export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() =>
    typeof window === "undefined" ? "mobile" : compute(window.innerWidth)
  );

  useEffect(() => {
    const onResize = () => setBp(compute(window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return bp;
}
