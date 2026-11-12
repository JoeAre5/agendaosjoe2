// admin-notification-rule-update
// Owner-only update of an admin push rule with optimistic concurrency.
// Body: { event_key, expected_updated_at, patch: { is_enabled?, title_es?, title_en?, body_es?, body_en?, url_path? } }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Patch {
  is_enabled?: boolean;
  title_es?: string;
  title_en?: string;
  body_es?: string;
  body_en?: string;
  url_path?: string | null;
}
interface Body {
  event_key?: string;
  expected_updated_at?: string;
  patch?: Patch;
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

    const body: Body = await req.json();
    if (!body.event_key || !body.expected_updated_at || !body.patch) {
      return json(400, { error: "missing_fields" });
    }

    const { data: current } = await admin
      .from("admin_notification_rules")
      .select("*")
      .eq("event_key", body.event_key)
      .maybeSingle();
    if (!current) return json(404, { error: "rule_not_found" });
    if (current.updated_at !== body.expected_updated_at) {
      return json(409, { error: "stale_version", current_updated_at: current.updated_at });
    }

    const update: Record<string, unknown> = { updated_by: userData.user.id };
    const allowed: (keyof Patch)[] = [
      "is_enabled", "title_es", "title_en", "body_es", "body_en", "url_path",
    ];
    for (const k of allowed) if (body.patch[k] !== undefined) update[k] = body.patch[k];

    const { data: updated, error: updErr } = await admin
      .from("admin_notification_rules")
      .update(update)
      .eq("event_key", body.event_key)
      .eq("updated_at", body.expected_updated_at)
      .select()
      .maybeSingle();
    if (updErr) return json(500, { error: "update_failed", detail: updErr.message });
    if (!updated) return json(409, { error: "stale_version" });

    return json(200, { ok: true, rule: updated });
  } catch (err) {
    console.error("[admin-notification-rule-update]", err);
    return json(500, { error: (err as Error).message });
  }
});
