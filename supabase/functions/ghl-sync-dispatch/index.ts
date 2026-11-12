// One-way outbound sync: Supabase appointments → GoHighLevel inbound webhook.
// Reads a queued row from ghl_sync_queue, builds a normalized payload, POSTs to GHL.
// Never raises errors back to the caller — booking flow must never break on GHL failure.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCaller, isOwnerCaller, unauthorizedResponse } from "../_shared/internalAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function deriveBookingOrigin(booking_source: string | null, created_by_role: string | null): string {
  if (created_by_role === "client_app" || booking_source === "pwa") return "client_app";
  if (created_by_role === "public_site" || booking_source === "public_site") return "public_website";
  if (created_by_role === "admin" || booking_source === "admin_manual") return "admin";
  if (created_by_role === "barber" || booking_source === "barber_manual") return "barber";
  if (booking_source === "acuity_sync") return "acuity_external";
  return "unknown";
}

function isPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return email.toLowerCase().endsWith("@placeholder.local");
}

function splitName(full: string | null | undefined): { first: string | null; last: string | null } {
  if (!full) return { first: null, last: null };
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function formatAptDate(starts_at: string): string {
  // YYYY-MM-DD in AST (Puerto Rico, UTC-4, no DST)
  const d = new Date(new Date(starts_at).getTime() - 4 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function formatAptTime(starts_at: string): string {
  // h:mm AM/PM in AST
  const d = new Date(new Date(starts_at).getTime() - 4 * 60 * 60 * 1000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Only the database trigger (internal secret) or an owner may invoke this.
  const internal = await isInternalCaller(req, admin);
  const owner = internal ? false : await isOwnerCaller(req, admin);
  if (!internal && !owner) return unauthorizedResponse(corsHeaders);

  let queueId: string | null = null;
  let testMode = false;
  let testPayloadOverride: Record<string, unknown> | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    queueId = body.queue_id || null;
    testMode = body.test === true;
    testPayloadOverride = body.payload || null;
  } catch {
    // empty body OK
  }

  const webhookUrl = Deno.env.get("GHL_WEBHOOK_URL");

  // ─── TEST MODE: send a passed-in payload directly, return GHL response ───
  if (testMode && testPayloadOverride) {
    if (!owner) return jsonRes({ error: "Forbidden" }, 403);
    if (!webhookUrl) return jsonRes({ error: "GHL_WEBHOOK_URL not set" }, 400);
    try {
      const ghlRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayloadOverride),
      });
      const text = await ghlRes.text();
      return jsonRes({ ok: ghlRes.ok, status: ghlRes.status, response: text.slice(0, 500) });
    } catch (e) {
      return jsonRes({ ok: false, error: (e as Error).message });
    }
  }

  if (!queueId) return jsonRes({ error: "queue_id required" }, 400);

  // Load queue row
  const { data: queueRow, error: qErr } = await admin
    .from("ghl_sync_queue")
    .select("id, appointment_id, event_type, event_id, status, attempt_count")
    .eq("id", queueId)
    .maybeSingle();
  if (qErr || !queueRow) {
    return jsonRes({ error: "queue row not found", detail: qErr?.message }, 404);
  }
  if (queueRow.status === "sent" || queueRow.status === "skipped") {
    return jsonRes({ ok: true, skipped: true, status: queueRow.status });
  }

  // If no webhook URL, mark skipped (don't error — booking flow keeps going).
  if (!webhookUrl) {
    await admin.from("ghl_sync_queue").update({
      status: "skipped",
      last_error: "GHL_WEBHOOK_URL not configured",
      updated_at: new Date().toISOString(),
    }).eq("id", queueId);
    return jsonRes({ ok: true, skipped: true });
  }

  // Load appointment + barber + client
  const { data: appt, error: aErr } = await admin
    .from("appointments")
    .select("id, acuity_id, client_id, barber_id, client_name, client_email, client_phone, service_name, starts_at, status, paid, payment_method, amount_paid_cents, booking_source, created_by_role, created_at")
    .eq("id", queueRow.appointment_id)
    .maybeSingle();
  if (aErr || !appt) {
    await admin.from("ghl_sync_queue").update({
      status: "failed",
      attempt_count: (queueRow.attempt_count || 0) + 1,
      last_error: `appointment not found: ${aErr?.message || "missing"}`,
      updated_at: new Date().toISOString(),
    }).eq("id", queueId);
    return jsonRes({ ok: false, error: "appointment not found" });
  }

  const [{ data: barber }, { data: client }] = await Promise.all([
    appt.barber_id
      ? admin.from("barbers_public").select("name").eq("id", appt.barber_id).maybeSingle()
      : Promise.resolve({ data: null }),
    appt.client_id
      ? admin.from("clients").select("first_name, last_name, email, phone").eq("id", appt.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Resolve customer fields (prefer clients table, fall back to appointment fields)
  let firstName: string | null = client?.first_name || null;
  let lastName: string | null = client?.last_name || null;
  if (!firstName && !lastName) {
    const parts = splitName(appt.client_name);
    firstName = parts.first;
    lastName = parts.last;
  }
  const rawEmail = client?.email || appt.client_email || null;
  const customerEmail = isPlaceholderEmail(rawEmail) ? null : rawEmail;
  const customerPhone = client?.phone || appt.client_phone || null;

  const booking_source = appt.booking_source || null;
  const created_by_role = appt.created_by_role || null;
  const booking_origin = deriveBookingOrigin(booking_source, created_by_role);

  const payment_status = appt.paid ? "paid" : "unpaid";
  const amount_paid = appt.amount_paid_cents ? appt.amount_paid_cents / 100 : 0;

  const payload = {
    event_type: queueRow.event_type,
    event_id: queueRow.event_id,
    occurred_at: new Date().toISOString(),
    booking_id: appt.id,
    customer_id: appt.client_id,
    acuity_appointment_id: appt.acuity_id,
    customer_first_name: firstName,
    customer_last_name: lastName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    service_name: appt.service_name,
    barber_name: barber?.name || null,
    appointment_date: formatAptDate(appt.starts_at),
    appointment_time: formatAptTime(appt.starts_at),
    appointment_status: appt.status,
    payment_status,
    payment_method: appt.payment_method,
    amount_paid,
    booking_source,
    created_by_role,
    booking_origin,
    created_at: appt.created_at,
  };

  // POST to GHL — swallow errors, just update queue row.
  let httpStatus = 0;
  let responseText = "";
  let ok = false;
  try {
    const ghlRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    httpStatus = ghlRes.status;
    responseText = await ghlRes.text();
    ok = ghlRes.ok;
  } catch (e) {
    responseText = (e as Error).message;
  }

  await admin.from("ghl_sync_queue").update({
    status: ok ? "sent" : "failed",
    http_status: httpStatus || null,
    last_error: ok ? null : responseText.slice(0, 500),
    attempt_count: (queueRow.attempt_count || 0) + 1,
    payload,
    sent_at: ok ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", queueId);

  // Never echo customer data back to the caller.
  return jsonRes({ ok, http_status: httpStatus });
});
