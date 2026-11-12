import { preserveItemizedEdit, readEditItems } from "../_shared/appointmentEditItems.ts";
import { createAcuityAddonResolver } from "../_shared/acuityAddons.ts";
import { preserveFranciscoName } from "../_shared/acuityClientName.ts";
import { contactEmail } from "../_shared/contactEmail.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { queueOrDispatchRecurringPush } from "../_shared/recurringPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Acuity Scheduling Webhook Handler — Independence Layer
 *
 * Receives POST notifications from Acuity, logs every event,
 * applies a duplicate guard (native-first), calculates confidence,
 * and maps to internal AgendaOS protocols.
 */

// --- Protocol mapping (supports both legacy + namespaced action names) ---
const PROTOCOL_MAP: Record<string, string> = {
  "appointment.scheduled": "create_appointment",
  "appointment.rescheduled": "update_appointment_time",
  "appointment.canceled": "cancel_appointment",
  "appointment.changed": "update_appointment",
  "appointment.no_show": "mark_no_show",
  // Legacy form-encoded variants (what Acuity actually sends today)
  scheduled: "create_appointment",
  rescheduled: "update_appointment_time",
  canceled: "cancel_appointment",
  changed: "update_appointment",
  "no_show": "mark_no_show",
};

// --- Confidence scoring ---
function calcConfidence(appt: any, barberId: string | undefined): number {
  let score = 0;
  let factors = 0;

  // Has barber mapping
  factors++;
  if (barberId) score++;

  // Has client info
  factors++;
  if (appt.firstName || appt.lastName) score++;

  // Has price
  factors++;
  if (parseFloat(appt.price || "0") > 0) score++;

  // Has valid datetime
  factors++;
  if (appt.datetime) score++;

  // Has service type
  factors++;
  if (appt.type) score++;

  return factors > 0 ? Math.round((score / factors) * 100) / 100 : 0;
}

/**
 * Parse incoming webhook body — Acuity sends application/x-www-form-urlencoded,
 * but we still accept JSON for tests/manual replays.
 */
async function parseAcuityBody(req: Request, rawText: string): Promise<Record<string, any>> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawText);
    } catch {
      // fall through to form-urlencoded attempt
    }
  }

  // Form-urlencoded (Acuity's actual format)
  if (contentType.includes("application/x-www-form-urlencoded") || rawText.includes("=")) {
    const params = new URLSearchParams(rawText);
    const out: Record<string, any> = {};
    params.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }

  // Last-ditch JSON attempt
  try {
    return JSON.parse(rawText);
  } catch {
    return { _raw: rawText };
  }
}

/**
 * Acuity signs every webhook: x-acuity-signature = base64(HMAC-SHA256(apiKey, rawBody)).
 * Requests without a valid signature are rejected before any database work.
 */
async function verifyAcuitySignature(rawText: string, signature: string | null): Promise<boolean> {
  const apiKey = Deno.env.get("ACUITY_API_KEY") || "";
  if (!apiKey || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(apiKey),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawText)));
  let bin = "";
  for (const b of mac) bin += String.fromCharCode(b);
  const expected = btoa(bin);
  const provided = signature.trim();
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const startMs = Date.now();

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // --- Supabase admin client (needed for logging even on errors) ---
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const rawText = await req.text();
    const signatureOk = await verifyAcuitySignature(rawText, req.headers.get("x-acuity-signature"));
    if (!signatureOk) {
      console.warn("acuity-webhook: rejected request with missing/invalid signature");
      try {
        await supabaseAdmin.from("acuity_webhook_log").insert({
          event_type: "rejected_invalid_signature",
          raw_payload: { _raw: rawText.slice(0, 500) },
          parsed_action: null,
          mapped_protocol: null,
          confidence_score: 0,
          processing_ms: Date.now() - startMs,
          error_message: "Invalid or missing x-acuity-signature",
        });
      } catch { /* logging must not break */ }
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const payload = await parseAcuityBody(req, rawText);
    const { action, id } = payload;

    console.log(`acuity-webhook: received action="${action}" id=${id}`);

    if (!id || !action) {
      // Log unknown/malformed event
      await supabaseAdmin.from("acuity_webhook_log").insert({
        event_type: action || "unknown",
        raw_payload: payload,
        parsed_action: null,
        mapped_protocol: null,
        confidence_score: 0,
        processing_ms: Date.now() - startMs,
        error_message: "Missing action or id",
      });
      return new Response(
        JSON.stringify({ error: "Missing action or id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this is a supported action
    const protocol = PROTOCOL_MAP[action] || null;

    if (!protocol) {
      // Log unsupported/unknown event
      await supabaseAdmin.from("acuity_webhook_log").insert({
        event_type: action,
        raw_payload: payload,
        acuity_appointment_id: id,
        parsed_action: action,
        mapped_protocol: null,
        confidence_score: 0,
        processing_ms: Date.now() - startMs,
      });
      console.log(`acuity-webhook: ignoring unsupported action "${action}"`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: `Unsupported action: ${action}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const acuityAppointmentId = Number(id);
    const { data: tombstone } = Number.isFinite(acuityAppointmentId)
      ? await supabaseAdmin
        .from("deleted_appointment_tombstones")
        .select("acuity_id, deleted_at, reason, source")
        .eq("acuity_id", acuityAppointmentId)
        .maybeSingle()
      : { data: null } as any;

    if (tombstone) {
      await supabaseAdmin.from("acuity_webhook_log").insert({
        event_type: action,
        raw_payload: payload,
        acuity_appointment_id: acuityAppointmentId,
        parsed_action: action,
        mapped_protocol: "skip_deleted_tombstone",
        confidence_score: 0,
        processing_ms: Date.now() - startMs,
        error_message: `Ignored deleted appointment tombstone from ${tombstone.source}`,
      });
      console.log(`acuity-webhook: skipped tombstoned acuity_id=${acuityAppointmentId}`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "deleted_tombstone", acuity_id: acuityAppointmentId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Acuity credentials ---
    const acuityUserId = Deno.env.get("ACUITY_USER_ID");
    const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
    if (!acuityUserId || !acuityApiKey) {
      await supabaseAdmin.from("acuity_webhook_log").insert({
        event_type: action,
        raw_payload: payload,
        acuity_appointment_id: id,
        parsed_action: action,
        mapped_protocol: protocol,
        confidence_score: 0,
        processing_ms: Date.now() - startMs,
        error_message: "Acuity credentials not configured",
      });
      return new Response(
        JSON.stringify({ error: "Acuity credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const basicAuth = btoa(`${acuityUserId}:${acuityApiKey}`);

    // --- Load barber mapping ---
    const { data: barbers } = await supabaseAdmin
      .from("barbers")
      .select("id, acuity_calendar_key");

    const calendarKeyToBarber: Record<string, string> = {};
    for (const b of barbers || []) {
      if (b.acuity_calendar_key) {
        calendarKeyToBarber[b.acuity_calendar_key.toUpperCase().trim()] = b.id;
      }
    }

    // Fetch calendars from Acuity to map calendarID → barberId
    const calRes = await fetch("https://acuityscheduling.com/api/v1/calendars", {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    const calendars = await calRes.json();

    const calendarIdToBarber: Record<number, string> = {};
    for (const cal of calendars) {
      const name = (cal.name || "").toUpperCase().trim();
      for (const [key, barberId] of Object.entries(calendarKeyToBarber)) {
        if (name.includes(key)) {
          calendarIdToBarber[cal.id] = barberId;
          break;
        }
      }
    }

    // --- Fetch the full appointment from Acuity ---
    const apptRes = await fetch(
      `https://acuityscheduling.com/api/v1/appointments/${id}`,
      { headers: { Authorization: `Basic ${basicAuth}` } }
    );

    if (!apptRes.ok) {
      const errText = await apptRes.text();
      console.error(`acuity-webhook: failed to fetch appointment ${id}: ${apptRes.status} ${errText}`);
      await supabaseAdmin.from("acuity_webhook_log").insert({
        event_type: action,
        raw_payload: payload,
        acuity_appointment_id: id,
        parsed_action: action,
        mapped_protocol: protocol,
        confidence_score: 0,
        processing_ms: Date.now() - startMs,
        error_message: `Failed to fetch appointment: ${apptRes.status}`,
      });
      return new Response(
        JSON.stringify({ error: `Failed to fetch appointment ${id}`, status: apptRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appt = await apptRes.json();

    // --- Resolve barber ---
    const barberId = calendarIdToBarber[appt.calendarID];
    const confidence = calcConfidence(appt, barberId);

    if (!barberId) {
      console.error(`acuity-webhook: no barber mapping for calendarID=${appt.calendarID}`);
      await supabaseAdmin.from("acuity_webhook_log").insert({
        event_type: action,
        raw_payload: appt,
        acuity_appointment_id: appt.id,
        parsed_action: action,
        mapped_protocol: protocol,
        confidence_score: confidence,
        processing_ms: Date.now() - startMs,
        error_message: `No barber mapping for calendarID=${appt.calendarID}`,
      });
      return new Response(
        JSON.stringify({ error: `No barber mapping for calendarID=${appt.calendarID}` }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============================================================
    // DUPLICATE GUARD — Check if native record should take priority
    // ============================================================
    const isCancelAction = action === "appointment.canceled" || action === "canceled";
    const isStatusChange = isCancelAction || action === "appointment.no_show" || action === "no_show";

    const { data: existing } = await supabaseAdmin
      .from("appointments")
      .select("id, payment_confirmed, created_by_role, created_by_user_id, client_id, client_name, paid, payment_method, amount_paid_cents, tip_cents, status, cancelled_at, cancelled_by_role, refund_status, last_pushed_at, recurring_group_id, service_name, barber_id, starts_at, booking_source, edit_line_items, duration_minutes, price_cents, service_id, addons")
      .eq("acuity_id", appt.id)
      .maybeSingle();

    if (existing?.payment_confirmed && !isStatusChange) {
      // Native record leads for money fields, but schedule changes (date/time/
      // barber) from a reschedule MUST still apply, or paid appointments get
      // stuck at their old time in the app while Acuity shows the new one.
      const newStart = new Date(appt.datetime).toISOString();
      const newEnd = new Date(new Date(appt.datetime).getTime() + (readEditItems(existing.edit_line_items) ? existing.duration_minutes : (appt.duration || 30)) * 60_000).toISOString();
      const timeChanged = existing.starts_at && new Date(existing.starts_at).toISOString() !== newStart;
      const barberChanged = existing.barber_id !== barberId;
      if (timeChanged || barberChanged) {
        const { error: schedErr } = await supabaseAdmin
          .from("appointments")
          .update({ starts_at: newStart, ends_at: newEnd, barber_id: barberId })
          .eq("id", existing.id);
        await supabaseAdmin.from("acuity_webhook_log").insert({
          event_type: action,
          raw_payload: appt,
          acuity_appointment_id: appt.id,
          parsed_action: action,
          mapped_protocol: schedErr ? "paid_schedule_update_failed" : "paid_schedule_updated",
          confidence_score: confidence,
          processing_ms: Date.now() - startMs,
          error_message: schedErr?.message ?? null,
        });
        return new Response(
          JSON.stringify({ ok: !schedErr, schedule_updated: !schedErr, acuity_id: appt.id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`acuity-webhook: superseded_by_native acuity_id=${appt.id} (payment_confirmed=true)`);
      await supabaseAdmin.from("acuity_webhook_log").insert({
        event_type: action,
        raw_payload: appt,
        acuity_appointment_id: appt.id,
        parsed_action: action,
        mapped_protocol: "superseded_by_native",
        confidence_score: confidence,
        processing_ms: Date.now() - startMs,
      });
      return new Response(
        JSON.stringify({ ok: true, superseded: true, acuity_id: appt.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Build DB row (same mapping logic as before) ---
    const startsAt = new Date(appt.datetime).toISOString();
    const endsAt = new Date(
      new Date(appt.datetime).getTime() + (appt.duration || 30) * 60_000
    ).toISOString();

    const priceCents = Math.round(parseFloat(appt.price || "0") * 100);
    const amountPaidCents = Math.round(parseFloat(appt.amountPaid || "0") * 100);
    const acuityPaid = appt.paid === "yes";

    const notes = (appt.notes || "").toLowerCase();
    const isCancelled = !!appt.canceled;
    const isNoShow = !!appt.noShow;
    const isPast = new Date(appt.datetime) < new Date();

    let paymentMethod: string | null = null;
    let effectiveAmountPaid = amountPaidCents;
    let isPaid = false;
    let paymentConfirmed = false;

    /**
     * Identify payment method from Acuity's response.
     *
     * Acuity exposes payment info in three places (in order of trust):
     *   1. appt.labels[]        — owner-applied tags like "Paid PayPal", "Paid Cash"
     *   2. appt.transactionID   — present only for processor-charged payments
     *   3. appt.notes           — fallback freeform text
     *
     * Note: ATH Móvil is NOT a native Acuity processor — it always shows up
     * as either a label or a note. PayPal/Stripe arrive with a transactionID.
     */
    function detectProcessor(): string | null {
      const labels = Array.isArray(appt.labels) ? appt.labels : [];
      const labelText = labels
        .map((l: any) => (l?.name || l || "").toString().toLowerCase())
        .join(" ");
      const haystack = `${labelText} ${notes}`;

      if (haystack.includes("paypal")) return "paypal";
      if (haystack.includes("stripe")) return "stripe";
      if (haystack.includes("ath")) return "ath_movil";
      if (haystack.includes("cash") || haystack.includes("efectivo")) return "cash";

      // Fall back to transactionID hints
      const txId = (appt.transactionID || "").toString().toLowerCase();
      if (txId.startsWith("pi_") || txId.startsWith("ch_")) return "stripe";
      if (txId.length > 10 && /^[A-Z0-9]+$/i.test(appt.transactionID || "")) return "paypal";

      return null;
    }

    if (acuityPaid) {
      paymentMethod = detectProcessor() || "stripe"; // last-resort default
      if (effectiveAmountPaid === 0) effectiveAmountPaid = priceCents;
      isPaid = true;
      paymentConfirmed = true;
    } else if (amountPaidCents > 0) {
      paymentMethod = detectProcessor() || "cash";
      isPaid = amountPaidCents >= priceCents;
      paymentConfirmed = amountPaidCents >= priceCents;
    }
    // NOTE: removed auto-cash for past appointments per memory

    const tipCents = effectiveAmountPaid > priceCents ? effectiveAmountPaid - priceCents : 0;

    const resolveAddonNames = createAcuityAddonResolver(async () => {
      const response = await fetch("https://acuityscheduling.com/api/v1/appointment-addons", {
        headers: { Authorization: `Basic ${basicAuth}` },
      });
      if (!response.ok) throw new Error(`Add-on catalog HTTP ${response.status}`);
      return response.json();
    }, (error) => console.warn("acuity-webhook: add-on names unresolved; preserving stored names", String(error)));
    const addonNames = readEditItems(existing?.edit_line_items) ? undefined : await resolveAddonNames(appt);

    const row: Record<string, any> = {
      acuity_id: appt.id,
      barber_id: barberId,
      client_name: `${appt.firstName || ""} ${appt.lastName || ""}`.trim() || "Unknown",
      client_email: contactEmail(appt.email),
      client_phone: appt.phone || null,
      acuity_client_id: appt.clientID || null,
      service_name: appt.type || "Unknown",
      service_id: appt.appointmentTypeID || null,
      ...(addonNames !== undefined ? { addons: addonNames } : {}),
      starts_at: startsAt,
      ends_at: endsAt,
      duration_minutes: appt.duration || 30,
      price_cents: priceCents,
      paid: isPaid && !isCancelled && !isNoShow,
      payment_method: paymentMethod,
      amount_paid_cents: effectiveAmountPaid,
      tip_cents: tipCents,
      notes: appt.notes || null,
      label: appt.label || null,
      status: isCancelled ? "cancelled" : isNoShow ? "no_show" : "scheduled",
      payment_confirmed: paymentConfirmed,
      booking_source: (existing?.booking_source && existing.booking_source !== "acuity_sync" && existing.booking_source !== "unknown")
        ? existing.booking_source
        : "acuity_sync",
      updated_at: new Date().toISOString(),
    };

    if (existing?.status === "cancelled" && !isCancelled) {
      row.status = "cancelled";
      row.paid = false;
      row.client_id = existing.client_id;
      row.client_name = existing.client_name || row.client_name;
      row.cancelled_at = existing.cancelled_at || row.updated_at;
      row.cancelled_by_role = existing.cancelled_by_role || "owner";
      row.refund_status = existing.refund_status || "none";
    }

    // ─── P0 Fix: Pre-resolve client_id BEFORE upsert ───────────────────────
    // The DB trigger ensure_client_exists() also handles this, but resolving
    // here lets us avoid any chance of an INSERT into clients (which can trip
    // prevent_duplicate_client_phone). Phone → email → name fallback. Defensive:
    // any error here is swallowed so the trigger acts as backup.
    try {
      let resolvedClientId: string | null = null;

      // 1. Phone match (normalized last-10 via RPC)
      if (row.client_phone) {
        const { data: byPhone } = await supabaseAdmin.rpc("find_client_by_phone", {
          _phone: row.client_phone,
        });
        if (byPhone) resolvedClientId = byPhone as string;
      }

      // 2. Email match (case-insensitive exact, tiebreaker matches trigger)
      if (!resolvedClientId && row.client_email) {
        const normEmail = String(row.client_email).trim().toLowerCase();
        if (normEmail) {
          const { data: byEmail } = await supabaseAdmin
            .from("clients")
            .select("id, total_visits, created_at")
            .ilike("email", normEmail)
            .order("total_visits", { ascending: false })
            .order("created_at", { ascending: true })
            .limit(1);
          if (byEmail && byEmail.length > 0) resolvedClientId = byEmail[0].id as string;
        }
      }

      if (resolvedClientId) {
        row.client_id = resolvedClientId;
        console.log(`acuity-webhook: pre-resolved client_id=${resolvedClientId} for acuity_id=${appt.id}`);
      }
    } catch (resolveErr) {
      // Non-fatal — trigger will still try to match. Log and continue.
      console.warn(`acuity-webhook: client pre-resolve failed for acuity_id=${appt.id}:`, (resolveErr as Error).message);
    }

    // ============================================================
    // CANCELLATION PUSH — fire for BOTH paid and unpaid cancellations,
    // BEFORE any hard-delete. Idempotent via dispatch_key.
    // ============================================================
    if (isCancelled && existing?.id && existing.client_id && startsAt) {
      try {
        // Recurring-aware: if part of a series, queue for grouped flush.
        // One-off appointments dispatch immediately as before.
        await queueOrDispatchRecurringPush({
          admin: supabaseAdmin,
          client_id: existing.client_id,
          appointment_id: existing.id,
          recurring_group_id: (existing as any).recurring_group_id ?? null,
          template_name: "appointment_cancelled_by_shop",
          starts_at: startsAt,
          service: appt.type || (existing as any).service_name || null,
          barber: null,
          event_key: `appt:${existing.id}:cancel`,
        });
      } catch (pushErr) {
        console.warn("[acuity-webhook] cancellation push dispatch failed:", pushErr);
      }
    }

    // ============================================================
    // HARD-DELETE on cancellation (when no payment recorded)
    // Per owner directive: admin/barber cancellations remove the row entirely
    // (no ghost). Client-initiated cancellations are kept as soft-delete with
    // cancelled_by_role='client' so the row stays visible in Sales for manual
    // refund follow-up and historical retention reports.
    // Detection sources (any one trips client mode):
    //   1. existing.cancelled_by_role === 'client'  (set by client-booking-refund)
    //   2. appt.cancelNote starts with "Client cancellation"  (Acuity self-cancel link)
    // ============================================================
    const cancelNoteRaw = String((appt as any).cancelNote || "").trim().toLowerCase();
    const isClientCancellation =
      existing?.cancelled_by_role === "client" ||
      cancelNoteRaw.startsWith("client cancellation") ||
      cancelNoteRaw.startsWith("cancelado por el cliente");

    if (isCancelled && existing && (existing.amount_paid_cents ?? 0) === 0 && !existing.payment_confirmed && !isClientCancellation) {
      try {
        const { data: hardDel, error: hardDelErr } = await supabaseAdmin.rpc("webhook_hard_delete_appointment", {
          _appointment_id: existing.id,
          _reason: "Acuity webhook: cancellation (no payment) → hard delete",
        });

        if (!hardDelErr && (hardDel as any)?.success) {
          await supabaseAdmin.from("acuity_webhook_log").insert({
            event_type: action,
            raw_payload: appt,
            acuity_appointment_id: appt.id,
            parsed_action: action,
            mapped_protocol: "hard_delete_on_cancel",
            confidence_score: confidence,
            processing_ms: Date.now() - startMs,
          });
          console.log(`acuity-webhook: HARD DELETED acuity_id=${appt.id} (cancelled, no payment)`);
          // P1 fix: adopt any duplicate that was skipped because this row owned the slot.
          try {
            const { data: skipped } = await supabaseAdmin
              .from("acuity_webhook_log")
              .select("acuity_appointment_id")
              .eq("mapped_protocol", "skip_duplicate_active_slot")
              .eq("error_message", `Active slot already owned by acuity_id=${appt.id}`)
              .limit(5);
            const ids = [...new Set((skipped || []).map((r: any) => Number(r.acuity_appointment_id)).filter(Boolean))];
            for (const dupId of ids) {
              const body = `action=appointment.scheduled&id=${dupId}`;
              const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("ACUITY_API_KEY") || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
              const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body)));
              let bin = ""; for (const b of mac) bin += String.fromCharCode(b);
              await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/acuity-webhook`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", "x-acuity-signature": btoa(bin) },
                body,
              });
              await supabaseAdmin.from("acuity_webhook_log").insert({
                event_type: "adopt_skipped_duplicate",
                raw_payload: { cancelled_acuity_id: appt.id, adopted_acuity_id: dupId },
                acuity_appointment_id: dupId,
                parsed_action: "appointment.scheduled",
                mapped_protocol: "adopt_skipped_duplicate",
                confidence_score: confidence,
                processing_ms: Date.now() - startMs,
              });
            }
          } catch (adoptErr) {
            console.warn("acuity-webhook: duplicate adoption failed:", (adoptErr as Error).message);
          }
          return new Response(
            JSON.stringify({ ok: true, action, hard_deleted: true, acuity_id: appt.id }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          console.warn(`acuity-webhook: hard-delete RPC returned non-success`, hardDelErr?.message, hardDel);
        }
      } catch (delErr) {
        console.error(`acuity-webhook: hard-delete attempt failed:`, (delErr as Error).message);
      }
      // Fall through to normal status update if hard delete failed
    }
    if (isCancelled && !existing) {
      await supabaseAdmin.from("acuity_webhook_log").insert({
        event_type: action,
        raw_payload: appt,
        acuity_appointment_id: appt.id,
        parsed_action: action,
        mapped_protocol: "skip_cancelled_not_imported",
        confidence_score: confidence,
        processing_ms: Date.now() - startMs,
      });
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "cancelled_not_imported", acuity_id: appt.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For status-change events on confirmed appointments, only update status
    if (existing?.payment_confirmed && isStatusChange) {
      // Paid cancellations are kept as evidence for a manual refund.
      // Stamp refund_status='manual' (only if not already set) so the row
      // is clearly flagged in Sales as needing a hand-processed refund.
      const isPaidCancel =
        isCancelAction &&
        ((existing.amount_paid_cents ?? 0) > 0 || existing.payment_confirmed);
      const updatePayload: Record<string, unknown> = {
        status: row.status,
        paid: false,
        updated_at: row.updated_at,
      };
      if (isPaidCancel && !existing.refund_status) {
        updatePayload.refund_status = "manual";
        updatePayload.cancelled_at = new Date().toISOString();
      }
      if (isCancelled && !existing.cancelled_by_role) {
        updatePayload.cancelled_by_role = isClientCancellation ? "client" : "owner";
        if (!updatePayload.cancelled_at) updatePayload.cancelled_at = new Date().toISOString();
        if (isClientCancellation && !existing.refund_status && (existing.amount_paid_cents ?? 0) > 0) {
          updatePayload.refund_status = "manual";
        }
      }
      const { error: updateError } = await supabaseAdmin
        .from("appointments")
        .update(updatePayload)
        .eq("acuity_id", appt.id);

      if (updateError) {
        console.error(`acuity-webhook: status update failed for acuity_id=${appt.id}:`, updateError.message);
        await supabaseAdmin.from("acuity_webhook_log").insert({
          event_type: action,
          raw_payload: appt,
          acuity_appointment_id: appt.id,
          parsed_action: action,
          mapped_protocol: protocol,
          confidence_score: confidence,
          processing_ms: Date.now() - startMs,
          error_message: updateError.message,
        });
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Preserve app-set fields when the row was created by our client app
      // (the app is the source of truth for payment + client linkage).
      const appOwned = !!existing?.created_by_role; // any client/admin/barber-app created row
      if (appOwned) {
        if (existing!.created_by_role) row.created_by_role = existing!.created_by_role;
        if (existing!.created_by_user_id) row.created_by_user_id = existing!.created_by_user_id;
        if (existing!.client_id) row.client_id = existing!.client_id;
        // Never let webhook clobber a paid record's payment fields
        if (existing!.paid || (existing!.amount_paid_cents ?? 0) > 0) {
          row.paid = existing!.paid;
          row.payment_method = existing!.payment_method;
          row.amount_paid_cents = existing!.amount_paid_cents;
          row.tip_cents = existing!.tip_cents;
        }
      }

      preserveItemizedEdit(row, existing);
      preserveFranciscoName(row, existing);
      // Echo-loop guard: if the local row was just pushed to Acuity within the
      // last 30 seconds, ignore EVERY field the app may have authored locally.
      // Acuity does NOT know about products/services folded into the balance,
      // re-linked clients, manual payment edits, or notes typed in the app. If
      // we let any of those through, the webhook echoes back stale data and
      // clobbers what the operator just saved. Only `status` is allowed through
      // because cancellations from Acuity must still propagate.
      // RULE: every column the app writes in EditAppointment.runSave /
      // AppointmentDetail must be listed here. Add new fields to BOTH places.
      if (existing) {
        const lastPushed = (existing as any).last_pushed_at
          ? new Date((existing as any).last_pushed_at).getTime()
          : 0;
        if (lastPushed && Date.now() - lastPushed < 30_000 && !isStatusChange) {
          // Schedule / service shape
          delete (row as any).starts_at;
          delete (row as any).ends_at;
          delete (row as any).duration_minutes;
          delete (row as any).price_cents;
          delete (row as any).service_name;
          delete (row as any).service_id;
          delete (row as any).addons;
          // Client identity / linkage
          delete (row as any).client_name;
          delete (row as any).client_email;
          delete (row as any).client_phone;
          delete (row as any).acuity_client_id;
          // Payment state (app is source of truth once it has touched the row)
          delete (row as any).paid;
          delete (row as any).payment_method;
          delete (row as any).amount_paid_cents;
          delete (row as any).tip_cents;
          delete (row as any).payment_confirmed;
          // Free-text fields
          delete (row as any).notes;
          delete (row as any).label;
        }
      }


      if (row.status !== "cancelled" && (row as any).starts_at && (row as any).ends_at) {
        const { data: slotOwner } = await supabaseAdmin
          .from("appointments")
          .select("id, acuity_id, client_name")
          .eq("barber_id", barberId)
          .lt("starts_at", (row as any).ends_at)
          .gt("ends_at", (row as any).starts_at)
          .not("status", "in", "(cancelled,no_show)")
          .eq("overlap_exempt", false)
          .neq("acuity_id", appt.id)
          .limit(1)
          .maybeSingle();

        if (slotOwner) {
          // Durable, idempotent conflict record (one open row per Acuity id).
          // Acuity stays authoritative: the owner resolves; nothing is discarded silently.
          const { error: conflictErr } = await supabaseAdmin.from("acuity_sync_conflicts").insert({
            acuity_id: appt.id,
            source: "acuity-webhook",
            conflict_reason: `overlaps local appointment acuity_id=${slotOwner.acuity_id}`,
            payload: { incoming: appt, existing_appointment_id: slotOwner.id },
            status: "open",
          });
          if (conflictErr && (conflictErr as any).code !== "23505") {
            return new Response(JSON.stringify({ error: "conflict_record_failed" }),
              { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          await supabaseAdmin.from("acuity_webhook_log").insert({
            event_type: action,
            raw_payload: appt,
            acuity_appointment_id: appt.id,
            parsed_action: action,
            mapped_protocol: "overlap_conflict_recorded",
            confidence_score: confidence,
            processing_ms: Date.now() - startMs,
            error_message: `Active slot already owned by acuity_id=${slotOwner.acuity_id}`,
          });
          console.log(`acuity-webhook: skipped duplicate active slot acuity_id=${appt.id}; existing acuity_id=${slotOwner.acuity_id}`);
          return new Response(
            JSON.stringify({ ok: true, synced: false, conflict: true, reason: "overlap_conflict_recorded", acuity_id: appt.id, existing_acuity_id: slotOwner.acuity_id }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const { error: upsertError } = await supabaseAdmin
        .from("appointments")
        .upsert(row, { onConflict: "acuity_id" });

      if (upsertError) {
        console.error(`acuity-webhook: upsert failed for acuity_id=${appt.id}:`, upsertError.message);
        await supabaseAdmin.from("acuity_webhook_log").insert({
          event_type: action,
          raw_payload: appt,
          acuity_appointment_id: appt.id,
          parsed_action: action,
          mapped_protocol: protocol,
          confidence_score: confidence,
          processing_ms: Date.now() - startMs,
          error_message: upsertError.message,
        });
        return new Response(
          JSON.stringify({ error: upsertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Log successful processing ---
    const finalProtocol = existing?.payment_confirmed && isStatusChange
      ? `${protocol}_on_confirmed`
      : protocol;

    await supabaseAdmin.from("acuity_webhook_log").insert({
      event_type: action,
      raw_payload: appt,
      acuity_appointment_id: appt.id,
      parsed_action: action,
      mapped_protocol: finalProtocol,
      confidence_score: confidence,
      processing_ms: Date.now() - startMs,
    });

    console.log(`acuity-webhook: ${action} → ${finalProtocol} acuity_id=${appt.id} confidence=${confidence} ${Date.now() - startMs}ms`);

    // ─── Fire-and-forget push: appointment_rescheduled ───
    // Only fires for true time changes coming from Acuity. Idempotent per
    // (appointment, new start time). Skips if no client linked, no time
    // change actually occurred, or the row was just pushed by us (echo loop).
    if (
      protocol === "update_appointment_time" &&
      existing?.id &&
      startsAt &&
      existing.starts_at !== startsAt &&
      existing.client_id
    ) {
      const lastPushed = (existing as any).last_pushed_at
        ? new Date((existing as any).last_pushed_at).getTime()
        : 0;
      const isEchoLoop = lastPushed && Date.now() - lastPushed < 30_000;
      if (!isEchoLoop) {
        try {
          // Look up barber name (existing row has barber_id only)
          const { data: barberRow } = await supabaseAdmin
            .from("barbers")
            .select("name")
            .eq("id", existing.barber_id || barberId)
            .maybeSingle();
          // Recurring-aware: queue for grouped flush, or dispatch instantly
          // when not part of a series.
          await queueOrDispatchRecurringPush({
            admin: supabaseAdmin,
            client_id: existing.client_id,
            appointment_id: existing.id,
            recurring_group_id: (existing as any).recurring_group_id ?? null,
            template_name: "appointment_rescheduled",
            starts_at: startsAt,
            service: appt.type || existing.service_name || null,
            barber: barberRow?.name ?? null,
          event_key: `appt:${existing.id}:reschedule:${new Date(startsAt).toISOString()}`,
          });
        } catch (pushErr) {
          console.warn("[acuity-webhook] reschedule push dispatch failed:", pushErr);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, action, protocol: finalProtocol, acuity_id: appt.id, confidence, starts_at: startsAt }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("acuity-webhook error:", err.message);
    // Attempt to log the error
    try {
      await supabaseAdmin.from("acuity_webhook_log").insert({
        event_type: "error",
        raw_payload: { error: err.message },
        confidence_score: 0,
        processing_ms: Date.now() - startMs,
        error_message: err.message,
      });
    } catch (_) { /* best-effort logging */ }

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
