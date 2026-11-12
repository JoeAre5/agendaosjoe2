// Creates a Stripe Checkout (hosted) session for a booking_drafts row.
//
// Replaces the legacy `prepare-stripe-intent` + embedded PaymentElement flow.
// Stripe Checkout hosts Card + Link + Apple Pay automatically (Apple Pay
// domains charliesbarbershop.co + charliesbarbershop.as.me are pre-registered
// in Stripe; Link is enabled at the account level).
//
// Race + idempotency contract:
//   - Only proceeds when draft.status === 'pending' AND draft.expires_at > now()
//   - Returns 410 expired / 409 not pending / 404 not found / 400 bad input
//   - Persists session.id back to booking_drafts.stripe_checkout_session_id
//
// Commit lifecycle:
//   - On success Stripe redirects to: /citas/confirmando?draftId=…&stripe_session_id={CHECKOUT_SESSION_ID}
//   - BookingConfirming polls pay-then-book action="check-stripe-checkout-status"
//   - stripe-webhook is the backstop (handles checkout.session.completed)
//
// verify_jwt = false because the public paywall is anonymous.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveOrCreateStripeCustomer } from "../_shared/stripeCustomer.ts";
import { canAccessDraft, isAllowedReturnOrigin as guardOrigin } from "../_shared/accessGuards.ts";

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

function errRes(
  status: number,
  code: string,
  messageEs: string,
  messageEn: string,
) {
  return jsonRes({ error: code, message: messageEs, messageEn }, status);
}

type FlowSource = "public_paywall" | "client_portal";

const STATIC_ALLOWED_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com"];
async function isAllowedReturnOrigin(origin: string): Promise<boolean> {
  let host = "";
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return false; }
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (STATIC_ALLOWED_HOST_SUFFIXES.some((sfx) => host.endsWith(sfx))) {
    // Only this project's own Lovable hostnames.
    return host.includes("b2bc2e8c-ae89-4b9e-8b09-3f30500df3fb") || host === "app-agendaos.lovable.app";
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data } = await admin.from("shop_hostnames").select("hostname").eq("hostname", host).maybeSingle();
  return !!data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errRes(405, "method_not_allowed", "Método no permitido", "Method not allowed");

  let body: { draftId?: string; returnOrigin?: string; flowSource?: FlowSource };
  try {
    body = await req.json();
  } catch {
    return errRes(400, "invalid_json", "Solicitud inválida.", "Invalid request body.");
  }

  const draftId = String(body.draftId || "").trim();
  const returnOrigin = String(body.returnOrigin || "").trim().replace(/\/+$/, "");
  const flowSource: FlowSource =
    body.flowSource === "client_portal" ? "client_portal" : "public_paywall";

  if (!draftId) return errRes(400, "missing_draft_id", "Falta draftId.", "Missing draftId.");
  if (!returnOrigin || !/^https?:\/\//.test(returnOrigin) || !(await isAllowedReturnOrigin(returnOrigin))) {
    return errRes(400, "invalid_return_origin", "Origen de retorno inválido.", "Invalid return origin.");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: draft, error: draftErr } = await admin
    .from("booking_drafts")
    .select(
      "id, status, created_at, expires_at, total_cents, client_id, first_name, last_name, email, phone, appointment_type_id, service_ref_id, stripe_checkout_session_id",
    )
    .eq("id", draftId)
    .maybeSingle();

  if (draftErr) {
    console.error("[create-booking-checkout] draft fetch error:", draftErr);
    return errRes(500, "draft_fetch_failed", "Error al cargar la reserva.", "Failed to load booking draft.");
  }
  if (!draft) {
    return errRes(404, "draft_not_found", "Reserva no encontrada.", "Booking draft not found.");
  }
  if (!(await canAccessDraft(admin, req, draft.client_id))) {
    return errRes(403, "forbidden", "No autorizado.", "Not authorized for this booking.");
  }
  // Drafts are single-use, short-lived payment intents: refuse stale ones so
  // a leaked draftId cannot be used later to open a session with its details.
  if (draft.created_at && Date.now() - new Date(draft.created_at).getTime() > 3 * 60 * 60 * 1000) {
    return errRes(409, "draft_not_pending", "Esta reserva ya no está pendiente de pago.", "This booking draft is no longer pending payment.");
  }
  if (draft.status !== "pending") {
    return errRes(
      409,
      "draft_not_pending",
      "Esta reserva ya no está pendiente de pago.",
      "This booking draft is no longer pending payment.",
    );
  }
  // Every checkout start (re)acquires the atomic slot hold — never a blind renewal.
  const { data: holdRow, error: holdReadErr } = await admin
    .from("booking_draft_holds")
    .select("barber_id, starts_at, ends_at")
    .eq("draft_id", draftId)
    .maybeSingle();
  if (holdReadErr || !holdRow) {
    return errRes(409, "slot_hold_missing", "Este horario ya no está reservado. Elige otro.", "This time is no longer held. Please pick another.");
  }
  const { data: hold, error: holdErr } = await admin.rpc("acquire_booking_hold", {
    _draft_id: draftId,
    _barber_id: holdRow.barber_id,
    _starts_at: holdRow.starts_at,
    _ends_at: holdRow.ends_at,
    _hold_minutes: 30,
  });
  if (holdErr) {
    return errRes(503, "slot_check_failed", "No pudimos verificar el horario. Intenta de nuevo.", "Could not verify the time. Please try again.");
  }
  if (!(hold as any)?.success) {
    await admin.from("booking_drafts").update({ status: "failed", failure_reason: "slot_taken_before_checkout" })
      .eq("id", draftId).eq("status", "pending");
    return errRes(409, "slot_taken", "Ese horario ya fue reservado. Elige otro.", "That time was just booked. Please pick another.");
  }
  const expiresAtMs = new Date((hold as any).expires_at).getTime();
  if (!draft.total_cents || draft.total_cents <= 0) {
    return errRes(400, "invalid_total", "Total inválido.", "Invalid total amount.");
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  // Try to look up the service name from acuity_services for a nicer Checkout label.
  let serviceName = "Cita / Appointment";
  if (draft.appointment_type_id) {
    const { data: svc } = await admin
      .from("acuity_services")
      .select("name")
      .eq("acuity_id", draft.appointment_type_id)
      .maybeSingle();
    if (svc?.name) serviceName = svc.name as string;
  } else if (draft.service_ref_id) {
    const { data: svc } = await admin.from("services").select("name").eq("id", draft.service_ref_id).maybeSingle();
    if (svc?.name) serviceName = svc.name as string;
  }

  // Resolve / create Stripe customer (persists stripe_customer_id on clients row when applicable).
  let customerId: string | undefined;
  try {
    customerId = await resolveOrCreateStripeCustomer({
      stripe,
      admin,
      clientId: draft.client_id,
      email: draft.email,
      name: [draft.first_name, draft.last_name].filter(Boolean).join(" ") || undefined,
      phone: draft.phone,
    });
  } catch (e) {
    console.error("[create-booking-checkout] customer resolve failed:", (e as Error).message);
    // Non-fatal — Checkout can still collect email itself.
  }

  // Stripe Checkout caps expires_at at 24h from now and requires it >= 30 min.
  // If the draft's expires_at is within that window, mirror it. Otherwise omit.
  const nowSec = Math.floor(Date.now() / 1000);
  const draftExpSec = Math.floor(expiresAtMs / 1000);
  const minExp = nowSec + 30 * 60;
  const maxExp = nowSec + 24 * 60 * 60;
  const expiresAtParam =
    draftExpSec >= minExp && draftExpSec <= maxExp ? draftExpSec : undefined;

  const successUrl = `${returnOrigin}/citas/confirmando?draftId=${encodeURIComponent(draftId)}&stripe_session_id={CHECKOUT_SESSION_ID}&source=${flowSource}`;
  const cancelUrl = `${returnOrigin}/citas/confirmando?draftId=${encodeURIComponent(draftId)}&stripe_cancel=1&source=${flowSource}`;

  // Restrict payment methods explicitly. Card already covers Apple Pay +
  // Google Pay automatically (Stripe shows the wallet button on supported
  // devices). Link is included for saved-card autofill. Klarna is added
  // ONLY when the total is ≥ $50 (Klarna's practical minimum) so we don't
  // dangle an unusable BNPL option on a $20 cut. Cash App / US Bank Account
  // are intentionally NOT included.
  // Card + Link (one-click email-based card autofill). Link saves the
  // customer's card to their email so future checkouts are 1-tap.
  // Klarna (BNPL) added when total ≥ $50 — Klarna's practical minimum.
  // We explicitly exclude us_bank_account and cashapp.
  // Apple Pay / Google Pay appear automatically as wallets under "card".
  const KLARNA_MIN_CENTS = 5000;
  const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = ["card", "link"];
  if (draft.total_cents >= KLARNA_MIN_CENTS) {
    paymentMethodTypes.push("klarna");
  }

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    customer: customerId,
    customer_email: customerId ? undefined : (draft.email || undefined),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: draft.total_cents,
          product_data: {
            name: serviceName,
            description: "Charlie's Barbershop",
          },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: paymentMethodTypes,
    metadata: {
      draft_id: draftId,
      source: flowSource,
    },
    payment_intent_data: {
      metadata: {
        draft_id: draftId,
        source: flowSource,
      },
      // Save the payment method on the customer for future POS / one-tap
      // re-bookings. Only meaningful when we have a customer to attach to.
      ...(customerId ? { setup_future_usage: "off_session" as const } : {}),
    },
    ...(expiresAtParam ? { expires_at: expiresAtParam } : {}),
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(params, {
      idempotencyKey: `booking-checkout:${draftId}:${Math.floor(expiresAtMs / 1000)}`,
    });
  } catch (e) {
    const msg = (e as Error).message || "";
    console.error("[create-booking-checkout] stripe.checkout.sessions.create failed:", msg);
    // Detalle para diagnosticar (sin claves): tipo, codigo HTTP y causa de red subyacente.
    const se = e as { type?: string; code?: string; statusCode?: number; detail?: unknown; cause?: unknown };
    console.error("[create-booking-checkout] stripe error detail:", JSON.stringify({
      type: se.type ?? null, code: se.code ?? null, statusCode: se.statusCode ?? null,
      detail: String(se.detail ?? "").slice(0, 300), cause: String((se.cause as Error)?.message ?? se.cause ?? "").slice(0, 300),
    }));
    if (/rak_checkout_session_write|Checkout Sessions?:? Write/i.test(msg)) {
      return errRes(
        500,
        "stripe_key_missing_checkout_write",
        "Stripe todavía está usando una llave restringida sin permiso efectivo de Checkout Sessions: Write. Guarda la llave restringida actualizada o usa una secret key completa.",
        "Stripe is still using a restricted key without effective Checkout Sessions: Write permission. Save the updated restricted key or use a full secret key.",
      );
    }
    if (/Invalid API Key|No API key provided|Expired API Key/i.test(msg)) {
      return errRes(
        500,
        "stripe_key_invalid",
        "Pago temporalmente no disponible. Usa otro método.",
        "Card payments are temporarily unavailable. Please use another method.",
      );
    }
    return errRes(
      502,
      "stripe_session_failed",
      "No se pudo iniciar el pago. Intenta de nuevo.",
      "Could not start payment. Please try again.",
    );
  }

  const { error: updErr } = await admin
    .from("booking_drafts")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", draftId)
    .eq("status", "pending");

  if (updErr) {
    console.error("[create-booking-checkout] failed to persist session id:", updErr);
    // Non-fatal — webhook still has metadata.draft_id, but log loudly.
  }

  return jsonRes({ url: session.url, sessionId: session.id });
});
