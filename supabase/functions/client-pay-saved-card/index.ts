// 1-tap pay con tarjeta guardada para cliente autenticado.
// Cobra off_session sobre una cita existente (sin commitDraft — la cita ya existe).
// Auth: requiere JWT de cliente; verifica ownership via clients.auth_user_id.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return jsonRes({ error: "unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return jsonRes({ error: "unauthorized" }, 401);

    // Server-side role check
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "client")
      .maybeSingle();
    if (!roleRow) return jsonRes({ error: "forbidden_not_client" }, 403);

    const { data: client } = await admin
      .from("clients")
      .select("id, stripe_customer_id, first_name, last_name, email, phone")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!client) return jsonRes({ error: "client_not_found" }, 404);

    const body = await req.json();
    const appointmentId = String(body.appointment_id || "");
    const tipCents = Math.max(0, Math.round(Number(body.tip_cents) || 0));
    if (!appointmentId) return jsonRes({ error: "missing_appointment_id" }, 400);

    // Verify ownership + load appt
    const { data: appt } = await admin
      .from("appointments")
      .select("id, barber_id, client_id, service_name, price_cents, status, payment_confirmed, amount_paid_cents")
      .eq("id", appointmentId)
      .maybeSingle();
    if (!appt) return jsonRes({ error: "appointment_not_found" }, 404);
    if (appt.client_id !== client.id) return jsonRes({ error: "forbidden_not_owner" }, 403);
    if (appt.status === "cancelled") return jsonRes({ error: "appointment_cancelled" }, 409);
    if (appt.payment_confirmed) return jsonRes({ error: "already_paid" }, 409);

    const baseCents = Number(appt.price_cents) || 0;
    if (baseCents <= 0) return jsonRes({ error: "invalid_price" }, 400);
    const totalCents = baseCents + tipCents;

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Resolve / create stripe customer
    let customerId = client.stripe_customer_id;
    if (!customerId) {
      const c = await stripe.customers.create({
        name: [client.first_name, client.last_name].filter(Boolean).join(" ") || undefined,
        email: client.email || undefined,
        phone: client.phone || undefined,
        metadata: { local_client_id: client.id, source: "client_one_tap" },
      });
      customerId = c.id;
      await admin.from("clients").update({ stripe_customer_id: customerId }).eq("id", client.id);
    }

    // Pick newest reusable card
    const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 10 });
    const reusable = pms.data.filter((pm) => !pm.card?.wallet);
    if (reusable.length === 0) return jsonRes({ error: "no_saved_card" }, 400);
    reusable.sort((a, b) => (b.created || 0) - (a.created || 0));
    const pm = reusable[0];

    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: "usd",
        customer: customerId,
        payment_method: pm.id,
        off_session: true,
        confirm: true,
        payment_method_types: ["card"],
        metadata: {
          appointment_id: appointmentId,
          client_id: client.id,
          tip_cents: String(tipCents),
          source: "client_one_tap_authed",
        },
      });
    } catch (e) {
      const err = e as Stripe.errors.StripeError & { payment_intent?: Stripe.PaymentIntent };
      if (err.code === "authentication_required" && err.payment_intent) {
        return jsonRes({
          error: "authentication_required",
          client_secret: err.payment_intent.client_secret,
          payment_intent_id: err.payment_intent.id,
        }, 402);
      }
      return jsonRes({ error: "stripe_declined", code: err.code, message: err.message }, 402);
    }

    if (intent.status !== "succeeded") {
      return jsonRes({ error: "intent_not_succeeded", status: intent.status }, 402);
    }

    // Mark appt + insert tx
    await admin.from("appointments").update({
      paid: true,
      payment_confirmed: true,
      payment_method: "stripe",
      amount_paid_cents: totalCents,
      tip_cents: tipCents,
    }).eq("id", appointmentId);

    await admin.from("transactions").insert({
      barber_id: appt.barber_id,
      client_id: client.id,
      appointment_id: appointmentId,
      type: "service",
      payment_method: "stripe",
      subtotal_cents: baseCents,
      tip_cents: tipCents,
      total_cents: totalCents,
      status: "completed",
      stripe_payment_id: intent.id,
      notes: "Filho 1-tap pay (authed client)",
    });

    if (pm.card) {
      await admin.from("clients").update({
        card_brand: pm.card.brand,
        card_last4: pm.card.last4,
        preferred_payment_method: "stripe",
      }).eq("id", client.id);
    }

    return jsonRes({
      success: true,
      payment_intent_id: intent.id,
      amount_paid_cents: totalCents,
      card: { brand: pm.card?.brand || "card", last4: pm.card?.last4 || "****" },
    });
  } catch (e) {
    console.error("[client-pay-saved-card]", e);
    return jsonRes({ error: (e as Error).message }, 500);
  }
});
