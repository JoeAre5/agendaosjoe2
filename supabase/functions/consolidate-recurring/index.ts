// supabase/functions/consolidate-recurring/index.ts
//
// Cleans up recurring appointment artifacts in the local DB + Acuity.
//
// Match key for "duplicate": full client_name (lowercased+trimmed) + barber_id + exact starts_at
// Plus: deletes block_times that exactly overlap a recurring appointment of the same barber
//       (criterion: same barber_id, same starts_at, same ends_at, AND a recurring appointment
//        exists matching those values — i.e. block was a "shadow" for that appointment).
//
// Modes:
//   { dryRun: true }  → return counts + samples, no writes, no Acuity calls
//   { dryRun: false } → execute: cancel duplicate appts in Acuity (noEmail) + mark cancelled
//                       locally; delete shadow blocks in Acuity + locally.
//
// Owner-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function normName(n: string | null | undefined): string {
  return (n || "").trim().toLowerCase().replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Auth: owner only ─────────────────────────────────────────────
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
    const dryRun: boolean = body.dryRun !== false; // default true (safe)
    const horizonDays: number = Math.min(Math.max(Number(body.horizonDays) || 365, 1), 730);
    // Window in minutes: appts of the same client+barber within this window count as duplicates
    const windowMinutes: number = Math.min(Math.max(Number(body.windowMinutes) || 5, 0), 60);
    const windowMs = windowMinutes * 60 * 1000;

    const nowIso = new Date().toISOString();
    const horizonIso = new Date(
      Date.now() + horizonDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // ── 1) Pull future, non-cancelled appointments in horizon ────────
    const { data: appts, error: apptErr } = await supabase
      .from("appointments")
      .select(
        "id, acuity_id, barber_id, client_name, starts_at, ends_at, is_recurring, recurring_group_id, status, created_at"
      )
      .gte("starts_at", nowIso)
      .lte("starts_at", horizonIso)
      .neq("status", "cancelled")
      .order("starts_at");
    if (apptErr) throw apptErr;

    // ── 2) Group by (normName + barber_id) and cluster within windowMs ───
    type Appt = NonNullable<typeof appts>[number];
    const byClient = new Map<string, Appt[]>();
    for (const a of appts || []) {
      const key = `${normName(a.client_name)}|${a.barber_id}`;
      const arr = byClient.get(key) || [];
      arr.push(a);
      byClient.set(key, arr);
    }

    // Build clusters: appts within windowMs of each other (sorted by starts_at)
    const clusters: Appt[][] = [];
    for (const [, arr] of byClient) {
      if (arr.length < 2) continue;
      const sorted = [...arr].sort(
        (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      );
      let current: Appt[] = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        const prevTime = new Date(current[current.length - 1].starts_at).getTime();
        const currTime = new Date(sorted[i].starts_at).getTime();
        if (currTime - prevTime <= windowMs) {
          current.push(sorted[i]);
        } else {
          if (current.length > 1) clusters.push(current);
          current = [sorted[i]];
        }
      }
      if (current.length > 1) clusters.push(current);
    }

    // ── 3) Determine duplicates: keep "best" (recurring preferred,
    //      else earliest created_at, else lowest acuity_id). Cancel rest.
    const toCancel: { appt: Appt; keptId: string }[] = [];
    for (const cluster of clusters) {
      const sorted = [...cluster].sort((a, b) => {
        // Prefer recurring rows
        if (a.is_recurring !== b.is_recurring) return a.is_recurring ? -1 : 1;
        // Then earliest created_at
        const ca = new Date(a.created_at).getTime();
        const cb = new Date(b.created_at).getTime();
        if (ca !== cb) return ca - cb;
        // Then lower acuity_id (positive ids preferred over negative locals)
        return (a.acuity_id || 0) - (b.acuity_id || 0);
      });
      const keep = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        toCancel.push({ appt: sorted[i], keptId: keep.id });
      }
    }

    // ── 4) Find shadow blocks: block_times where (barber_id, starts_at, ends_at)
    //      matches a recurring appointment in horizon.
    const recurringAppts = (appts || []).filter(
      (a) => a.is_recurring || a.recurring_group_id
    );

    let blocksToDelete: any[] = [];
    if (recurringAppts.length > 0) {
      const { data: blocks } = await supabase
        .from("block_times")
        .select("id, acuity_block_id, barber_id, starts_at, ends_at, notes, recurring_group_id")
        .gte("starts_at", nowIso)
        .lte("starts_at", horizonIso);

      const apptKey = new Set(
        recurringAppts.map((a) => `${a.barber_id}|${a.starts_at}|${a.ends_at}`)
      );
      blocksToDelete = (blocks || []).filter((b) =>
        apptKey.has(`${b.barber_id}|${b.starts_at}|${b.ends_at}`)
      );
    }

    // ── DRY RUN: report only ─────────────────────────────────────────
    if (dryRun) {
      return new Response(
        JSON.stringify({
          dryRun: true,
          horizonDays,
          windowMinutes,
          totalFutureAppts: appts?.length || 0,
          duplicateGroups: clusters.length,
          appointmentsToCancel: toCancel.length,
          shadowBlocksToDelete: blocksToDelete.length,
          sampleCancellations: toCancel.slice(0, 10).map(({ appt, keptId }) => ({
            cancel_id: appt.id,
            cancel_acuity_id: appt.acuity_id,
            keep_id: keptId,
            client: appt.client_name,
            starts_at: appt.starts_at,
          })),
          sampleBlocks: blocksToDelete.slice(0, 10).map((b) => ({
            id: b.id,
            acuity_block_id: b.acuity_block_id,
            barber_id: b.barber_id,
            starts_at: b.starts_at,
          })),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── EXECUTE ──────────────────────────────────────────────────────
    const result = {
      dryRun: false,
      cancelledAppointments: 0,
      cancelFailed: 0,
      deletedBlocks: 0,
      blockDeleteFailed: 0,
      details: [] as any[],
    };

    // Cancel duplicate appointments in Acuity, then hard-delete local unpaid duplicates.
    for (const { appt } of toCancel) {
      try {
        // Cancel in Acuity if positive id
        if (appt.acuity_id && appt.acuity_id > 0) {
          const acuityRes = await fetch(
            `https://acuityscheduling.com/api/v1/appointments/${appt.acuity_id}/cancel?admin=true&noEmail=true`,
            {
              method: "PUT",
              headers: {
                Authorization: `Basic ${basicAuth}`,
                "Content-Type": "application/json",
              },
            }
          );
          // 200 ok, 400 already cancelled — both acceptable
          if (!acuityRes.ok && acuityRes.status !== 400) {
            const errText = await acuityRes.text();
            result.cancelFailed++;
            result.details.push({
              appt_id: appt.id,
              acuity_id: appt.acuity_id,
              reason: "acuity cancel failed",
              status: acuityRes.status,
              body: errText.slice(0, 200),
            });
            continue;
          }
        }
        const { data: hardDel, error: hardDelErr } = await supabase.rpc("webhook_hard_delete_appointment", {
          _appointment_id: appt.id,
          _reason: "Consolidate recurring: duplicate local row → hard delete",
        });
        if (hardDelErr || !(hardDel as any)?.success) {
          result.cancelFailed++;
          result.details.push({
            appt_id: appt.id,
            acuity_id: appt.acuity_id,
            reason: "local hard delete failed",
            error: hardDelErr?.message,
            rpc_result: hardDel,
          });
          continue;
        }
        result.cancelledAppointments++;
      } catch (err) {
        result.cancelFailed++;
        result.details.push({
          appt_id: appt.id,
          reason: "exception",
          error: String(err),
        });
      }
    }

    // Delete shadow blocks
    for (const b of blocksToDelete) {
      try {
        if (b.acuity_block_id) {
          await fetch(
            `https://acuityscheduling.com/api/v1/blocks/${b.acuity_block_id}?admin=true`,
            {
              method: "DELETE",
              headers: { Authorization: `Basic ${basicAuth}` },
            }
          );
        }
        await supabase.from("block_times").delete().eq("id", b.id);
        result.deletedBlocks++;
      } catch (err) {
        result.blockDeleteFailed++;
        result.details.push({
          block_id: b.id,
          reason: "block delete failed",
          error: String(err),
        });
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
