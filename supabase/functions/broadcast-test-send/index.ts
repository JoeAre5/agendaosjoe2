// broadcast-test-send
// Owner-only: previews a broadcast on the caller's own devices using the
// in-flight composer payload. Inserts a transient broadcast row (status='test')
// + a receipt for the owner so tapping the push opens the full broadcast modal
// in the client portal, matching the production experience pixel-for-pixel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { sendPush, isExpiredEndpoint } from "../_shared/webPush.ts";
import { getCallerPushSubscriptions, pruneExpiredPushSubscriptions } from "../_shared/pushTestTarget.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, p: unknown) =>
  new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Body {
  pill_es?: string | null;
  pill_en?: string | null;
  title_es: string;
  title_en: string;
  body_es: string;
  body_en: string;
  hero_image_url?: string | null;
  cta_label_es?: string | null;
  cta_label_en?: string | null;
  cta_url?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "missing_auth" });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "invalid_jwt" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isOwner } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "owner" });
    if (!isOwner) return json(403, { error: "forbidden" });

    const b = (await req.json()) as Body;
    if (!b?.title_es || !b?.title_en || !b?.body_es || !b?.body_en) {
      return json(400, { error: "missing_fields" });
    }

    const { clientIds, subscriptions: subs } = await getCallerPushSubscriptions(admin, userData.user);
    if (clientIds.length === 0) return json(200, { ok: true, sent: 0, devices: 0, skipped: "no_client_row" });
    if (subs.length === 0) return json(200, { ok: true, sent: 0, devices: 0, skipped: "no_subscriptions" });

    // Create a transient broadcast row so the modal can be opened by id.
    // Prefix title with [TEST] so it's obvious in any debug dump.
    const { data: testBroadcast, error: insErr } = await admin
      .from("broadcasts")
      .insert({
        pill_es: b.pill_es,
        pill_en: b.pill_en,
        title_es: `[TEST] ${b.title_es}`,
        title_en: `[TEST] ${b.title_en}`,
        body_es: b.body_es,
        body_en: b.body_en,
        hero_image_url: b.hero_image_url,
        cta_label_es: b.cta_label_es,
        cta_label_en: b.cta_label_en,
        cta_url: b.cta_url,
        status: "test",
        created_by: userData.user.id,
      })
      .select("id")
      .single();
    if (insErr || !testBroadcast) {
      return json(500, { error: insErr?.message || "insert_failed" });
    }

    // One receipt per owner client_id so the portal can surface the modal.
    await admin.from("broadcast_receipts").upsert(
      clientIds.map((cid) => ({
        broadcast_id: testBroadcast.id,
        client_id: cid,
        push_success: false,
      })),
      { onConflict: "broadcast_id,client_id" },
    );

    let success = 0;
    const expiredIds: string[] = [];

    await Promise.all(subs.map(async (sub) => {
      const lang = sub.language === "en" ? "en" : "es";
      const title = "🧪 " + (lang === "en" ? b.title_en : b.title_es);
      const body = lang === "en" ? b.body_en : b.body_es;
      const res = await sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title,
          body,
          url: `/app/cliente?broadcast=${testBroadcast.id}`,
          tag: `broadcast-test-${testBroadcast.id}`,
          image: b.hero_image_url || undefined,
          requireInteraction: true,
          data: { broadcast_id: testBroadcast.id, test: true },
        },
      );
      if (res.ok) success++;
      else if (isExpiredEndpoint(res.status)) expiredIds.push(sub.id);
    }));

    await pruneExpiredPushSubscriptions(admin, expiredIds);

    return json(200, { ok: true, sent: success, devices: subs.length, broadcast_id: testBroadcast.id });
  } catch (err) {
    console.error("[broadcast-test-send]", err);
    return json(500, { error: (err as Error).message });
  }
});
