// Daily cron: grant birthday gifts to clients whose birthday is "today" (PR timezone)
// and fire a happy-birthday push to each newly granted client.
// Idempotent — running twice the same day is a no-op for already-granted gifts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { isInternalCaller, unauthorizedResponse } from "../_shared/internalAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await isInternalCaller(req, admin))) return unauthorizedResponse(corsHeaders);

  try {
    // 1. Insert one gift row per birthday-today client (idempotent).
    const { data: granted, error: grantErr } = await admin.rpc("grant_birthday_gifts_today");
    if (grantErr) throw grantErr;

    const rows = (granted ?? []) as Array<{ redemption_id: string; out_client_id: string; first_name: string | null; code: string }>;
    const results: Array<{ client_id: string; push_status: string }> = [];

    for (const r of rows) {
      const name = (r.first_name || "").trim();
      const dispatch_key = `birthday_${r.redemption_id}`;
      const title = "🎂 ¡Feliz cumpleaños!";
      const body = name
        ? `${name}, tienes un corte gratis de regalo. Tu código es ${r.code}.`
        : `Tienes un corte gratis de regalo. Tu código es ${r.code}.`;

      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: r.out_client_id,
            title,
            body,
            url: "/app/cliente?tab=beneficios",
            dispatch_key,
          }),
        });
        const txt = await resp.text();
        results.push({ client_id: r.out_client_id, push_status: `${resp.status}: ${txt.slice(0, 120)}` });
      } catch (e) {
        results.push({ client_id: r.out_client_id, push_status: `error: ${(e as Error).message}` });
      }
    }


    return new Response(
      JSON.stringify({ granted_count: rows.length, results }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
