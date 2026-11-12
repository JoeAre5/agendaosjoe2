// Owner-only edge function: sends a broadcast push notification to every client
// who has push enabled and at least one active push subscription.
//
// Flow:
//  1. Validate caller is the shop owner (JWT → user_roles).
//  2. Load broadcast row by id, mark as `sending`.
//  3. Find all opted-in clients with at least one push_subscription.
//  4. Fan out web-push to every subscription with requireInteraction:true so the
//     notification stays in the system tray until the user taps or dismisses.
//  5. Insert one broadcast_receipts row per client with success/error.
//  6. Update broadcast row counters + status='sent' + sent_at.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { sendPush, isExpiredEndpoint } from "../_shared/webPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  broadcast_id: string;
  client_ids?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate caller as owner
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Owner access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Body = await req.json();
    if (!body.broadcast_id) {
      return new Response(JSON.stringify({ error: "Missing broadcast_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load broadcast
    const { data: broadcast, error: bErr } = await admin
      .from("broadcasts")
      .select("*")
      .eq("id", body.broadcast_id)
      .maybeSingle();
    if (bErr || !broadcast) {
      return new Response(JSON.stringify({ error: "Broadcast not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (broadcast.status === "sent" || broadcast.status === "sending") {
      return new Response(
        JSON.stringify({ error: `Broadcast already ${broadcast.status}` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await admin.from("broadcasts").update({ status: "sending" }).eq("id", broadcast.id);

    const targetClientIds = Array.isArray(body.client_ids)
      ? Array.from(new Set(body.client_ids.filter((id) => typeof id === "string" && id.length > 0)))
      : [];

    // Eligible audience: clients opted-in to push and notifications, plus their subs.
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select(
        "id, endpoint, p256dh, auth, language, client_id, " +
        "clients!inner(id, notifications_enabled, notify_push_appointments)"
      )
      .eq("clients.notifications_enabled", true)
      .eq("clients.notify_push_appointments", true);

    const validSubs = targetClientIds.length > 0
      ? ((subs || []) as any[]).filter((s) => targetClientIds.includes(s.client_id))
      : ((subs || []) as any[]);

    // Group by client to compute audience size and dedupe receipts.
    const subsByClient = new Map<string, any[]>();
    for (const s of validSubs) {
      const list = subsByClient.get(s.client_id) ?? [];
      list.push(s);
      subsByClient.set(s.client_id, list);
    }
    const audience = subsByClient.size;

    // Pre-create receipts so the modal can show on next portal load even if push fails.
    if (audience > 0) {
      const receiptRows = Array.from(subsByClient.keys()).map((cid) => ({
        broadcast_id: broadcast.id,
        client_id: cid,
        push_success: false,
      }));
      await admin
        .from("broadcast_receipts")
        .upsert(receiptRows, { onConflict: "broadcast_id,client_id" });
    }

    // Fan out push.
    let delivered = 0;
    let failed = 0;
    const expired: string[] = [];
    const clientResults = new Map<string, { ok: boolean; error?: string }>();

    await Promise.all(
      validSubs.map(async (sub) => {
        const lang = sub.language === "en" ? "en" : "es";
        const payload = {
          title: lang === "en" ? broadcast.title_en : broadcast.title_es,
          body: lang === "en" ? broadcast.body_en : broadcast.body_es,
          url: `/app/cliente?broadcast=${broadcast.id}`,
          tag: `broadcast-${broadcast.id}`,
          requireInteraction: true,
          image: broadcast.hero_image_url || undefined,
          data: { broadcast_id: broadcast.id },
        };
        const r = await sendPush(sub, payload);
        if (r.ok) {
          delivered++;
          clientResults.set(sub.client_id, { ok: true });
          await admin
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
            .eq("id", sub.id);
        } else {
          failed++;
          if (isExpiredEndpoint(r.status)) expired.push(sub.id);
          if (!clientResults.has(sub.client_id)) {
            clientResults.set(sub.client_id, { ok: false, error: r.error });
          }
        }
      })
    );

    if (expired.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", expired);
    }

    // Update receipt success per client (any successful sub = success).
    await Promise.all(
      Array.from(clientResults.entries()).map(async ([cid, res]) =>
        admin
          .from("broadcast_receipts")
          .update({ push_success: res.ok, push_error: res.ok ? null : res.error?.slice(0, 500) })
          .eq("broadcast_id", broadcast.id)
          .eq("client_id", cid)
      )
    );

    await admin
      .from("broadcasts")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        audience_count: audience,
        delivered_count: delivered,
        failed_count: failed,
      })
      .eq("id", broadcast.id);

    return new Response(
      JSON.stringify({ ok: true, audience, delivered, failed, expired: expired.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-broadcast]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
