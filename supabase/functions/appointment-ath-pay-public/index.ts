// appointment-ath-pay-public
//
// Public (no-login) ATH Móvil charge for an EXISTING appointment, used by the
// QR / pay-link page (/pay/:id). Mirrors `admin-appointment-ath-pay` but has no
// role check: a signed pay-link code is the capability (bound to one appointment, its balance and an expiry) and the amount is
// ALWAYS computed server-side (the client can only add a tip).
//
// Inserts a pending `transactions` row with metadata1 = transaction id, so the
// existing `athmovil-webhook` (admin-appointment branch) commits the payment
// straight to this appointment — no name/phone matching needed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyPayLink } from "../_shared/payLink.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ATH_ENDPOINT = "https://payments.athmovil.com/api/business-transaction/ecommerce/payment";
const MAX_AMOUNT_CENTS = 150_000;
const MAX_TIP_CENTS = 50_000;
const LOG = "[appointment-ath-pay-public]";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function normalizePhone10(input: string | null | undefined): string {
  return (input || "").replace(/\D/g, "").slice(-10);
}
function centsToDollars(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "method_not_allowed" }, 405);

  const PUBLIC_TOKEN = Deno.env.get("ATH_MOVIL_PUBLIC_TOKEN");
  const PRIVATE_TOKEN = Deno.env.get("ATH_MOVIL_PRIVATE_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!PUBLIC_TOKEN || !PRIVATE_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
    return jsonResponse({ success: false, error: "server_misconfigured" }, 500);
  }

  let body: { payCode?: string; tipCents?: number; phone?: string };
  try { body = await req.json(); } catch { return jsonResponse({ success: false, error: "invalid_json" }, 400); }

  const claims = await verifyPayLink(body.payCode);
  if (!claims) return jsonResponse({ success: false, error: "invalid_link" }, 403);
  const appointmentId = claims.a;
  const tipCents = Math.min(MAX_TIP_CENTS, Math.max(0, Math.round(Number(body.tipCents || 0))));
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) {
    return jsonResponse({ success: false, error: "missing_appointment_id" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: appt, error: fetchErr } = await supabase
    .from("appointments")
    .select("id, status, price_cents, amount_paid_cents, barber_id, client_id, client_phone, service_name")
    .eq("id", appointmentId)
    .maybeSingle();

  if (fetchErr || !appt) return jsonResponse({ success: false, error: "appointment_not_found" }, 404);
  if (appt.status === "cancelled") return jsonResponse({ success: false, error: "appointment_cancelled" }, 409);

  const balanceCents = Math.max(0, (appt.price_cents || 0) - (appt.amount_paid_cents || 0));
  if (balanceCents <= 0) return jsonResponse({ success: false, error: "already_paid" }, 409);
  if (balanceCents !== claims.b) return jsonResponse({ success: false, error: "link_outdated" }, 409);

  const totalCents = balanceCents + tipCents;
  if (totalCents > MAX_AMOUNT_CENTS) return jsonResponse({ success: false, error: "amount_exceeds_ath_limit" }, 400);

  const phone10 = normalizePhone10(body.phone);
  if (phone10.length !== 10) return jsonResponse({ success: false, error: "invalid_phone" }, 400);

  // Abuse guard: payment requests are throttled per appointment and per phone
  // so this public endpoint cannot be used to spam arbitrary numbers.
  for (const [key, max, win] of [
    [`ath_pub_appt:${appt.id}`, 4, 900],
    [`ath_pub_phone:${phone10}`, 4, 3600],
  ] as Array<[string, number, number]>) {
    const { data: rl, error: rlErr } = await supabase.rpc("check_rate_limit", { _key: key, _max: max, _window_seconds: win });
    if (rlErr || (rl as { allowed?: boolean } | null)?.allowed === false) {
      return jsonResponse({ success: false, error: "rate_limited" }, 429);
    }
  }

  // Retire any previous unfinished ATH attempt for this appointment so a retry
  // can never leave two pending rows behind (a common source of "pending sales").
  await supabase
    .from("transactions")
    .update({ status: "failed" })
    .eq("appointment_id", appt.id)
    .eq("payment_method", "ath_movil")
    .eq("status", "pending")
    // Only this public flow's own attempts, and only once ATH's 10-minute
    // window has lapsed, so a visitor can't cancel a live or staff-created request.
    .eq("source", "online")
    .lt("created_at", new Date(Date.now() - 11 * 60 * 1000).toISOString());

  const { data: txn, error: txnErr } = await supabase
    .from("transactions")
    .insert({
      barber_id: appt.barber_id,
      client_id: appt.client_id,
      appointment_id: appt.id,
      type: "service",
      payment_method: "ath_movil",
      subtotal_cents: balanceCents,
      tip_cents: tipCents,
      total_cents: totalCents,
      status: "pending",
      source: "online",
      notes: `ATH Móvil — pago por QR/enlace de cita${tipCents > 0 ? ` | Propina: $${(tipCents / 100).toFixed(2)}` : ""}`,
    })
    .select("id")
    .single();

  if (txnErr || !txn) {
    console.error(`${LOG} ✗ Failed to insert pending transaction`, txnErr);
    return jsonResponse({ success: false, error: "txn_insert_failed" }, 500);
  }

  const totalDollars = centsToDollars(totalCents);
  const subtotalDollars = centsToDollars(balanceCents);
  const tipDollars = centsToDollars(tipCents);
  const serviceName = (appt.service_name || "Servicio").slice(0, 40);

  const items = [
    { name: serviceName, description: "Appointment", quantity: 1, price: subtotalDollars, tax: 0, metadata: "service" },
  ];
  if (tipDollars > 0) items.push({ name: "Propina", description: "Tip", quantity: 1, price: tipDollars, tax: 0, metadata: "tip" });

  const athPayload = {
    env: "production",
    publicToken: PUBLIC_TOKEN,
    privateToken: PRIVATE_TOKEN,
    timeout: 600,
    total: totalDollars,
    subtotal: subtotalDollars,
    tax: 0,
    metadata1: txn.id,
    metadata2: "admin-appointment",
    phoneNumber: phone10,
    items,
  };

  let athResponse: Record<string, unknown>;
  let athStatus: number;
  try {
    const athRes = await fetch(ATH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(athPayload),
    });
    athStatus = athRes.status;
    const text = await athRes.text();
    try { athResponse = JSON.parse(text); }
    catch {
      await supabase.from("transactions").update({ status: "failed" }).eq("id", txn.id);
      return jsonResponse({ success: false, error: "ath_api_error", athResponse: { rawBody: text.slice(0, 500), status: athStatus } }, 502);
    }
  } catch (e) {
    await supabase.from("transactions").update({ status: "failed" }).eq("id", txn.id);
    return jsonResponse({ success: false, error: "ath_network_error", message: (e as Error).message }, 502);
  }

  const athStatusField = (athResponse?.status as string | undefined)?.toLowerCase();
  const athData = athResponse?.data as { ecommerceId?: string } | undefined;
  const ecommerceId = athData?.ecommerceId;

  if (athStatus < 200 || athStatus >= 300 || athStatusField !== "success" || !ecommerceId) {
    const athErrorCode = (athResponse?.errorcode as string | undefined) || undefined;
    await supabase.from("transactions").update({ status: "failed" }).eq("id", txn.id);
    return jsonResponse({ success: false, error: "ath_api_error", athErrorCode }, 502);
  }

  await supabase.from("transactions").update({ ath_reference_number: ecommerceId }).eq("id", txn.id);

  console.log(`${LOG} ✔ DONE txn=${txn.id} ecommerceId=${ecommerceId}`);
  return jsonResponse({ success: true, transactionId: txn.id, ecommerceId }, 200);
});
