// Web Push helper for Deno — uses the npm web-push library (battle-tested).
// Provides sendPush(subscription, payload) returning { ok, status, error }.

import webpush from "npm:web-push@3.6.7";

const VAPID_PUBLIC =
  "BLCmFnx4pYOlPdNvDUOo-UAt71jX0Z3my3f6x-Xz7HvLm6BFLYw-cXvnF3ww3XjEbU2L4WLb0lJGvBTwBbcrlhw";

let configured = false;
function configure() {
  if (configured) return;
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@charliesbarbershop.co";
  if (!privateKey) throw new Error("VAPID_PRIVATE_KEY is not configured");
  webpush.setVapidDetails(subject, VAPID_PUBLIC, privateKey);
  configured = true;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  image?: string;
  icon?: string;
  badge?: string;
  requireInteraction?: boolean;
  data?: Record<string, unknown>;
}

export async function sendPush(
  sub: PushSubscriptionRow,
  payload: PushPayload
): Promise<{ ok: boolean; status: number; error?: string }> {
  configure();
  try {
    const res = await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 * 7 } // 7 days
    );
    return { ok: true, status: res.statusCode };
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 0;
    return { ok: false, status, error: err?.body || err?.message || String(err) };
  }
}

export function isExpiredEndpoint(status: number): boolean {
  return status === 404 || status === 410;
}
