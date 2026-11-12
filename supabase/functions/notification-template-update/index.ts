// notification-template-update
// Owner-only update of a notification template with optimistic concurrency.
// Body: { id, expected_updated_at, patch: { title_es?, body_es?, title_en?, body_en?, is_enabled?, offset_minutes?, url_path? } }
// Writes a row to notification_template_history capturing old → new values.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Patch {
  title_es?: string;
  body_es?: string;
  title_en?: string;
  body_en?: string;
  is_enabled?: boolean;
  offset_minutes?: number | null;
  url_path?: string | null;
}

interface Body {
  id?: string;
  expected_updated_at?: string;
  patch?: Patch;
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";

    if (!auth) return json(401, { error: "missing_auth" });

    // Verify caller via JWT, then check role using service client
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
    if (!body.id || !body.expected_updated_at || !body.patch) {
      return json(400, { error: "missing_fields" });
    }

    // Load current row
    const { data: current, error: loadErr } = await admin
      .from("notification_templates")
      .select("*")
      .eq("id", body.id)
      .maybeSingle();
    if (loadErr || !current) return json(404, { error: "template_not_found" });

    // Optimistic concurrency
    if (current.updated_at !== body.expected_updated_at) {
      return json(409, {
        error: "stale_version",
        current_updated_at: current.updated_at,
      });
    }

    // Build update payload — only provided keys
    const update: Record<string, unknown> = { updated_by: userData.user.id };
    const allowed: (keyof Patch)[] = [
      "title_es", "body_es", "title_en", "body_en",
      "is_enabled", "offset_minutes", "url_path",
    ];
    for (const k of allowed) {
      if (body.patch[k] !== undefined) update[k] = body.patch[k];
    }

    const { data: updated, error: updErr } = await admin
      .from("notification_templates")
      .update(update)
      .eq("id", body.id)
      .eq("updated_at", body.expected_updated_at) // double guard
      .select()
      .maybeSingle();
    if (updErr) return json(500, { error: "update_failed", detail: updErr.message });
    if (!updated) return json(409, { error: "stale_version" });

    // History row — only persist fields that actually changed
    const histRow: Record<string, unknown> = {
      template_id: current.id,
      template_name: current.name,
      change_kind: "edit",
      changed_by: userData.user.id,
    };
    const trackPairs: [keyof Patch, string, string][] = [
      ["title_es", "title_es_old", "title_es_new"],
      ["title_en", "title_en_old", "title_en_new"],
      ["body_es", "body_es_old", "body_es_new"],
      ["body_en", "body_en_old", "body_en_new"],
      ["is_enabled", "is_enabled_old", "is_enabled_new"],
      ["offset_minutes", "offset_minutes_old", "offset_minutes_new"],
    ];
    let anyChange = false;
    for (const [field, oldKey, newKey] of trackPairs) {
      if (body.patch[field] !== undefined && current[field] !== body.patch[field]) {
        histRow[oldKey] = current[field];
        histRow[newKey] = body.patch[field];
        anyChange = true;
      }
    }
    if (anyChange) {
      await admin.from("notification_template_history").insert(histRow);
    }

    return json(200, { ok: true, template: updated });
  } catch (err) {
    console.error("[notification-template-update]", err);
    return json(500, { error: (err as Error).message });
  }
});
