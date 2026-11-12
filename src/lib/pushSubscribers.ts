// Shared types + helpers for the admin "Push Subscribers" surfaces
// (the dedicated page and the broadcast composer audience sheet).
import { supabase } from "@/integrations/supabase/client";

export type PushSubscriberRow = {
  subscription_id: string;
  client_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  endpoint: string;
  user_agent: string | null;
  language: string;
  created_at: string;
  last_used_at: string;
  failure_count: number;
};

export type Platform = "ios" | "android" | "macos" | "windows" | "linux" | "other";

export function detectPlatform(ua: string | null | undefined): Platform {
  if (!ua) return "other";
  const u = ua.toLowerCase();
  if (/(iphone|ipad|ipod)/.test(u)) return "ios";
  if (/android/.test(u)) return "android";
  if (/mac os x|macintosh/.test(u)) return "macos";
  if (/windows/.test(u)) return "windows";
  if (/linux|x11/.test(u)) return "linux";
  return "other";
}

export function platformLabel(p: Platform): string {
  switch (p) {
    case "ios": return "iOS";
    case "android": return "Android";
    case "macos": return "macOS";
    case "windows": return "Windows";
    case "linux": return "Linux";
    default: return "Other";
  }
}

export function endpointHost(endpoint: string): string {
  try { return new URL(endpoint).host; } catch { return endpoint.slice(0, 32); }
}

export type GroupedSubscriber = {
  client_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  devices: PushSubscriberRow[];
};

export function groupByClient(rows: PushSubscriberRow[]): GroupedSubscriber[] {
  const map = new Map<string, GroupedSubscriber>();
  for (const r of rows) {
    const g = map.get(r.client_id);
    if (g) {
      g.devices.push(r);
    } else {
      map.set(r.client_id, {
        client_id: r.client_id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
        avatar_url: r.avatar_url,
        devices: [r],
      });
    }
  }
  // Sort by most-recent device usage
  return Array.from(map.values()).sort((a, b) => {
    const aT = Math.max(...a.devices.map((d) => new Date(d.last_used_at).getTime()));
    const bT = Math.max(...b.devices.map((d) => new Date(d.last_used_at).getTime()));
    return bT - aT;
  });
}

export async function fetchPushSubscribers(): Promise<PushSubscriberRow[]> {
  const { data, error } = await supabase.rpc("get_push_subscribers" as any);
  if (error) throw error;
  return (data ?? []) as PushSubscriberRow[];
}

export function fullName(s: { first_name: string | null; last_name: string | null }): string {
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || "—";
}

export function initials(s: { first_name: string | null; last_name: string | null }): string {
  const a = (s.first_name ?? "").trim()[0] ?? "";
  const b = (s.last_name ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

export function isInactive(d: PushSubscriberRow): boolean {
  const ageMs = Date.now() - new Date(d.last_used_at).getTime();
  return d.failure_count >= 3 && ageMs > 30 * 24 * 60 * 60 * 1000;
}
