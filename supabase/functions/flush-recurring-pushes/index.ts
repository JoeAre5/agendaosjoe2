// Flush queued recurring-appointment pushes.
//
// Triggered every minute by pg_cron. Finds rows in
// `pending_recurring_pushes` that haven't been touched in the last 30
// seconds and dispatches one grouped push per row, then stamps
// flushed_at so they are never resent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { dispatchPush } from "../_shared/dispatchPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QUIET_WINDOW_SECONDS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Auth gate — cron only. Requires service-role JWT.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(supabaseUrl, serviceKey);

    const cutoff = new Date(Date.now() - QUIET_WINDOW_SECONDS * 1000).toISOString();

    const { data: rows, error } = await admin
      .from("pending_recurring_pushes")
      .select("*")
      .is("flushed_at", null)
      .lt("last_event_at", cutoff)
      .limit(200);

    if (error) {
      console.error("[flush-recurring-pushes] query error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let dispatched = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows ?? []) {
      try {
        // Map source template → grouped template
        const groupedTemplate =
          row.template_name === "appointment_cancelled_by_shop"
            ? "appointment_cancelled_by_shop_recurring"
            : row.template_name === "appointment_rescheduled"
              ? "appointment_rescheduled_recurring"
              : null;

        if (!groupedTemplate) {
          skipped++;
          continue;
        }

        // Single-occurrence within a series (count==1) → fall back to the
        // standard non-grouped template so the message reads naturally.
        const useTemplate = row.count <= 1 ? row.template_name : groupedTemplate;

        await dispatchPush({
          client_id: row.client_id,
          template_name: useTemplate,
          dispatch_key: `recurring:${row.id}:flush`,
          starts_at: row.first_starts_at ?? undefined,
          vars: {
            count: String(row.count),
            service: row.service ?? "tu cita",
            barber: row.barber ?? "tu barbero",
          },
        });
        dispatched++;
      } catch (err) {
        console.warn("[flush-recurring-pushes] dispatch failed for row", row.id, err);
        failed++;
      }

      // Always stamp flushed_at so a single failure doesn't loop forever.
      await admin
        .from("pending_recurring_pushes")
        .update({ flushed_at: new Date().toISOString() })
        .eq("id", row.id);
    }

    return new Response(
      JSON.stringify({ ok: true, dispatched, skipped, failed, scanned: rows?.length ?? 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[flush-recurring-pushes] error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
