// admin-appointment-ath-pay
//
// REST-based ATH Móvil charge for an EXISTING appointment (admin pay screen).
// Mirrors `athmovil-create-payment` but operates on appointments instead of
// booking_drafts. Inserts a pending `transactions` row, then POSTs to ATH's
// REST endpoint. The customer authorizes in their ATH app; the existing
// `athmovil-webhook` matches the pending transaction by total_cents and
// flips both the transaction and the appointment to paid.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ATH_ENDPOINT = "https://payments.athmovil.com/api/business-transaction/ecommerce/payment";
const MAX_AMOUNT_CENTS = 150_000;
const LOG = "[admin-appointment-ath-pay]";

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

  // Authenticate caller — must be owner or barber
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ success: false, error: "unauthenticated" }, 401);
  }
  const ANON = Deno.env.get("SUPABASE_ANON_KEY");
  if (!ANON) return jsonResponse({ success: false, error: "server_misconfigured" }, 500);
  const authClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userErr || !userData?.user) {
    return jsonResponse({ success: false, error: "unauthenticated" }, 401);
  }
  const authAdmin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: roleRow } = await authAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", ["owner", "barber"])
    .maybeSingle();
  if (!roleRow) {
    return jsonResponse({ success: false, error: "forbidden" }, 403);
  }

  let body: { appointmentId?: string; tipCents?: number; phone?: string };
  try { body = await req.json(); } catch { return jsonResponse({ success: false, error: "invalid_json" }, 400); }

  const appointmentId = body.appointmentId;
  const tipCents = Math.max(0, Math.round(Number(body.tipCents || 0)));
  const phoneInput = body.phone;
  if (!appointmentId) return jsonResponse({ success: false, error: "missing_appointment_id" }, 400);


  console.log(`${LOG} ▶ START appointmentId=${appointmentId} tipCents=${tipCents}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data: appt, error: fetchErr } = await supabase
    .from("appointments")
    .select("id, status, paid, price_cents, amount_paid_cents, tip_cents, barber_id, client_id, client_phone, client_name, service_name")
    .eq("id", appointmentId)
    .maybeSingle();

  if (fetchErr || !appt) return jsonResponse({ success: false, error: "appointment_not_found" }, 404);
  // Barbers may only request payment for their own appointments.
  if (roleRow.role === "barber") {
    const { data: isOwnerRow } = await authAdmin.from("user_roles").select("role")
      .eq("user_id", userData.user.id).in("role", ["owner", "super_owner"]).maybeSingle();
    if (!isOwnerRow) {
      const { data: prof } = await authAdmin.from("profiles").select("barber_id")
        .eq("id", userData.user.id).maybeSingle();
      if (!prof?.barber_id || prof.barber_id !== appt.barber_id) {
        return jsonResponse({ success: false, error: "forbidden" }, 403);
      }
    }
  }
  if (appt.status === "cancelled") return jsonResponse({ success: false, error: "appointment_cancelled" }, 409);

  const balanceCents = Math.max(0, (appt.price_cents || 0) - (appt.amount_paid_cents || 0));
  if (balanceCents <= 0) return jsonResponse({ success: false, error: "already_paid" }, 409);

  const totalCents = balanceCents + tipCents;
  if (totalCents > MAX_AMOUNT_CENTS) return jsonResponse({ success: false, error: "amount_exceeds_ath_limit" }, 400);

  // Any ATH Móvil account may pay. The phone only decides who receives the ATH
  // request; the payment stays bound to this appointment via the transaction id.
  const requested = normalizePhone10(phoneInput || "");
  const phone10 = requested.length === 10 ? requested : normalizePhone10(appt.client_phone || "");
  if (phone10.length !== 10) return jsonResponse({ success: false, error: "invalid_phone" }, 400);

  // Insert pending transaction. Webhook Step 1 will match by total_cents+pending+ath_movil.
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
      source: "pos",
      notes: `ATH Móvil — admin appointment pay${tipCents > 0 ? ` | Propina: $${(tipCents / 100).toFixed(2)}` : ""}`,
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
    return jsonResponse({ success: false, error: "ath_api_error", athErrorCode, athResponse }, 502);
  }

  await supabase.from("transactions").update({ ath_reference_number: ecommerceId }).eq("id", txn.id);

  console.log(`${LOG} ✔ DONE txn=${txn.id} ecommerceId=${ecommerceId}`);
  return jsonResponse({ success: true, transactionId: txn.id, ecommerceId }, 200);
});
