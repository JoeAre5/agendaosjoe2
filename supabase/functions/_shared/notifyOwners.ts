// Shared helper to push-notify all owner devices.
//
// Two calling conventions supported:
//   1) Legacy: notifyOwners({ title, body, url?, tag? })
//   2) Rule-driven: notifyOwners({
//        event_key: "admin_booking_new",
//        vars: { client: "...", service: "...", date: "...", appointment_id: "..." },
//        defaults: { title, body, url?, tag? },        // fallback if rule missing
//      })
//
// When called with event_key the helper looks up admin_notification_rules and
// admin_notification_prefs:
//   - if rule.is_enabled = false → skip
//   - renders title/body/url with {{var}} substitution
//   - if quiet hours active in PR time → skip
//   - if sound disabled → mark payload silent
//   - tag falls back to event_key when group_similar is on (collapses bursts)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { sendPush, isExpiredEndpoint } from "./webPush.ts";

export interface OwnerPushPayloadLegacy {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface OwnerPushPayloadEvent {
  event_key: string;
  vars?: Record<string, string | number | null | undefined>;
  defaults?: { title: string; body: string; url?: string; tag?: string };
}

export type OwnerPushPayload = OwnerPushPayloadLegacy | OwnerPushPayloadEvent;

function isEventPayload(p: OwnerPushPayload): p is OwnerPushPayloadEvent {
  return typeof (p as OwnerPushPayloadEvent).event_key === "string";
}

function render(tmpl: string, vars: Record<string, unknown> = {}): string {
  return tmpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

// PR-local minutes-since-midnight, with quiet window check that handles
// overnight ranges (e.g. 22:00 → 07:00).
function isWithinQuietHours(startHHMM: string, endHHMM: string, nowDate = new Date()): boolean {
  // Render PR-local HH:mm
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Puerto_Rico",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(nowDate);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const now = hh * 60 + mm;
  const [sH, sM] = startHHMM.split(":").map(Number);
  const [eH, eM] = endHHMM.split(":").map(Number);
  const start = sH * 60 + (sM || 0);
  const end = eH * 60 + (eM || 0);
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

export async function notifyOwners(payload: OwnerPushPayload) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Resolve title/body/url/tag from event rule when applicable.
    let title: string;
    let body: string;
    let url: string | undefined;
    let tag: string | undefined;
    let groupSimilar = true;
    let soundEnabled = true;
    let prefsLoaded = false;

    // Always load prefs (cheap, single row) so legacy callers also honor them.
    const { data: prefs } = await admin
      .from("admin_notification_prefs")
      .select("quiet_hours_enabled, quiet_start, quiet_end, sound_enabled, group_similar")
      .eq("id", true)
      .maybeSingle();
    if (prefs) {
      prefsLoaded = true;
      soundEnabled = prefs.sound_enabled !== false;
      groupSimilar = prefs.group_similar !== false;
      if (prefs.quiet_hours_enabled && prefs.quiet_start && prefs.quiet_end) {
        if (isWithinQuietHours(String(prefs.quiet_start), String(prefs.quiet_end))) {
          console.log("[notifyOwners] quiet hours active, skipping");
          return;
        }
      }
    }

    if (isEventPayload(payload)) {
      const { data: rule } = await admin
        .from("admin_notification_rules")
        .select("is_enabled, title_es, body_es, url_path")
        .eq("event_key", payload.event_key)
        .maybeSingle();
      if (rule && rule.is_enabled === false) {
        console.log(`[notifyOwners] rule ${payload.event_key} disabled`);
        return;
      }
      const vars = payload.vars ?? {};
      if (rule) {
        title = render(rule.title_es, vars);
        body = render(rule.body_es, vars);
        url = rule.url_path ? render(rule.url_path, vars) : payload.defaults?.url;
      } else {
        title = payload.defaults?.title ?? payload.event_key;
        body = payload.defaults?.body ?? "";
        url = payload.defaults?.url;
      }
      tag = payload.defaults?.tag ?? (groupSimilar ? payload.event_key : undefined);
    } else {
      title = payload.title;
      body = payload.body;
      url = payload.url;
      tag = payload.tag;
    }

    const { data: owners } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "owner");
    const ownerUserIds = (owners ?? []).map((r: any) => r.user_id);
    if (ownerUserIds.length === 0) return;

    const { data: ownerClients } = await admin
      .from("clients")
      .select("id")
      .in("auth_user_id", ownerUserIds);
    const ownerClientIds = (ownerClients ?? []).map((c: any) => c.id);
    if (ownerClientIds.length === 0) return;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("client_id", ownerClientIds);

    for (const s of subs ?? []) {
      try {
        const res = await sendPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          {
            title,
            body,
            url: url || "https://charliesbarbershop.co/admin/bandeja",
            tag,
            data: { silent: !soundEnabled },
          },
        );
        if (!res.ok && isExpiredEndpoint(res.status)) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      } catch (err) {
        console.warn("[notifyOwners] push failed", err);
      }
    }
    void prefsLoaded;
  } catch (err) {
    console.warn("[notifyOwners] failed", err);
  }
}
