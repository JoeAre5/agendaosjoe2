// notification-test-send
// Owner-only: send a preview push of a template to the current caller's own
// devices. Bypasses is_enabled so owners can preview paused templates.
// Body: { template_id? template_name?, vars?, title_es?, title_en?, body_es?, body_en?, url_path? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { sendPush, isExpiredEndpoint } from "../_shared/webPush.ts";
import { getCallerPushSubscriptions, pruneExpiredPushSubscriptions } from "../_shared/pushTestTarget.ts";

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

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
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

    const body = await req.json().catch(() => ({}));
    const templateName = String(body.template_name || "");
    const templateId = String(body.template_id || "");
    const vars = body.vars;
    if (!templateName && !templateId) return json(400, { error: "missing_template" });

    // Load template (ignore is_enabled — this is a preview)
    const { data: tpl } = await admin
      .from("notification_templates")
      .select("title_es, body_es, title_en, body_en, url_path, name")
      .eq(templateId ? "id" : "name", templateId || templateName)
      .maybeSingle();
    if (!tpl) return json(404, { error: "template_not_found" });

    const { clientIds, subscriptions: subs } = await getCallerPushSubscriptions(admin, userData.user);
    if (clientIds.length === 0) return json(200, { ok: true, sent: 0, devices: 0, skipped: "no_client_row" });
    if (subs.length === 0) return json(200, { ok: true, sent: 0, devices: 0, skipped: "no_subscriptions" });

    const filled = vars ?? { service: "Corte de prueba", barber: "Charlie", time: "3:00 PM", date: "hoy" };
    let success = 0;
    let failure = 0;
    const expiredIds: string[] = [];

    await Promise.all(subs.map(async (sub) => {
      const lang = sub.language === "en" ? "en" : "es";
      const payload = {
        title: "🧪 " + fillTemplate(lang === "en" ? (body.title_en || tpl.title_en) : (body.title_es || tpl.title_es), filled),
        body: fillTemplate(lang === "en" ? (body.body_en || tpl.body_en) : (body.body_es || tpl.body_es), filled),
        url: body.url_path || tpl.url_path || "/app/cliente",
        tag: `test-${tpl.name}`,
      };
      const result = await sendPush(sub, payload);
      if (result.ok) success++;
      else {
        failure++;
        if (isExpiredEndpoint(result.status)) expiredIds.push(sub.id);
      }
    }));

    await pruneExpiredPushSubscriptions(admin, expiredIds);

    return json(200, { ok: true, sent: success, success, failure, devices: subs.length, expired: expiredIds.length });
  } catch (err) {
    console.error("[notification-test-send]", err);
    return json(500, { error: (err as Error).message });
  }
});
