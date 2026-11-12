import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

export interface PushTestUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface PushTestSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  language?: string | null;
  client_id?: string | null;
}

export async function resolveCallerClientIds(
  admin: SupabaseClient,
  user: PushTestUser,
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: byUid } = await admin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id);
  byUid?.forEach((r: { id: string }) => ids.add(r.id));

  const email = user.email?.toLowerCase().trim() || null;
  if (email) {
    const { data: byEmail } = await admin
      .from("clients")
      .select("id")
      .ilike("email", email);
    byEmail?.forEach((r: { id: string }) => ids.add(r.id));
  }

  const phone = user.phone?.trim() || null;
  if (phone) {
    const { data: byPhone } = await admin
      .from("clients")
      .select("id")
      .eq("phone", phone);
    byPhone?.forEach((r: { id: string }) => ids.add(r.id));
  }

  if (ids.size === 0) {
    const meta = user.user_metadata || {};
    const full = String(meta.full_name || meta.name || "Admin").trim();
    const first = String(meta.first_name || full.split(" ")[0] || "Admin").trim();
    const last = String(meta.last_name || full.split(" ").slice(1).join(" ") || "").trim() || null;
    const { data: created, error } = await admin
      .from("clients")
      .insert({
        auth_user_id: user.id,
        first_name: first || "Admin",
        last_name: last,
        email,
        is_guest: false,
        account_verified: true,
        booking_source: "admin",
        notifications_enabled: true,
        notifications_permission_asked: true,
      })
      .select("id")
      .single();
    if (!error && created?.id) ids.add(created.id);
  }

  return Array.from(ids);
}

export async function getCallerPushSubscriptions(
  admin: SupabaseClient,
  user: PushTestUser,
): Promise<{ clientIds: string[]; subscriptions: PushTestSubscription[] }> {
  const clientIds = await resolveCallerClientIds(admin, user);
  if (clientIds.length === 0) return { clientIds, subscriptions: [] };

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, language, client_id")
    .in("client_id", clientIds);

  return { clientIds, subscriptions: (subs ?? []) as PushTestSubscription[] };
}

export async function pruneExpiredPushSubscriptions(
  admin: SupabaseClient,
  expiredIds: string[],
): Promise<void> {
  if (expiredIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expiredIds);
  }
}