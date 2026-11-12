// Register or refresh a push subscription for the calling client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  user_agent?: string;
  language?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Body = await req.json();
    if (!body.endpoint || !body.p256dh || !body.auth) {
      return new Response(JSON.stringify({ error: "Missing subscription fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve client_id for this auth user
    let { data: client } = await admin
      .from("clients")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    // If the person already exists as an unlinked client row, attach that row
    // before creating anything new. This is important for owners/admins whose
    // email may exist from a prior booking/import but not be tied to auth yet.
    if (!client && userData.user.email) {
      const { data: emailMatch } = await admin
        .from("clients")
        .select("id")
        .ilike("email", userData.user.email.toLowerCase())
        .is("auth_user_id", null)
        .maybeSingle();
      if (emailMatch) {
        const { error: linkErr } = await admin
          .from("clients")
          .update({ auth_user_id: userData.user.id, is_guest: false, account_verified: true })
          .eq("id", emailMatch.id);
        if (linkErr) throw linkErr;
        client = emailMatch;
      }
    }

    // If no clients row exists, auto-create one for owners/admins so push works
    // on admin devices (notifyOwners targets owner clients rows).
    if (!client) {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "owner")
        .maybeSingle();
      if (roleRow) {
        const meta = (userData.user.user_metadata || {}) as Record<string, unknown>;
        const first = String(meta.first_name || meta.full_name || meta.name || "Admin").split(" ")[0];
        const last = String(meta.last_name || "").trim() || null;
        const { data: created, error: createErr } = await admin
          .from("clients")
          .insert({
            auth_user_id: userData.user.id,
            first_name: first || "Admin",
            last_name: last,
            email: userData.user.email ?? null,
            is_guest: false,
            account_verified: true,
            booking_source: "admin",
          })
          .select("id")
          .single();
        if (createErr) {
          console.error("[register-push-subscription] owner client create failed", createErr);
          return new Response(JSON.stringify({ error: "Could not create owner profile" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        client = created;
      } else {
        return new Response(JSON.stringify({ error: "Client profile not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const language = body.language === "en" ? "en" : "es";

    // Upsert by endpoint
    const { error: upsertErr } = await admin
      .from("push_subscriptions")
      .upsert(
        {
          client_id: client.id,
          endpoint: body.endpoint,
          p256dh: body.p256dh,
          auth: body.auth,
          user_agent: body.user_agent ?? null,
          language,
          last_used_at: new Date().toISOString(),
          failure_count: 0,
        },
        { onConflict: "endpoint" }
      );

    // Prune sibling subscriptions: same (client_id, user_agent) but a
    // different endpoint are stale rotations of the same device. Browsers
    // (esp. iOS Safari/PWAs) regenerate the endpoint on reinstall/permission
    // reset, leaving zombie rows that bloat delivery counts without actually
    // delivering. Keep only the just-registered endpoint per device.
    if (!upsertErr && body.user_agent) {
      const { error: pruneErr } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("client_id", client.id)
        .eq("user_agent", body.user_agent)
        .neq("endpoint", body.endpoint);
      if (pruneErr) console.warn("[register-push-subscription] prune siblings failed", pruneErr);
    }

    if (upsertErr) throw upsertErr;

    // Also flip master notifications_enabled on the client
    await admin
      .from("clients")
      .update({ notifications_enabled: true, notifications_permission_asked: true })
      .eq("id", client.id);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[register-push-subscription]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
