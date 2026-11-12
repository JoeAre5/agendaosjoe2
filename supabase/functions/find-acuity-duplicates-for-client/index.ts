// One-shot owner tool: find Acuity appointments for a client that are NOT
// in our local DB (or that collide with an existing recurring DB slot),
// and optionally cancel them silently (noEmail=true).
//
// Body:
//   {
//     phone?: string,          // e.g. "7875544700"
//     email?: string,          // e.g. "josevillavideos@yahoo.com"
//     nameContains?: string,   // case-insensitive substring of firstName+lastName
//     horizonDays?: number,    // default 365, max 730
//     dryRun?: boolean,        // default true
//     includeOrphans?: boolean // default true; false only flags exact same-slot duplicates
//   }
//
// Logic:
//   1. Pull future Acuity appointments via /appointments?minDate&maxDate (paginated)
//   2. Filter by phone/email/name match
//   3. Mark each Acuity appt as a duplicate if EITHER:
//        a) its acuity_id is NOT present in `appointments` (DB), OR
//        b) it collides exactly (barber_id+starts_at+ends_at) with a DB recurring appt
//        c) it is a second Acuity record for the same client/calendar/type/start/duration
//   4. dryRun=true → return list of candidates
//      dryRun=false → cancel each via Acuity PUT /appointments/{id}/cancel?admin=true&noEmail=true
//                     and remove/mark the matching local DB row when one exists

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await supabase
      .from("user_roles").select("role").eq("user_id", userData.user.id).maybeSingle();
    if (roleRow?.role !== "owner") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const phone: string | undefined = body.phone?.replace(/\D/g, "");
    const email: string | undefined = body.email?.toLowerCase();
    const nameContains: string | undefined = body.nameContains?.toLowerCase();
    const horizonDays: number = Math.min(Math.max(Number(body.horizonDays) || 365, 1), 730);
    const dryRun: boolean = body.dryRun !== false;
    const includeOrphans: boolean = body.includeOrphans !== false;
    const calendarId: number | undefined = body.calendarId ? Number(body.calendarId) : undefined;
    const minDateOverride: string | undefined = body.minDate; // YYYY-MM-DD

    if (!phone && !email && !nameContains) {
      return new Response(JSON.stringify({ error: "Provide at least one of: phone, email, nameContains" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = minDateOverride ? new Date(`${minDateOverride}T00:00:00Z`) : new Date();
    if (Number.isNaN(today.getTime())) {
      return new Response(JSON.stringify({ error: "Invalid minDate", minDate: minDateOverride }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const horizon = new Date(today.getTime() + horizonDays * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    // Acuity /appointments returns up to ~100 per call. Page in 30-day windows.
    const acuityAppts: any[] = [];
    let cursor = new Date(today);
    while (cursor < horizon) {
      const windowEnd = new Date(Math.min(cursor.getTime() + 30 * 86400000, horizon.getTime()));
      const calParam = calendarId ? `&calendarID=${calendarId}` : "";
      const url = `https://acuityscheduling.com/api/v1/appointments?max=200&minDate=${fmt(cursor)}&maxDate=${fmt(windowEnd)}&showall=true${calParam}`;
      const r = await fetch(url, { headers: { Authorization: `Basic ${basicAuth}` } });
      if (!r.ok) {
        return new Response(JSON.stringify({ error: "Acuity fetch failed", status: r.status, body: (await r.text()).slice(0, 300) }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const arr = await r.json();
      if (Array.isArray(arr)) acuityAppts.push(...arr);
      cursor = new Date(windowEnd.getTime() + 86400000);
    }

    // Filter by client identifier
    const matched = acuityAppts.filter((a: any) => {
      if (a.canceled) return false;
      const ph = (a.phone || "").replace(/\D/g, "");
      const em = (a.email || "").toLowerCase();
      const nm = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase();
      if (phone && ph.endsWith(phone.slice(-7))) return true;
      if (email && em === email) return true;
      if (nameContains && nm.includes(nameContains)) return true;
      return false;
    });

    const matchedIds = matched.map((a) => a.id);

    // Pull our local appointments for these acuity_ids
    const { data: localRows } = await supabase
      .from("appointments")
      .select("acuity_id, barber_id, starts_at, ends_at, is_recurring, status, client_name")
      .in("acuity_id", matchedIds.length ? matchedIds : [-1]);
    const localByAcuity = new Map<number, any>();
    for (const r of localRows || []) localByAcuity.set(r.acuity_id, r);

    // Pull DB recurring slots in horizon to detect collisions for orphan Acuity rows
    const { data: recurringRows } = await supabase
      .from("appointments")
      .select("barber_id, starts_at, ends_at, acuity_id")
      .gte("starts_at", today.toISOString())
      .lte("starts_at", horizon.toISOString())
      .eq("is_recurring", true)
      .neq("status", "cancelled");
    const recurringSlotKey = new Set<string>();
    for (const r of recurringRows || []) {
      recurringSlotKey.add(`${r.starts_at}|${r.ends_at}`); // barber_id may differ in Acuity payload, use time-only
    }

    const duplicateSlotExtras = new Set<number>();
    const slotGroups = new Map<string, any[]>();
    for (const a of matched) {
      const slotKey = [
        a.calendarID || a.calendar || "",
        a.appointmentTypeID || a.type || "",
        a.datetime || "",
        a.duration || "",
      ].join("|");
      const group = slotGroups.get(slotKey) || [];
      group.push(a);
      slotGroups.set(slotKey, group);
    }
    const hasRealContact = (a: any) => {
      const email = String(a.email || "").toLowerCase();
      const phone = String(a.phone || "").replace(/\D/g, "");
      return (email && !email.endsWith("@placeholder.local")) || phone.length >= 7;
    };
    for (const group of slotGroups.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => Number(hasRealContact(b)) - Number(hasRealContact(a)) || Number(a.id) - Number(b.id));
      for (const extra of group.slice(1)) duplicateSlotExtras.add(Number(extra.id));
    }

    // Build candidate list
    const candidates = matched
      .map((a: any) => {
        const local = localByAcuity.get(a.id);
        const sd = a.datetime ? new Date(a.datetime) : null;
        const ed = a.endTime ? new Date(a.endTime) : null;
        const startIso = sd && !Number.isNaN(sd.getTime()) ? sd.toISOString() : null;
        const endIso = ed && !Number.isNaN(ed.getTime()) ? ed.toISOString() : null;
        let reason: string | null = null;
        const slotHasDuplicates = (slotGroups.get([
          a.calendarID || a.calendar || "",
          a.appointmentTypeID || a.type || "",
          a.datetime || "",
          a.duration || "",
        ].join("|"))?.length || 0) > 1;
        if (duplicateSlotExtras.has(Number(a.id))) reason = "duplicate_same_slot";
        else if (slotHasDuplicates) return null;
        else if (!local && includeOrphans) reason = "not_in_db";
        else if (!local) return null;
        else if (local.status === "cancelled") reason = "local_cancelled";
        else {
          // present and active locally → keep
          return null;
        }
        const collides = endIso ? recurringSlotKey.has(`${startIso}|${endIso}`) : false;
        return {
          acuity_id: a.id,
          datetime: a.datetime,
          firstName: a.firstName,
          lastName: a.lastName,
          phone: a.phone,
          email: a.email,
          calendar: a.calendar,
          calendarID: a.calendarID,
          type: a.type,
          appointmentTypeID: a.appointmentTypeID,
          reason,
          collides_with_recurring_slot: collides,
          local_status: local?.status || null,
        };
      })
      .filter(Boolean) as any[];

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        horizonDays,
        totalMatched: matched.length,
        candidatesToCancel: candidates.length,
        candidates,
      }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // EXECUTE: cancel each duplicate, silently. If a matching local row exists
    // without payment, hard-delete it so the sync cannot keep a ghost row alive.
    const result = { cancelled: 0, alreadyCancelled: 0, failed: 0, localCancelled: 0, details: [] as any[] };
    for (const c of candidates) {
      try {
        const r = await fetch(
          `https://acuityscheduling.com/api/v1/appointments/${c.acuity_id}/cancel?admin=true&noEmail=true`,
          {
            method: "PUT",
            headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
            body: JSON.stringify({ cancelNote: "Duplicate of recurring series (silent cleanup)" }),
          }
        );
        if (r.ok) result.cancelled++;
        else if (r.status === 400) result.alreadyCancelled++;
        else {
          result.failed++;
          result.details.push({ acuity_id: c.acuity_id, status: r.status, body: (await r.text()).slice(0, 200) });
          continue;
        }

        const { data: localRow, error: localErr } = await supabase
          .from("appointments")
          .select("id, amount_paid_cents, payment_confirmed")
          .eq("acuity_id", c.acuity_id)
          .maybeSingle();
        if (localErr) {
          result.details.push({ acuity_id: c.acuity_id, db_error: localErr.message });
        } else if (localRow) {
          const hasPayment = (localRow.amount_paid_cents ?? 0) > 0 || !!localRow.payment_confirmed;
          if (!hasPayment) {
            const { data: hardDel, error: hardDelErr } = await supabase.rpc("webhook_hard_delete_appointment", {
              _appointment_id: localRow.id,
              _reason: "Duplicate Acuity same-slot cleanup",
            });
            if (hardDelErr || !(hardDel as any)?.success) {
              result.details.push({ acuity_id: c.acuity_id, db_error: hardDelErr?.message, rpc_result: hardDel });
            } else {
              result.localCancelled++;
            }
          } else {
            const { error: updateErr } = await supabase
              .from("appointments")
              .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by_role: "owner", notes: "Duplicate Acuity same-slot cleanup" })
              .eq("id", localRow.id);
            if (updateErr) result.details.push({ acuity_id: c.acuity_id, db_error: updateErr.message });
            else result.localCancelled++;
          }
        }
      } catch (e) {
        result.failed++;
        result.details.push({ acuity_id: c.acuity_id, exception: String(e) });
      }
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
