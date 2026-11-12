// appointment-pay-info
//
// Public read for the QR / pay-link page (/pay/:id). Appointments are not
// readable by anonymous visitors (RLS), so this function returns only the
// minimal fields needed to display and pay the appointment. Access requires a
// signed pay-link code (see _shared/payLink.ts); no personal phone or email is returned.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verifyPayLink } from "../_shared/payLink.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "server_misconfigured" }, 500);

  let body: { payCode?: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }

  // Only a signed pay-link code works here; a bare appointment id is rejected.
  const claims = await verifyPayLink(body.payCode);
  if (!claims) return jsonResponse({ error: "invalid_link" }, 404);
  const id = claims.a;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("appointments")
    .select("id, service_name, starts_at, duration_minutes, price_cents, amount_paid_cents, payment_confirmed, status, client_name, barber_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    console.error("[appointment-pay-info] lookup failed", error?.message);
    return jsonResponse({ error: "not_found" }, 404);
  }

  let barberName: string | null = null;
  if (data.barber_id) {
    const { data: b } = await supabase
      .from("barbers_public")
      .select("name")
      .eq("id", data.barber_id)
      .maybeSingle();
    barberName = b?.name ?? null;
  }


  const balanceCents = Math.max(0, (data.price_cents || 0) - (data.amount_paid_cents || 0));
  const fullyPaid = !!data.payment_confirmed && balanceCents === 0;
  if (!fullyPaid && balanceCents !== claims.b) return jsonResponse({ error: "link_outdated" }, 409);
  return jsonResponse({
    id: data.id,
    service_name: data.service_name,
    starts_at: data.starts_at,
    duration_minutes: data.duration_minutes,
    price_cents: data.price_cents,
    amount_paid_cents: data.amount_paid_cents || 0,
    balance_cents: balanceCents,
    fully_paid: fullyPaid,
    status: data.status,
    // First name only — enough to greet, nothing sensitive.
    first_name: (data.client_name || "").split(" ")[0] || "",
    barber_name: barberName,
  }, 200);
});
