// supabase/functions/acuity-block-sync/index.ts
//
// Two modes:
//   1) action="backfill"   → For every future appointment with negative acuity_id (local-only),
//                            create a matching /blocks entry in Acuity and store the returned
//                            acuity_block_id in block_times so cancel can later remove it.
//   2) action="release"    → Given an appointment_id (negative acuity_id), find the linked
//                            block_times row and DELETE the Acuity block + the local block_times row.
//
// Auth: requires owner role.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { utcIsoToAcuityDatetime } from "../_shared/timezone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ACUITY_USER_ID = Deno.env.get("ACUITY_USER_ID");
const ACUITY_API_KEY = Deno.env.get("ACUITY_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const basicAuth = btoa(`${ACUITY_USER_ID}:${ACUITY_API_KEY}`);

// Phase 1B.TIMEZONE: Acuity expects datetimes with the shop's wall-clock + offset.
// Was: hardcoded `-0400` and `t - 4h` math. Now reads shop_settings.timezone.
async function toAcuityIso(d: Date): Promise<string> {
  return await utcIsoToAcuityDatetime(d.toISOString());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (roleRow?.role !== "owner") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body.action || "backfill";

    // ─── BACKFILL MODE ──────────────────────────────────────────────────
    if (action === "backfill") {
      // Only future, non-cancelled, local (negative acuity_id) appointments
      const nowIso = new Date().toISOString();
      const { data: appts, error: apptErr } = await supabase
        .from("appointments")
        .select(
          "id, acuity_id, barber_id, starts_at, ends_at, client_name, service_name"
        )
        .lt("acuity_id", 0)
        .gte("starts_at", nowIso)
        .neq("status", "cancelled")
        .order("starts_at");

      if (apptErr) throw apptErr;

      // Map barber → acuity_calendar_id
      const barberIds = [...new Set(appts?.map((a) => a.barber_id) || [])];
      const { data: barbers } = await supabase
        .from("barbers")
        .select("id, acuity_calendar_id, name")
        .in("id", barberIds);
      const calMap = new Map(
        barbers?.map((b) => [b.id, b.acuity_calendar_id]) || []
      );

      const results = {
        total: appts?.length || 0,
        created: 0,
        skipped: 0,
        failed: 0,
        details: [] as any[],
      };

      for (const appt of appts || []) {
        const calId = calMap.get(appt.barber_id);
        if (!calId) {
          results.skipped++;
          results.details.push({
            appt_id: appt.id,
            reason: "no calendar_id for barber",
          });
          continue;
        }

        // Idempotency: skip if a block already exists for this barber + start window
        const { data: existing } = await supabase
          .from("block_times")
          .select("id, acuity_block_id")
          .eq("barber_id", appt.barber_id)
          .eq("starts_at", appt.starts_at)
          .not("acuity_block_id", "is", null)
          .maybeSingle();
        if (existing) {
          results.skipped++;
          results.details.push({
            appt_id: appt.id,
            reason: "block already exists",
            acuity_block_id: existing.acuity_block_id,
          });
          continue;
        }

        // POST /blocks to Acuity
        const blockPayload = {
          calendarID: calId,
          start: await toAcuityIso(new Date(appt.starts_at)),
          end: await toAcuityIso(new Date(appt.ends_at)),
          notes: `Auto-block for in-app appt ${appt.id} (${appt.client_name} - ${appt.service_name})`,
        };

        try {
          const acuityRes = await fetch(
            "https://acuityscheduling.com/api/v1/blocks",
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${basicAuth}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(blockPayload),
            }
          );
          const acuityJson = await acuityRes.json();
          if (!acuityRes.ok || !acuityJson?.id) {
            results.failed++;
            results.details.push({
              appt_id: appt.id,
              reason: "acuity rejected",
              acuity: acuityJson,
            });
            continue;
          }

          // Persist to block_times so we can later DELETE on cancel
          await supabase.from("block_times").insert({
            acuity_block_id: acuityJson.id,
            barber_id: appt.barber_id,
            starts_at: appt.starts_at,
            ends_at: appt.ends_at,
            is_all_day: false,
            notes: `Auto-block:appt:${appt.id}`,
          });

          results.created++;
        } catch (err) {
          results.failed++;
          results.details.push({
            appt_id: appt.id,
            reason: "fetch error",
            error: String(err),
          });
        }
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── RELEASE MODE ───────────────────────────────────────────────────
    if (action === "release") {
      const apptId: string | undefined = body.appointment_id;
      if (!apptId) {
        return new Response(
          JSON.stringify({ error: "appointment_id required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Find the auto-block we created for this appointment via the marker in notes
      const { data: block } = await supabase
        .from("block_times")
        .select("id, acuity_block_id")
        .ilike("notes", `Auto-block:appt:${apptId}`)
        .maybeSingle();

      if (!block || !block.acuity_block_id) {
        return new Response(
          JSON.stringify({ released: false, reason: "no block found" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // DELETE in Acuity
      const acuityRes = await fetch(
        `https://acuityscheduling.com/api/v1/blocks/${block.acuity_block_id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Basic ${basicAuth}` },
        }
      );

      // Always remove our local row even if Acuity is grumpy (idempotent)
      await supabase.from("block_times").delete().eq("id", block.id);

      return new Response(
        JSON.stringify({
          released: true,
          acuity_block_id: block.acuity_block_id,
          acuity_status: acuityRes.status,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
