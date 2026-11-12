// athmovil-create-payment
//
// Server-side ATH Móvil REST API integration for the public booking flow (/citas).
// Replaces the SDK-based push flow which was incompatible with iOS Safari background throttling.
//
// Flow:
//   1. Frontend submits { draftId } after booking_drafts row is created (status=pending).
//   2. This function fetches the draft, validates it, and calls ATH's REST endpoint:
//        POST https://payments.athmovil.com/api/business-transaction/ecommerce/payment
//   3. ATH server-side fires a push notification to the customer's phone.
//   4. On ATH success → store ecommerceId on the draft and return it to the frontend.
//   5. Frontend navigates to /citas/confirmando which polls until webhook commits the draft.
//
// SAFETY: The draft is NEVER mutated unless ATH confirms success. No partial state.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ATH_ENDPOINT = "https://payments.athmovil.com/api/business-transaction/ecommerce/payment";
const MAX_AMOUNT_CENTS = 150_000; // $1,500 ATH per-transaction limit
const SERVICE_NAME_MAX = 40;

const LOG = "[athmovil-create-payment]";

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

interface AthItem {
  name: string;
  description: string;
  quantity: number;
  price: number;
  tax: number;
  metadata: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method_not_allowed" }, 405);
  }

  const PUBLIC_TOKEN = Deno.env.get("ATH_MOVIL_PUBLIC_TOKEN");
  const PRIVATE_TOKEN = Deno.env.get("ATH_MOVIL_PRIVATE_TOKEN");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!PUBLIC_TOKEN || !PRIVATE_TOKEN || !SUPABASE_URL || !SERVICE_KEY) {
    console.error(`${LOG} Missing required env vars`);
    return jsonResponse({ success: false, error: "server_misconfigured" }, 500);
  }

  let body: { draftId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "invalid_json" }, 400);
  }

  const draftId = body.draftId;
  if (!draftId || typeof draftId !== "string") {
    return jsonResponse({ success: false, error: "missing_draft_id" }, 400);
  }

  console.log(`${LOG} ▶ START draftId=${draftId}`);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ─── 1. Fetch draft ───
  console.log(`${LOG} Fetching draft`);
  const { data: draft, error: fetchErr } = await supabase
    .from("booking_drafts")
    .select("id, status, phone, total_cents, tip_cents, expires_at, addon_ids, appointment_type_id, service_ref_id, addon_ref_ids, first_name, last_name")
    .eq("id", draftId)
    .maybeSingle();

  if (fetchErr) {
    console.error(`${LOG} ✗ Draft fetch error:`, fetchErr);
    return jsonResponse({ success: false, error: "draft_fetch_failed" }, 500);
  }

  if (!draft) {
    console.warn(`${LOG} ✗ draft_not_found id=${draftId}`);
    return jsonResponse({ success: false, error: "draft_not_found" }, 404);
  }

  // ─── 2. Validate draft state ───
  if (draft.status !== "pending") {
    console.warn(`${LOG} ✗ draft_not_pending status=${draft.status}`);
    return jsonResponse(
      { success: false, error: "draft_not_pending", currentStatus: draft.status },
      409,
    );
  }

  if (draft.expires_at && new Date(draft.expires_at).getTime() < Date.now()) {
    console.warn(`${LOG} ✗ draft_expired expires_at=${draft.expires_at}`);
    return jsonResponse({ success: false, error: "draft_expired" }, 410);
  }

  if (!draft.total_cents || draft.total_cents <= 0) {
    console.warn(`${LOG} ✗ invalid total_cents=${draft.total_cents}`);
    return jsonResponse({ success: false, error: "invalid_amount" }, 400);
  }

  if (draft.total_cents > MAX_AMOUNT_CENTS) {
    console.warn(`${LOG} ✗ amount_exceeds_ath_limit total_cents=${draft.total_cents}`);
    return jsonResponse({ success: false, error: "amount_exceeds_ath_limit" }, 400);
  }

  const phone10 = normalizePhone10(draft.phone);
  if (phone10.length !== 10) {
    console.warn(`${LOG} ✗ invalid_phone digits=${phone10.length}`);
    return jsonResponse({ success: false, error: "invalid_phone" }, 400);
  }

  // ─── 3. Build items array ───
  // We need a service name. The draft stores appointment_type_id, not the name —
  // look up the service by acuity_type_id. Addons (if any) become extra line items.
  const totalDollars = centsToDollars(draft.total_cents);
  const tipDollars = centsToDollars(draft.tip_cents || 0);
  const subtotalCents = draft.total_cents - (draft.tip_cents || 0);
  const subtotalDollars = centsToDollars(subtotalCents);

  // Look up service name + price
  // Native shops store the local service uuid (service_ref_id); Acuity shops the Acuity type id.
  const { data: service } = await (draft.service_ref_id
    ? supabase.from("services").select("name, price_cents").eq("id", draft.service_ref_id)
    : supabase.from("services").select("name, price_cents").eq("acuity_type_id", draft.appointment_type_id)
  ).maybeSingle();

  const serviceName = (service?.name || "Servicio").slice(0, SERVICE_NAME_MAX);
  const servicePriceCents = service?.price_cents ?? subtotalCents;
  const servicePriceDollars = centsToDollars(servicePriceCents);

  const items: AthItem[] = [
    {
      name: serviceName,
      description: "Appointment",
      quantity: 1,
      price: servicePriceDollars,
      tax: 0,
      metadata: "service",
    },
  ];

  // Add addons as additional line items
  const nativeAddonIds: string[] = Array.isArray(draft.addon_ref_ids) ? draft.addon_ref_ids : [];
  if (nativeAddonIds.length > 0 || (Array.isArray(draft.addon_ids) && draft.addon_ids.length > 0)) {
    const { data: addons } = await (nativeAddonIds.length > 0
      ? supabase.from("service_addons").select("name, price_cents").in("id", nativeAddonIds)
      : supabase.from("service_addons").select("name, price_cents").in("acuity_addon_id", draft.addon_ids)
    );

    if (addons && addons.length > 0) {
      for (const addon of addons) {
        items.push({
          name: (addon.name || "Add-on").slice(0, SERVICE_NAME_MAX),
          description: "Add-on",
          quantity: 1,
          price: centsToDollars(addon.price_cents || 0),
          tax: 0,
          metadata: "addon",
        });
      }
    }
  }

  // Add tip as final line item if present so items sum equals subtotal+tip=total
  if (tipDollars > 0) {
    items.push({
      name: "Propina",
      description: "Tip",
      quantity: 1,
      price: tipDollars,
      tax: 0,
      metadata: "tip",
    });
  }

  // Sanity check: items sum should equal total. If service price doesn't match,
  // fall back to a single line item for the full subtotal so ATH doesn't reject.
  const itemsSum = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const expectedSum = totalDollars;
  if (Math.abs(itemsSum - expectedSum) > 0.01) {
    console.warn(
      `${LOG} ⚠ items sum (${itemsSum}) != total (${expectedSum}). Falling back to single line item.`,
    );
    items.length = 0;
    items.push({
      name: serviceName,
      description: "Appointment",
      quantity: 1,
      price: subtotalDollars,
      tax: 0,
      metadata: "service",
    });
    if (tipDollars > 0) {
      items.push({
        name: "Propina",
        description: "Tip",
        quantity: 1,
        price: tipDollars,
        tax: 0,
        metadata: "tip",
      });
    }
  }

  // ─── 4. Build ATH request ───
  const athPayload = {
    env: "production",
    publicToken: PUBLIC_TOKEN,
    privateToken: PRIVATE_TOKEN,
    timeout: 600,
    total: totalDollars,
    subtotal: subtotalDollars,
    tax: 0,
    metadata1: draftId,
    metadata2: "public-booking",
    phoneNumber: phone10,
    items,
  };

  // Log redacted version
  console.log(`${LOG} → ATH request:`, JSON.stringify({
    ...athPayload,
    privateToken: "***REDACTED***",
    publicToken: PUBLIC_TOKEN.slice(0, 8) + "…",
  }));

  // ─── 5. Call ATH ───
  let athResponse: Record<string, unknown>;
  let athStatus: number;
  try {
    console.log(`${LOG} Calling ATH POST ${ATH_ENDPOINT}`);
    const athRes = await fetch(ATH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(athPayload),
    });
    athStatus = athRes.status;
    const text = await athRes.text();
    try {
      athResponse = JSON.parse(text);
    } catch {
      console.error(`${LOG} ✗ ATH returned non-JSON body status=${athStatus}: ${text.slice(0, 500)}`);
      return jsonResponse(
        { success: false, error: "ath_api_error", athResponse: { rawBody: text.slice(0, 500), status: athStatus } },
        502,
      );
    }
  } catch (e) {
    console.error(`${LOG} ✗ ATH network error:`, e);
    return jsonResponse(
      { success: false, error: "ath_network_error", message: (e as Error).message },
      502,
    );
  }

  console.log(`${LOG} ← ATH response status=${athStatus} statusField=${String((athResponse as any)?.status ?? '')}`);

  // ─── 6. Validate ATH response ───
  // ATH success shape: { status: "success", data: { ecommerceId, auth_token, ... } }
  const athStatusField = (athResponse?.status as string | undefined)?.toLowerCase();
  const athData = athResponse?.data as { ecommerceId?: string; auth_token?: string } | undefined;
  const ecommerceId = athData?.ecommerceId;
  const authToken = athData?.auth_token;

  if (athStatus < 200 || athStatus >= 300 || athStatusField !== "success" || !ecommerceId) {
    console.error(`${LOG} ✗ ATH non-success status=${athStatus} statusField=${athStatusField} ecommerceId=${ecommerceId}`);
    // Surface ATH's specific errorcode so the frontend can show a precise message.
    const athErrorCode = (athResponse?.errorcode as string | undefined) || undefined;
    return jsonResponse(
      { success: false, error: "ath_api_error", athErrorCode, athResponse },
      502,
    );
  }

  if (!authToken) {
    console.warn(`${LOG} ⚠ ATH returned ecommerceId but no auth_token — /authorization recovery will be impossible for this draft`);
  }

  // ─── 7. Persist ecommerceId + auth_token — only after ATH confirmed success ───
  // auth_token is the JWT bearer required by ATH's /authorization endpoint.
  // It stays server-side only; it is never returned in the response to the frontend.
  //
  // Also re-anchor the slot lock to ATH's actual timeout window: ATH's `timeout`
  // is 10 minutes from THIS moment, but the draft's expires_at was set at draft
  // creation (default now()+20m) and the customer may have spent several minutes
  // on the payment step before tapping Pay. Without re-anchoring, the draft can
  // either expire while ATH is still waiting, or stay locked long after ATH gave
  // up. Extend to ATH timeout + 2 min webhook/poller buffer = 12 min.
  const newExpiresAt = new Date(Date.now() + 12 * 60 * 1000).toISOString();
  console.log(`${LOG} Storing ecommerceId=${ecommerceId} authToken=${authToken ? "present" : "MISSING"} expires_at=${newExpiresAt}`);
  const { error: updateErr } = await supabase
    .from("booking_drafts")
    .update({
      ath_ecommerce_id: ecommerceId,
      ath_auth_token: authToken ?? null,
      expires_at: newExpiresAt,
    })
    .eq("id", draftId)
    .eq("status", "pending"); // guard against race with webhook

  if (updateErr) {
    // ATH already accepted the payment, but we couldn't persist. Webhook can still
    // recover via metadata1=draftId. Log loudly and still return success to client.
    console.error(`${LOG} ⚠ Failed to persist ecommerceId/auth_token, webhook will use metadata1 fallback:`, updateErr);
  }

  console.log(`${LOG} ✔ DONE draftId=${draftId} ecommerceId=${ecommerceId}`);
  return jsonResponse({ success: true, ecommerceId }, 200);
});
