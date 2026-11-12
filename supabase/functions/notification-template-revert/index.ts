// notification-template-revert
// Owner-only: revert a template to a prior history snapshot.
// Body: { history_id }
// Reads the history row's *_old values and applies them to the template,
// then writes a new history row with change_kind='revert'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { history_id } = await req.json();
    if (!history_id) return json(400, { error: "missing_history_id" });

    const { data: hist, error: histErr } = await admin
      .from("notification_template_history")
      .select("*")
      .eq("id", history_id)
      .maybeSingle();
    if (histErr || !hist) return json(404, { error: "history_not_found" });

    const { data: current, error: curErr } = await admin
      .from("notification_templates")
      .select("*")
      .eq("id", hist.template_id)
      .maybeSingle();
    if (curErr || !current) return json(404, { error: "template_not_found" });

    // Build revert payload from *_old fields where present
    const update: Record<string, unknown> = { updated_by: userData.user.id };
    const fieldMap: [string, string][] = [
      ["title_es", "title_es_old"],
      ["title_en", "title_en_old"],
      ["body_es", "body_es_old"],
      ["body_en", "body_en_old"],
      ["is_enabled", "is_enabled_old"],
      ["offset_minutes", "offset_minutes_old"],
    ];
    const histChanges: Record<string, unknown> = {
      template_id: current.id,
      template_name: current.name,
      change_kind: "revert",
      changed_by: userData.user.id,
    };
    let anyChange = false;
    for (const [field, oldKey] of fieldMap) {
      if (hist[oldKey] !== null && hist[oldKey] !== undefined) {
        update[field] = hist[oldKey];
        histChanges[`${field}_old`] = current[field];
        histChanges[`${field}_new`] = hist[oldKey];
        anyChange = true;
      }
    }
    if (!anyChange) return json(400, { error: "nothing_to_revert" });

    const { data: updated, error: updErr } = await admin
      .from("notification_templates")
      .update(update)
      .eq("id", current.id)
      .select()
      .maybeSingle();
    if (updErr) return json(500, { error: "update_failed", detail: updErr.message });

    await admin.from("notification_template_history").insert(histChanges);

    return json(200, { ok: true, template: updated });
  } catch (err) {
    console.error("[notification-template-revert]", err);
    return json(500, { error: (err as Error).message });
  }
});
