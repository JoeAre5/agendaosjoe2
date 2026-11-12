// Client-side public booking payment handler.
// No auth required — guests pay before account exists.
// Actions:
//  - stripe-intent: create PaymentIntent (with optional saved card one-tap)
//  - paypal-create: create PayPal order
//  - paypal-capture: capture PayPal order + mark txn completed
//  - confirm-paid: finalize after Stripe success — marks appt + txn completed
//  - athmovil-prepare: create a pending ATH transaction so the webhook can match it
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { dispatchPush, formatAppointmentVars } from "../_shared/dispatchPush.ts";
import { canAccessDraft, isAllowedReturnOrigin as guardOrigin } from "../_shared/accessGuards.ts";
import { canPayAppointment } from "../_shared/payLink.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const action = String(body.action || "");

    /* ─── Validate appointment + load context ─── */
    const loadAppt = async (appointmentId: string) => {
      const { data: appt, error } = await admin
        .from("appointments")
        .select("id, barber_id, client_id, service_name, price_cents, amount_paid_cents, starts_at, status, payment_confirmed")
        .eq("id", appointmentId)
        .maybeSingle();
      if (error || !appt) throw new Error("Appointment not found");
      if (appt.status === "cancelled") throw new Error("Appointment already cancelled");
      // Only the appointment's own client, staff, or a valid pay-link code holder.
      const bal = Math.max(0, (appt.price_cents || 0) - (appt.amount_paid_cents || 0));
      if (!(await canPayAppointment(admin, req, appt, bal, body.pay_code))) throw new Error("Not allowed");
      return appt;
    };

    /* ─── Server-side amount validation: prevent client-side tampering ─── */
    // The client-supplied amount_cents MUST equal the appointment's real price
    // (from DB) plus the (non-negative) tip. Any mismatch is rejected.
    const validateAmount = (
      apptPriceCents: number | null | undefined,
      amountCents: unknown,
      tipCents: unknown,
    ): { ok: true; expected: number; tip: number } | { ok: false; expected: number; tip: number } => {
      const tip = Math.max(0, Math.round(Number(tipCents) || 0));
      const expected = Math.max(0, Math.round(Number(apptPriceCents) || 0)) + tip;
      const amount = Math.round(Number(amountCents) || 0);
      if (!Number.isFinite(amount) || amount !== expected) {
        return { ok: false, expected, tip };
      }
      return { ok: true, expected, tip };
    };

    /* ─── Fire-and-forget push: appointment_confirmed + payment_received ─── */
    // Called after a successful payment lock-in. Failures are swallowed —
    // payment success must NEVER be blocked by notification delivery.
    // Uses the shared dispatchPush helper which calls send-push via raw fetch
    // (admin.functions.invoke from a service-role client fails silently).
    const dispatchConfirmedPush = async (
      appointmentId: string,
      amountPaidCents?: number,
    ) => {
      try {
        const { data: appt } = await admin
          .from("appointments")
          .select("client_id, service_name, starts_at, barber_id, barbers:barber_id(name)")
          .eq("id", appointmentId)
          .maybeSingle();
        if (!appt?.client_id) return;
        const { date, time } = formatAppointmentVars(appt.starts_at);
        const baseVars = {
          service: appt.service_name || "Servicio",
          barber: (appt.barbers as any)?.name || "tu barbero",
          date,
          time,
        };

        // 1) appointment_confirmed
        await dispatchPush({
          client_id: appt.client_id,
          template_name: "appointment_confirmed",
          dispatch_key: `appt:${appointmentId}:confirmed`,
          appointment_id: appointmentId,
          starts_at: appt.starts_at,
          vars: baseVars,
        }).catch((e) =>
          console.warn("[client-booking-pay] appointment_confirmed dispatch failed:", e)
        );

        // 2) payment_received (separate notification — same trigger point)
        if (amountPaidCents && amountPaidCents > 0) {
          const amount = `$${(amountPaidCents / 100).toFixed(2)}`;
          await dispatchPush({
            client_id: appt.client_id,
            template_name: "payment_received",
            dispatch_key: `appt:${appointmentId}:payment`,
            appointment_id: appointmentId,
            starts_at: appt.starts_at,
            vars: { ...baseVars, amount },
          }).catch((e) =>
            console.warn("[client-booking-pay] payment_received dispatch failed:", e)
          );
        }
      } catch (e) {
        console.warn("[client-booking-pay] dispatchConfirmedPush failed:", e);
      }
    };

    /* ───────── STRIPE INTENT ───────── */
    if (action === "stripe-intent") {
      const { appointment_id, amount_cents, tip_cents, payment_method_id } = body;
      if (!appointment_id || !amount_cents) return jsonRes({ error: "Missing fields" }, 400);

      const appt = await loadAppt(appointment_id);
      const check = validateAmount(appt.price_cents, amount_cents, tip_cents);
      if (!check.ok) {
        return jsonRes({ error: "amount_mismatch", expected_cents: check.expected }, 400);
      }
      const serverAmount = check.expected;
      const serverTip = check.tip;
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
        apiVersion: "2025-08-27.basil",
      });

      // Resolve / create Stripe customer
      let customerId: string | undefined;
      if (appt.client_id) {
        const { data: client } = await admin
          .from("clients")
          .select("id, stripe_customer_id, first_name, last_name, email, phone")
          .eq("id", appt.client_id)
          .single();

        if (client?.stripe_customer_id) {
          customerId = client.stripe_customer_id;
        } else if (client) {
          const customer = await stripe.customers.create({
            name: [client.first_name, client.last_name].filter(Boolean).join(" ") || undefined,
            email: client.email || undefined,
            phone: client.phone || undefined,
            metadata: { local_client_id: client.id, source: "client_booking" },
          });
          customerId = customer.id;
          await admin
            .from("clients")
            .update({ stripe_customer_id: customer.id })
            .eq("id", client.id);
        }
      }

      const intentParams: Record<string, unknown> = {
        amount: serverAmount,
        currency: "usd",
        metadata: {
          appointment_id,
          barber_id: appt.barber_id,
          client_id: appt.client_id || "",
          tip_cents: String(serverTip),
          source: "client_booking",
        },
      };

      if (customerId) {
        intentParams.customer = customerId;
        if (payment_method_id) {
          // One-tap with saved card
          intentParams.payment_method = payment_method_id;
          intentParams.confirm = true;
          intentParams.off_session = true;
          intentParams.payment_method_types = ["card"];
        } else {
          intentParams.automatic_payment_methods = { enabled: true, allow_redirects: "never" };
          intentParams.setup_future_usage = "off_session";
        }
      } else {
        intentParams.automatic_payment_methods = { enabled: true, allow_redirects: "never" };
      }

      const intent = await stripe.paymentIntents.create(intentParams as Stripe.PaymentIntentCreateParams);

      // Pre-create a pending transaction for tracking
      await admin.from("transactions").insert({
        barber_id: appt.barber_id,
        client_id: appt.client_id,
        appointment_id,
        type: "service",
        payment_method: "stripe",
        subtotal_cents: serverAmount - serverTip,
        tip_cents: serverTip,
        total_cents: serverAmount,
        status: intent.status === "succeeded" ? "completed" : "pending",
        stripe_payment_id: intent.id,
        notes: "Client booking deposit",
      });

      if (intent.status === "succeeded") {
        const chargedCents = (intent as any).amount_received ?? intent.amount ?? serverAmount;
        if (chargedCents < serverAmount) {
          return jsonRes({ error: "underpayment_detected", expected_cents: serverAmount, charged_cents: chargedCents }, 400);
        }
        await admin
          .from("transactions")
          .update({ total_cents: chargedCents, subtotal_cents: chargedCents - serverTip })
          .eq("stripe_payment_id", intent.id);
        await admin
          .from("appointments")
          .update({
            paid: true,
            payment_confirmed: true,
            payment_method: "stripe",
            amount_paid_cents: chargedCents,
            tip_cents: serverTip,
          })
          .eq("id", appointment_id);
        await dispatchConfirmedPush(appointment_id, chargedCents);
        return jsonRes({ status: "succeeded", payment_intent_id: intent.id });
      }

      return jsonRes({ client_secret: intent.client_secret, payment_intent_id: intent.id });
    }

    /* ───────── CONFIRM PAID (after Stripe client-side confirm) ───────── */
    if (action === "confirm-paid") {
      const { appointment_id, payment_intent_id, tip_cents } = body;
      if (!appointment_id || !payment_intent_id) return jsonRes({ error: "Missing fields" }, 400);

      const appt = await loadAppt(appointment_id);

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
        apiVersion: "2025-08-27.basil",
      });
      const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (intent.status !== "succeeded") {
        return jsonRes({ error: `Intent not succeeded: ${intent.status}` }, 400);
      }
      // Bind PI to this appointment via metadata to prevent cross-appointment replay
      const intentApptId = (intent.metadata as any)?.appointment_id;
      if (intentApptId && intentApptId !== appointment_id) {
        return jsonRes({ error: "Payment intent does not belong to this appointment" }, 403);
      }
      const chargedCents = (intent as any).amount_received ?? intent.amount ?? 0;

      // Server-side amount validation: the actual charged amount MUST cover the
      // appointment's real price (plus optional tip). Reject underpayments.
      const serverTip = Math.max(0, Math.round(Number(tip_cents) || 0));
      const expected = Math.max(0, Math.round(Number(appt.price_cents) || 0)) + serverTip;
      if (chargedCents < expected) {
        return jsonRes({ error: "underpayment_detected", expected_cents: expected, charged_cents: chargedCents }, 400);
      }

      // Capture saved-card details onto the client
      if (appt.client_id && intent.payment_method) {
        try {
          const pm = await stripe.paymentMethods.retrieve(intent.payment_method as string);
          if (pm.card) {
            await admin
              .from("clients")
              .update({ card_brand: pm.card.brand, card_last4: pm.card.last4 })
              .eq("id", appt.client_id);
          }
        } catch (e) {
          console.error("Failed to save card details:", e);
        }
      }

      await admin
        .from("transactions")
        .update({ status: "completed", total_cents: chargedCents, subtotal_cents: chargedCents - serverTip })
        .eq("stripe_payment_id", payment_intent_id);

      await admin
        .from("appointments")
        .update({
          paid: true,
          payment_confirmed: true,
          payment_method: "stripe",
          amount_paid_cents: chargedCents,
          tip_cents: serverTip,
        })
        .eq("id", appointment_id);

      await dispatchConfirmedPush(appointment_id, chargedCents);
      return jsonRes({ success: true });
    }

    /* ───────── PAYPAL CREATE ORDER ───────── */
    if (action === "paypal-create") {
      const { appointment_id, amount_cents, tip_cents } = body;
      if (!appointment_id || !amount_cents) return jsonRes({ error: "Missing fields" }, 400);

      const appt = await loadAppt(appointment_id);
      const check = validateAmount(appt.price_cents, amount_cents, tip_cents);
      if (!check.ok) {
        return jsonRes({ error: "amount_mismatch", expected_cents: check.expected }, 400);
      }
      const serverAmount = check.expected;
      const serverTip = check.tip;

      const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
      const secret = Deno.env.get("PAYPAL_SECRET") || "";
      const base = "https://api-m.paypal.com";

      const authRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (!authRes.ok) return jsonRes({ error: "PayPal auth failed" }, 502);
      const { access_token } = await authRes.json();

      const orderRes = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: { currency_code: "USD", value: (serverAmount / 100).toFixed(2) },
              description: appt.service_name,
              custom_id: appointment_id,
            },
          ],
        }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) return jsonRes({ error: "PayPal order create failed", details: order }, 502);

      await admin.from("transactions").insert({
        barber_id: appt.barber_id,
        client_id: appt.client_id,
        appointment_id,
        type: "service",
        payment_method: "paypal",
        subtotal_cents: serverAmount - serverTip,
        tip_cents: serverTip,
        total_cents: serverAmount,
        status: "pending",
        paypal_order_id: order.id,
        notes: "Client booking deposit",
      });

      return jsonRes({ orderID: order.id });
    }

    /* ───────── PAYPAL CAPTURE ORDER ───────── */
    if (action === "paypal-capture") {
      const { appointment_id, orderID, tip_cents } = body;
      if (!orderID || !appointment_id) return jsonRes({ error: "Missing fields" }, 400);

      const appt = await loadAppt(appointment_id);
      const serverTip = Math.max(0, Math.round(Number(tip_cents) || 0));
      const expected = Math.max(0, Math.round(Number(appt.price_cents) || 0)) + serverTip;

      const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
      const secret = Deno.env.get("PAYPAL_SECRET") || "";
      const base = "https://api-m.paypal.com";

      const authRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const { access_token } = await authRes.json();

      const capRes = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      });
      const capData = await capRes.json();
      if (!capRes.ok || capData.status !== "COMPLETED") {
        return jsonRes({ error: "PayPal capture failed", details: capData }, 502);
      }

      // Server-side amount validation: verify PayPal actually captured >= expected total.
      let capturedCents = 0;
      try {
        const captures = capData?.purchase_units?.[0]?.payments?.captures || [];
        const capturedDollars = captures.reduce((sum: number, c: any) => sum + Number(c?.amount?.value || 0), 0);
        capturedCents = Math.round(capturedDollars * 100);
      } catch {
        capturedCents = 0;
      }
      if (capturedCents < expected) {
        return jsonRes({ error: "underpayment_detected", expected_cents: expected, captured_cents: capturedCents }, 400);
      }

      await admin
        .from("transactions")
        .update({ status: "completed", total_cents: capturedCents, subtotal_cents: capturedCents - serverTip, tip_cents: serverTip })
        .eq("paypal_order_id", orderID);

      await admin
        .from("appointments")
        .update({
          paid: true,
          payment_confirmed: true,
          payment_method: "paypal",
          amount_paid_cents: capturedCents,
          tip_cents: serverTip,
        })
        .eq("id", appointment_id);

      await dispatchConfirmedPush(appointment_id, capturedCents);
      return jsonRes({ success: true });
    }

    /* ───────── DRAFT: lookup saved card by phone (no auth) ───────── */
    // Returns reusable PaymentMethod info for a draft, used by PaymentStep
    // to show a one-tap "Pagar con Visa •••• 1234" button above ATH.
    if (action === "draft-lookup-saved-card") {
      const { draftId } = body;
      if (!draftId) return jsonRes({ hasCard: false }, 200);

      const { data: draft } = await admin
        .from("booking_drafts")
        .select("client_id, phone, email, status")
        .eq("id", draftId)
        .maybeSingle();
      if (!draft || draft.status !== "pending") return jsonRes({ hasCard: false }, 200);

      // Resolve client by client_id, phone (last10), or email
      let client: { id: string; stripe_customer_id: string | null } | null = null;
      if (draft.client_id) {
        const { data } = await admin
          .from("clients").select("id, stripe_customer_id").eq("id", draft.client_id).maybeSingle();
        client = data || null;
      }
      if (!client && draft.phone) {
        const last10 = draft.phone.replace(/\D/g, "").slice(-10);
        if (last10.length === 10) {
          const { data } = await admin.rpc("find_client_by_phone", { _phone: last10 });
          if (data) {
            const { data: c } = await admin
              .from("clients").select("id, stripe_customer_id").eq("id", data).maybeSingle();
            client = c || null;
          }
        }
      }
      if (!client && draft.email) {
        const { data } = await admin
          .from("clients").select("id, stripe_customer_id").ilike("email", draft.email).maybeSingle();
        client = data || null;
      }
      if (!client?.stripe_customer_id) return jsonRes({ hasCard: false }, 200);

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
        apiVersion: "2025-08-27.basil",
      });
      try {
        const pms = await stripe.paymentMethods.list({
          customer: client.stripe_customer_id, type: "card", limit: 10,
        });
        const reusable = pms.data.filter((pm) => !pm.card?.wallet);
        if (reusable.length === 0) return jsonRes({ hasCard: false }, 200);
        reusable.sort((a, b) => (b.created || 0) - (a.created || 0));
        const pm = reusable[0];
        // Persist client_id back to draft so the charge action skips lookup
        await admin
          .from("booking_drafts").update({ client_id: client.id }).eq("id", draftId);
        return jsonRes({
          hasCard: true,
          brand: pm.card?.brand || "card",
          last4: pm.card?.last4 || "****",
        });
      } catch (e) {
        console.warn("[draft-lookup-saved-card] stripe lookup failed:", e);
        return jsonRes({ hasCard: false }, 200);
      }
    }

    /* ───────── DRAFT: charge saved card off_session + commit ───────── */
    if (action === "draft-charge-saved-card") {
      const { draftId, tipCents } = body;
      if (!draftId) return jsonRes({ error: "missing_draft_id" }, 400);

      const tip = Math.max(0, Math.round(Number(tipCents) || 0));

      const { data: draft, error: draftErr } = await admin
        .from("booking_drafts")
        .select("id, status, expires_at, total_cents, tip_cents, client_id")
        .eq("id", draftId)
        .maybeSingle();
      if (draftErr || !draft) return jsonRes({ error: "draft_not_found" }, 404);
      if (draft.status !== "pending") return jsonRes({ error: "draft_not_pending" }, 409);
      if (draft.expires_at && new Date(draft.expires_at).getTime() < Date.now()) {
        return jsonRes({ error: "draft_expired" }, 410);
      }
      if (!draft.client_id) return jsonRes({ error: "no_client_linked" }, 400);
      // Charging a saved card requires the signed-in owner of that client profile.
      if (!(await canAccessDraft(admin, req, draft.client_id, true))) {
        return jsonRes({ error: "forbidden" }, 403);
      }
      if (tip > Math.max(10000, (draft.total_cents || 0) - (draft.tip_cents || 0))) {
        return jsonRes({ error: "invalid_tip" }, 400);
      }

      // Lock tip onto draft so commitDraft uses correct totals
      const newTotal = (draft.total_cents - (draft.tip_cents || 0)) + tip;
      await admin
        .from("booking_drafts")
        .update({ tip_cents: tip, total_cents: newTotal })
        .eq("id", draftId);

      const { data: client } = await admin
        .from("clients")
        .select("id, stripe_customer_id")
        .eq("id", draft.client_id)
        .maybeSingle();
      if (!client?.stripe_customer_id) return jsonRes({ error: "no_stripe_customer" }, 400);

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
        apiVersion: "2025-08-27.basil",
      });
      const pms = await stripe.paymentMethods.list({
        customer: client.stripe_customer_id, type: "card", limit: 10,
      });
      const reusable = pms.data.filter((pm) => !pm.card?.wallet);
      if (reusable.length === 0) return jsonRes({ error: "no_reusable_card" }, 400);
      reusable.sort((a, b) => (b.created || 0) - (a.created || 0));
      const pm = reusable[0];

      let intent: Stripe.PaymentIntent;
      try {
        intent = await stripe.paymentIntents.create({
          amount: newTotal,
          currency: "usd",
          customer: client.stripe_customer_id,
          payment_method: pm.id,
          off_session: true,
          confirm: true,
          payment_method_types: ["card"],
          metadata: {
            draftId,
            client_id: client.id,
            tip_cents: String(tip),
            source: "client_one_tap",
          },
        });
      } catch (e) {
        const err = e as Stripe.errors.StripeError & { payment_intent?: Stripe.PaymentIntent; code?: string; decline_code?: string };
        if (err.code === "authentication_required" && err.payment_intent) {
          return jsonRes({
            error: "authentication_required",
            client_secret: err.payment_intent.client_secret,
            payment_intent_id: err.payment_intent.id,
          }, 402);
        }
        return jsonRes({
          error: "stripe_declined",
          code: err.code,
          decline_code: err.decline_code,
          message: err.message,
        }, 402);
      }

      if (intent.status !== "succeeded") {
        return jsonRes({ error: "intent_not_succeeded", status: intent.status }, 402);
      }

      // Cache card details on client
      if (pm.card) {
        await admin.from("clients").update({
          card_brand: pm.card.brand,
          card_last4: pm.card.last4,
          preferred_payment_method: "stripe",
        }).eq("id", client.id);
      }

      // Commit the draft → creates appointment via Acuity
      try {
        const { commitDraft } = await import("../_shared/commitDraft.ts");
        const result = await commitDraft(admin, draftId, intent.id, "client-one-tap", "stripe", pm.card?.brand || "card");
        return jsonRes({
          success: true,
          status: "succeeded",
          payment_intent_id: intent.id,
          appointment_id: result.appointmentId,
          acuity_id: result.acuityId,
          card: { brand: pm.card?.brand, last4: pm.card?.last4 },
        });
      } catch (e) {
        console.error("[draft-charge-saved-card] commitDraft failed (charge OK, commit failed):", e);
        return jsonRes({
          error: "commit_failed_after_charge",
          message: (e as Error).message,
          payment_intent_id: intent.id,
        }, 500);
      }
    }

    /* ───────── PUBLIC CONFIG ───────── */
    if (action === "get-public-config") {
      return jsonRes({
        paypal_client_id: Deno.env.get("PAYPAL_CLIENT_ID") || "",
        athmovil_public_token: Deno.env.get("ATH_MOVIL_PUBLIC_TOKEN") || "",
      });
    }


    return jsonRes({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("client-booking-pay error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
