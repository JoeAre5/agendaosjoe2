// Creates a Stripe hosted Checkout session for an EXISTING appointment.
//
// Mirrors create-booking-checkout (which targets booking_drafts) but operates
// on a confirmed appointment. Used by both:
//   - Public /pay/:id (existing-appointment paywall)
//   - Admin /admin/appointment/:id/pay
//
// Hosted Checkout gives Card + Apple Pay + Link + Klarna automatically — same
// surface as the new-booking flow. After success, stripe-webhook handles the
// commit via the appointment_id metadata branch (see stripe-webhook/index.ts).
//
// verify_jwt = false because the public paywall is anonymous.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveOrCreateStripeCustomer } from "../_shared/stripeCustomer.ts";
import { canAccessDraft, isAllowedReturnOrigin } from "../_shared/accessGuards.ts";
import { canPayAppointment } from "../_shared/payLink.ts";
import { appointmentStripeAmount } from "../_shared/appointmentStripeAmount.ts";

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

type FlowSource = "public_pay" | "admin_pay" | "client_portal";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "method_not_allowed" }, 405);

  let body: {
    appointment_id?: string;
    amount_cents?: number;
    tip_cents?: number;
    returnOrigin?: string;
    flowSource?: FlowSource;
    pay_code?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonRes({ error: "invalid_json" }, 400);
  }

  const appointmentId = String(body.appointment_id || "").trim();
  const amountCents = Number(body.amount_cents || 0);
  const tipCents = Number(body.tip_cents || 0);
  const returnOrigin = String(body.returnOrigin || "").trim().replace(/\/+$/, "");
  const flowSource: FlowSource =
    body.flowSource === "admin_pay" || body.flowSource === "client_portal"
      ? body.flowSource
      : "public_pay";

  if (!appointmentId) return jsonRes({ error: "missing_appointment_id" }, 400);
  if (!amountCents || amountCents <= 0) return jsonRes({ error: "invalid_amount" }, 400);
  if (!returnOrigin || !/^https?:\/\//.test(returnOrigin)) {
    return jsonRes({ error: "invalid_return_origin" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data: appt, error: apptErr } = await admin
    .from("appointments")
    .select(
      "id, status, payment_confirmed, service_name, client_id, client_name, client_email, client_phone, barber_id, price_cents, amount_paid_cents, benefit_discount_cents",
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (apptErr || !appt) return jsonRes({ error: "appointment_not_found" }, 404);
  if (!(await isAllowedReturnOrigin(admin, returnOrigin))) {
    return jsonRes({ error: "invalid_return_origin" }, 400);
  }
  // Customer identity (email, saved-card customer) is only used when the caller
  // is the appointment's own signed-in client or shop staff. Anonymous pay-link
  // visitors get a plain checkout with no customer details attached.
  const hasAuth = (req.headers.get("Authorization") || "").startsWith("Bearer ");
  const trustedCaller = hasAuth && appt.client_id
    ? await canAccessDraft(admin, req, appt.client_id, true)
    : false;
  const validation = appointmentStripeAmount(appt, amountCents, tipCents);
  const { balanceCents } = validation;
  if (!(await canPayAppointment(admin, req, appt, balanceCents, body.pay_code))) {
    return jsonRes({ error: "forbidden" }, 403);
  }
  if (validation.error) {
    return jsonRes({ error: validation.error, expected_cents: balanceCents + tipCents }, validation.error === "invalid_tip" ? 400 : 409);
  }
  const expectedCents = validation.expectedCents;

  let clientEmail: string | null = appt.client_email || null;
  let clientPhone: string | null = appt.client_phone || null;
  if (!trustedCaller) { clientEmail = null; clientPhone = null; }
  if (trustedCaller && appt.client_id) {
    const { data: c } = await admin
      .from("clients")
      .select("email, phone")
      .eq("id", appt.client_id)
      .maybeSingle();
    if (c) {
      clientEmail = clientEmail || c.email;
      clientPhone = clientPhone || c.phone;
    }
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  let customerId: string | undefined;
  if (trustedCaller) try {
    customerId = await resolveOrCreateStripeCustomer({
      stripe,
      admin,
      clientId: appt.client_id,
      email: clientEmail,
      name: appt.client_name,
      phone: clientPhone,
    });
  } catch (e) {
    console.error("[appointment-stripe-checkout] customer resolve failed:", (e as Error).message);
  }

  const successPath =
    flowSource === "admin_pay"
      ? `/admin/appointment/${appointmentId}/pay?stripe_session_id={CHECKOUT_SESSION_ID}`
      : `/pay/${encodeURIComponent(String(body.pay_code || ""))}?stripe_session_id={CHECKOUT_SESSION_ID}`;
  const cancelPath =
    flowSource === "admin_pay"
      ? `/admin/appointment/${appointmentId}/pay?stripe_cancel=1`
      : `/pay/${encodeURIComponent(String(body.pay_code || ""))}?stripe_cancel=1`;

  const KLARNA_MIN_CENTS = 5000;
  const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = ["card", "link"];
  if (expectedCents >= KLARNA_MIN_CENTS) paymentMethodTypes.push("klarna");

  // Pre-insert pending transaction row keyed by paymentIntent so the webhook
  // can find/update it deterministically. We do not have the PI id yet, so
  // we tag with a unique pending key and fill in PI on webhook.
  // Actually — simplest: webhook does the upsert based on appointment_id+session.id.

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    customer: customerId,
    customer_email: customerId ? undefined : (clientEmail || undefined),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: expectedCents,
          product_data: {
            name: appt.service_name || "Appointment",
            description: "Charlie's Barbershop",
          },
        },
      },
    ],
    success_url: `${returnOrigin}${successPath}`,
    cancel_url: `${returnOrigin}${cancelPath}`,
    payment_method_types: paymentMethodTypes,
    metadata: {
      appointment_id: appointmentId,
      tip_cents: String(tipCents),
      source: flowSource,
    },
    payment_intent_data: {
      metadata: {
        appointment_id: appointmentId,
        tip_cents: String(tipCents),
        source: flowSource,
      },
      ...(customerId ? { setup_future_usage: "off_session" as const } : {}),
    },
  };

  let session: Stripe.Checkout.Session;
  try {
    // Repeated taps for the same balance/tip reuse the same Checkout session.
    const fingerprint = JSON.stringify([appointmentId, appt.price_cents, appt.amount_paid_cents,
      expectedCents, tipCents, customerId || "guest", flowSource, returnOrigin, body.pay_code || ""]);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprint));
    const idempotencyKey = `appt-${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
    session = await stripe.checkout.sessions.create(params, {
      idempotencyKey,
    });
  } catch (e) {
    console.error("[appointment-stripe-checkout] stripe error:", (e as Error).message);
    return jsonRes({ error: "stripe_session_failed", details: (e as Error).message }, 502);
  }

  return jsonRes({ url: session.url, sessionId: session.id });
});
