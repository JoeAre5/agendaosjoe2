// admin-notification-test-send
// Owner-only: send a test push of an admin event rule to the caller's devices.
// Body: { event_key, vars? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { sendPush, isExpiredEndpoint } from "../_shared/webPush.ts";
import { getCallerPushSubscriptions, pruneExpiredPushSubscriptions } from "../_shared/pushTestTarget.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, p: unknown) =>
  new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function render(t: string, vars: Record<string, unknown> = {}) {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] == null ? "" : String(vars[k])));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json(401, { error: "missing_auth" });

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "invalid_jwt" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isOwner } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "owner" });
    if (!isOwner) return json(403, { error: "forbidden" });

    const body = await req.json().catch(() => ({}));
    const event_key = String(body.event_key || "");
    const vars = (body.vars ?? {}) as Record<string, unknown>;
    if (!event_key) return json(400, { error: "missing_event_key" });

    const { data: rule } = await admin
      .from("admin_notification_rules")
      .select("title_es, body_es, title_en, body_en, url_path")
      .eq("event_key", event_key)
      .maybeSingle();
    if (!rule) return json(404, { error: "rule_not_found" });

    const { clientIds, subscriptions: subs } = await getCallerPushSubscriptions(admin, userData.user);
    if (clientIds.length === 0) return json(200, { ok: true, sent: 0, devices: 0, skipped: "no_client_row" });
    if (subs.length === 0) return json(200, { ok: true, sent: 0, devices: 0, skipped: "no_subscriptions" });

    const url = rule.url_path ? render(rule.url_path, vars) : undefined;

    let sent = 0;
    const expiredIds: string[] = [];
    for (const s of subs ?? []) {
      const lang = s.language === "en" ? "en" : "es";
      const title = `[TEST] ${render(lang === "en" ? rule.title_en : rule.title_es, vars)}`;
      const renderedBody = render(lang === "en" ? rule.body_en : rule.body_es, vars);
      const res = await sendPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        { title, body: renderedBody, url: url || "https://charliesbarbershop.co/admin/notifications", tag: `test-${event_key}` },
      );
      if (res.ok) sent++;
      else if (isExpiredEndpoint(res.status)) expiredIds.push(s.id);
    }
    await pruneExpiredPushSubscriptions(admin, expiredIds);
    return json(200, { ok: true, sent, devices: subs.length, expired: expiredIds.length });
  } catch (err) {
    console.error("[admin-notification-test-send]", err);
    return json(500, { error: (err as Error).message });
  }
});
