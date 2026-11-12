// admin-notification-prefs-update
// Owner-only update of admin delivery prefs (quiet hours, sound, grouping).
// Body: { patch: { quiet_hours_enabled?, quiet_start?, quiet_end?, sound_enabled?, group_similar?, group_window_minutes? } }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Patch {
  quiet_hours_enabled?: boolean;
  quiet_start?: string;
  quiet_end?: string;
  sound_enabled?: boolean;
  group_similar?: boolean;
  group_window_minutes?: number;
}

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json(401, { error: "missing_auth" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "invalid_jwt" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isOwner } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "owner",
    });
    if (!isOwner) return json(403, { error: "forbidden" });

    const body = await req.json().catch(() => ({}));
    const patch: Patch = body?.patch ?? {};
    const update: Record<string, unknown> = { updated_by: userData.user.id };
    const allowed: (keyof Patch)[] = [
      "quiet_hours_enabled", "quiet_start", "quiet_end",
      "sound_enabled", "group_similar", "group_window_minutes",
    ];
    for (const k of allowed) if (patch[k] !== undefined) update[k] = patch[k];

    const { data: updated, error: updErr } = await admin
      .from("admin_notification_prefs")
      .update(update)
      .eq("id", true)
      .select()
      .maybeSingle();
    if (updErr) return json(500, { error: "update_failed", detail: updErr.message });

    return json(200, { ok: true, prefs: updated });
  } catch (err) {
    console.error("[admin-notification-prefs-update]", err);
    return json(500, { error: (err as Error).message });
  }
});
