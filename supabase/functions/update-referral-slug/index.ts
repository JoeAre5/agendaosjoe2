import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, reason: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, reason: "unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const cleaned = String(body?.slug || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "");

    if (!/^[a-z0-9-]{3,30}$/.test(cleaned)) {
      return json({ success: false, reason: "invalid_format" }, 400);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseUser.auth.getUser(token);
    if (userError || !userData?.user) {
      return json({ success: false, reason: "unauthorized" }, 401);
    }

    const { data, error } = await supabaseUser.rpc("update_client_referral_slug", {
      _new_slug: cleaned,
    });

    console.log("referral_slug_save_attempt", {
      user_id: userData.user.id,
      slug: cleaned,
      success: !error && (data as any)?.success !== false,
      reason: error?.message || (data as any)?.reason || null,
    });

    if (error) return json({ success: false, reason: error.message }, 400);
    return json(data);
  } catch (error) {
    console.error("referral_slug_save_error", error);
    return json({ success: false, reason: "server_error" }, 500);
  }
});