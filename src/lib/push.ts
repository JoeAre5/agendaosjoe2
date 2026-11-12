// Web Push helpers — registers the service worker, requests permission,
// subscribes via PushManager, and persists the subscription server-side.
//
// World-class UX:
//  - Single source of truth for browser support detection.
//  - iOS PWA gating (push only works on iOS 16.4+ when added to home screen).
//  - Idempotent subscribe (re-uses existing PushSubscription if endpoint matches).
//  - Graceful degradation: never throws to the caller; returns a typed result.

import { supabase } from "@/integrations/supabase/client";

// VAPID public key — safe to embed in the client.
export const VAPID_PUBLIC_KEY =
  "BLCmFnx4pYOlPdNvDUOo-UAt71jX0Z3my3f6x-Xz7HvLm6BFLYw-cXvnF3ww3XjEbU2L4WLb0lJGvBTwBbcrlhw";

export type PushSupportState =
  | "supported"
  | "unsupported"
  | "ios-needs-pwa";

export type PushRegistrationResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: "denied" | "unsupported" | "ios-needs-pwa" | "error"; message?: string };

/** Detect if the current browser/device can receive web push. */
export function getPushSupport(): PushSupportState {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iOS Safari only exposes PushManager when running as installed PWA.
    if (isIOS()) return "ios-needs-pwa";
    return "unsupported";
  }
  // Extra iOS guard: even if APIs exist, push only delivers from a standalone PWA.
  if (isIOS() && !isStandalone()) return "ios-needs-pwa";
  return "supported";
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

/** Register the service worker (idempotent). */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (existing) return existing;
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("[push] sw register failed", err);
    return null;
  }
}

/** Convert base64url VAPID key to Uint8Array required by PushManager. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Request notification permission and subscribe to push.
 * Persists the subscription to the backend on success.
 */
export async function enablePush(language: "es" | "en" = "es"): Promise<PushRegistrationResult> {
  const support = getPushSupport();
  if (support !== "supported") {
    return { ok: false, reason: support === "ios-needs-pwa" ? "ios-needs-pwa" : "unsupported" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };

    const reg = await ensureServiceWorker();
    if (!reg) return { ok: false, reason: "error", message: "Service worker unavailable" };

    // Re-use existing subscription if present.
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes.buffer.slice(
          keyBytes.byteOffset,
          keyBytes.byteOffset + keyBytes.byteLength
        ) as ArrayBuffer,
      });
    }

    const json = sub.toJSON();
    const { error } = await supabase.functions.invoke("register-push-subscription", {
      body: {
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
        language,
      },
    });
    if (error) {
      console.warn("[push] register failed", error);
      return { ok: false, reason: "error", message: error.message };
    }

    return { ok: true, endpoint: sub.endpoint };
  } catch (err: any) {
    console.warn("[push] enable failed", err);
    return { ok: false, reason: "error", message: err?.message };
  }
}

/** Unsubscribe locally and on the server. */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await supabase.functions
        .invoke("unregister-push-subscription", { body: { endpoint } })
        .catch(() => {});
    }
  } catch (err) {
    console.warn("[push] disable failed", err);
  }
}

/** Whether the current device already has an active push subscription. */
export async function hasActivePushSubscription(): Promise<boolean> {
  try {
    if (getPushSupport() !== "supported") return false;
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}
