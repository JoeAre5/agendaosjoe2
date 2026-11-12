// Staff one-tap charge of a client's saved Stripe card for an existing appointment.
// Server recalculates the balance; the app only sends appointment, tip and an idempotency key.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { appointmentStripeAmount } from "../_shared/appointmentStripeAmount.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const h = req.headers.get("Authorization") || "";
    if (!h.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await admin.auth.getUser(h.slice(7));
    const uid = u?.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const appointmentId = String(body.appointment_id || "");
    const tipCents = Number(body.tip_cents ?? 0);
    const idem = String(body.idempotency_key || "");
    if (!/^[0-9a-f-]{36}$/i.test(appointmentId) || !/^[0-9a-f-]{36}$/i.test(idem)) return json({ error: "invalid_input" }, 400);

    const { data: appt } = await admin.from("appointments")
      .select("id, shop_id, client_id, status, price_cents, amount_paid_cents, benefit_discount_cents")
      .eq("id", appointmentId).maybeSingle();
    if (!appt) return json({ error: "appointment_not_found" }, 404);

    // Only owner/barber members of the appointment's own shop.
    const { data: member } = await admin.from("shop_memberships").select("role")
      .eq("user_id", uid).eq("shop_id", appt.shop_id).in("role", ["owner", "barber"]).limit(1).maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);

    const balance = Math.max(0, Number(appt.price_cents || 0) - Number(appt.amount_paid_cents || 0));
    const check = appointmentStripeAmount(appt, balance + tipCents, tipCents);
    if ("error" in check) return json({ error: check.error }, 409);
    const total = check.expectedCents!;

    if (!appt.client_id) return json({ error: "no_saved_card" }, 400);
    const { data: client } = await admin.from("clients").select("stripe_customer_id").eq("id", appt.client_id).maybeSingle();
    if (!client?.stripe_customer_id) return json({ error: "no_saved_card" }, 400);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const pms = await stripe.paymentMethods.list({ customer: client.stripe_customer_id, type: "card", limit: 10 });
    const pm = pms.data.filter((p) => !p.card?.wallet).sort((a, b) => b.created - a.created)[0];
    if (!pm) return json({ error: "no_saved_card" }, 400);

    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: total, currency: "usd", customer: client.stripe_customer_id, payment_method: pm.id,
        off_session: true, confirm: true, payment_method_types: ["card"],
        metadata: { appointment_id: appointmentId, tip_cents: String(tipCents), staff_user_id: uid, source: "staff_one_tap" },
      }, { idempotencyKey: `staff-charge-${idem}` });
    } catch (e) {
      const err = e as Stripe.errors.StripeError;
      if (err.code === "authentication_required") return json({ error: "authentication_required" }, 402);
      return json({ error: "declined", message: err.message }, 402);
    }
    if (intent.status !== "succeeded") return json({ error: "authentication_required", status: intent.status }, 402);

    const { error: commitError } = await admin.rpc("record_stripe_appointment_payment", {
      p_appointment_id: appointmentId, p_payment_intent_id: intent.id,
      p_amount_cents: total, p_tip_cents: tipCents, p_method_type: "card",
    });
    if (commitError) {
      console.error("[staff-charge-saved-card] commit failed", intent.id, commitError.message);
      return json({ error: "payment_commit_failed", payment_intent_id: intent.id }, 500);
    }
    await admin.from("audit_log").insert({
      user_id: uid, action: "staff_charge_saved_card", entity_type: "appointment", entity_id: appointmentId,
      metadata: { payment_intent_id: intent.id, amount_cents: total, tip_cents: tipCents, role: member.role, last4: pm.card?.last4 },
    });
    return json({ success: true, amount_cents: total, brand: pm.card?.brand, last4: pm.card?.last4 });
  } catch (e) {
    console.error("[staff-charge-saved-card]", e);
    return json({ error: "internal_error" }, 500);
  }
});
