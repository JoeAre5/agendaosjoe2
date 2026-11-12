import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { installAppLoadRecovery } from "@/lib/appRecovery";

installAppLoadRecovery();

/**
 * PWA launch resume — when a referred visitor installs from /bienvenido, some
 * phones relaunch the saved icon at the manifest start_url, while others save
 * the visible page as /?ref=code. In both cases, referral onboarding must win
 * before React routes them into the public site or login screen.
 */
(() => {
  try {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isStandalone) return;
    const path = window.location.pathname;
    // Only intercept the manifest start_url / root landings.
    if (path !== "/app/cliente" && path !== "/" && path !== "/login") return;
    const urlRef = new URLSearchParams(window.location.search).get("ref")?.toLowerCase().trim() || "";
    let s: { step?: string; refCode?: string } | null = null;
    try {
      const raw = localStorage.getItem("welcome:state:v2");
      s = raw ? JSON.parse(raw) : null;
    } catch { /* noop */ }
    let storedRef = "";
    try {
      const raw = localStorage.getItem("ref_attribution_v1");
      const parsed = raw ? JSON.parse(raw) as { code?: string; capturedAt?: number } : null;
      const maxAgeMs = 90 * 24 * 60 * 60 * 1000;
      if (parsed?.code && parsed.capturedAt && Date.now() - parsed.capturedAt < maxAgeMs) {
        storedRef = parsed.code.toLowerCase().trim();
      }
    } catch { /* noop */ }
    // Resume only if onboarding wasn't finished, or if the saved icon opened
    // the public root with a referral code but without shared localStorage.
    const hasProgress = Boolean(s?.step && s.step !== "splash");
    if (!urlRef && !storedRef && !hasProgress) return;
    const refCode = urlRef || storedRef || s?.refCode || "";
    const resume = refCode
      ? `?ref=${encodeURIComponent(refCode)}&resume=1`
      : "?resume=1";
    window.location.replace(`/bienvenido${resume}`);
  } catch { /* noop */ }
})();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

(window as Window & { __AGENDAOS_APP_BOOTED?: boolean }).__AGENDAOS_APP_BOOTED = true;
