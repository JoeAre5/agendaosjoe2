// Silently re-subscribes the device to web push whenever a signed-in client
// has already granted notification permission but is missing an active
// PushSubscription (common after reinstalling the PWA, clearing storage, or
// signing in on a new device they previously approved).
//
// Never prompts. If permission is "default" or "denied", does nothing —
// explicit opt-in still happens via the waitlist push step or PerfilTab.
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  enablePush,
  hasActivePushSubscription,
  getPushSupport,
} from "@/lib/push";

export function useAutoEnablePush(language: "es" | "en" = "es") {
  const { user, role } = useAuth();

  useEffect(() => {
    // Auto re-subscribe for ANY signed-in role (client, owner, barber).
    // The register-push-subscription edge function auto-creates a clients row
    // for owners so notifyOwners can target their devices.
    if (!user || !role) return;
    if (typeof Notification === "undefined") return;
    // Only act when the user already said yes in the past.
    if (Notification.permission !== "granted") return;
    if (getPushSupport() !== "supported") return;

    let cancelled = false;
    (async () => {
      try {
        const active = await hasActivePushSubscription();
        if (cancelled || active) return;
        // Silent: enablePush will skip the prompt because permission is
        // already granted; it just re-subscribes and persists server-side.
        await enablePush(language);
      } catch (err) {
        console.warn("[auto-push] silent re-subscribe failed", err);
      }
    })();

    return () => { cancelled = true; };
  }, [user, role, language]);
}
