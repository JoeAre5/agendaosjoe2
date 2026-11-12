// One-shot admin tool: cancel a list of appointments by acuity_id.
// - Cancels in Acuity (PUT /appointments/{id}/cancel?admin=true&noEmail=true)
// - Marks local row status='cancelled'
// Auth: service-role key required (via service-role JWT in Authorization header).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { queueOrDispatchRecurringPush } from "../_shared/recurringPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACUITY_USER_ID = Deno.env.get("ACUITY_USER_ID");
const ACUITY_API_KEY = Deno.env.get("ACUITY_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const basicAuth = btoa(`${ACUITY_USER_ID}:${ACUITY_API_KEY}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Owner-only gate
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
    const body = await req.json();
    const acuityIds: number[] = Array.isArray(body.acuity_ids) ? body.acuity_ids : [];
    const reason: string = body.reason || "Duplicate of recurring protocol";

    if (acuityIds.length === 0) {
      return new Response(JSON.stringify({ error: "acuity_ids required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = {
      total: acuityIds.length,
      acuityCancelled: 0,
      acuityAlreadyCancelled: 0,
      acuityFailed: 0,
      localCancelled: 0,
      details: [] as any[],
    };

    for (const acuityId of acuityIds) {
      try {
        const acuityRes = await fetch(
          `https://acuityscheduling.com/api/v1/appointments/${acuityId}/cancel?admin=true&noEmail=true`,
          {
            method: "PUT",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ cancelNote: reason }),
          }
        );

        if (acuityRes.ok) {
          result.acuityCancelled++;
        } else if (acuityRes.status === 400) {
          // Already cancelled — treat as success
          result.acuityAlreadyCancelled++;
        } else {
          const txt = await acuityRes.text();
          result.acuityFailed++;
          result.details.push({
            acuity_id: acuityId,
            status: acuityRes.status,
            body: txt.slice(0, 200),
          });
          continue;
        }

        const { data: updatedAppt, error: lookupErr } = await supabase
          .from("appointments")
          .select("id, client_id, client_name, service_name, starts_at, amount_paid_cents, payment_confirmed, recurring_group_id")
          .eq("acuity_id", acuityId)
          .maybeSingle();

        if (lookupErr) {
          result.details.push({ acuity_id: acuityId, db_error: lookupErr.message });
        } else {
          const hasPayment = (updatedAppt?.amount_paid_cents ?? 0) > 0 || !!updatedAppt?.payment_confirmed;
          if (updatedAppt && !hasPayment) {
            const { data: hardDel, error: hardDelErr } = await supabase.rpc("webhook_hard_delete_appointment", {
              _appointment_id: updatedAppt.id,
              _reason: reason,
            });
            if (hardDelErr || !(hardDel as any)?.success) {
              result.details.push({ acuity_id: acuityId, db_error: hardDelErr?.message, rpc_result: hardDel });
              continue;
            }
          } else if (updatedAppt && hasPayment) {
            const { error: paidUpdateErr } = await supabase
              .from("appointments")
              .update({ status: "cancelled", paid: false, cancelled_at: new Date().toISOString(), cancelled_by_role: "owner", refund_status: "manual" })
              .eq("id", updatedAppt.id);
            if (paidUpdateErr) {
              result.details.push({ acuity_id: acuityId, db_error: paidUpdateErr.message });
              continue;
            }
          } else if (!updatedAppt) {
            await supabase.from("deleted_appointment_tombstones").upsert({
              acuity_id: acuityId,
              reason,
              source: "cancel-appointments-bulk",
            }, { onConflict: "acuity_id" });
          }
          result.localCancelled++;

          // Recurring-aware push: queues for grouped flush when part of a
          // series, dispatches immediately when not. Never blocks cancellation.
          if (updatedAppt?.client_id && updatedAppt.starts_at) {
            try {
              await queueOrDispatchRecurringPush({
                admin: supabase,
                client_id: updatedAppt.client_id,
                appointment_id: updatedAppt.id,
                recurring_group_id: (updatedAppt as any).recurring_group_id ?? null,
                template_name: "appointment_cancelled_by_shop",
                starts_at: updatedAppt.starts_at,
                service: updatedAppt.service_name || null,
                barber: null,
                event_key: `appt:${updatedAppt.id}:cancel`,
              });
            } catch (pushErr) {
              console.warn("[cancel-bulk] push dispatch failed:", pushErr);
            }
          }
        }
      } catch (err) {
        result.acuityFailed++;
        result.details.push({ acuity_id: acuityId, exception: String(err) });
      }
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
