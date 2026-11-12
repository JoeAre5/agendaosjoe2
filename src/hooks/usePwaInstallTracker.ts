/**
 * Records a PWA install event the first time we observe the app running
 * standalone, OR when the browser fires the `appinstalled` event.
 *
 * Stores a localStorage flag to avoid double-counting per browser. Inserts
 * one row into `pwa_installs` and (if there is a stored ref) one referral
 * conversion of type 'pwa_install'.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { recordReferralConversion } from "@/lib/referral";

const FLAG_KEY = "pwa_install_logged_v1";

function detectPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  if (/mac|windows|linux/.test(ua)) return "desktop";
  return "unknown";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window.navigator as any).standalone === true
  );
}

export function usePwaInstallTracker() {
  const { user } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const log = async (trigger: "standalone_detected" | "appinstalled") => {
      try {
        if (localStorage.getItem(FLAG_KEY)) return;
      } catch {
        return;
      }

      const platform = detectPlatform();
      let clientId: string | null = null;
      if (user) {
        const { data } = await supabase
          .from("clients")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        clientId = data?.id ?? null;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("pwa_installs") as any).insert({
          client_id: clientId,
          platform,
          display_mode: trigger === "standalone_detected" ? "standalone" : "browser",
          user_agent: navigator.userAgent.slice(0, 500),
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[pwa-install] insert failed", err);
      }

      // Attribute to referrer if we have one
      await recordReferralConversion("pwa_install", clientId);

      try {
        localStorage.setItem(FLAG_KEY, new Date().toISOString());
      } catch {
        // ignore
      }
    };

    if (isStandalone()) {
      log("standalone_detected");
    }

    const onInstalled = () => log("appinstalled");
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [user]);
}
