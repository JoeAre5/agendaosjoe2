// Stripe webhook — backstop for hosted Checkout flow.
//
// PRIMARY commit path is poll-based: BookingConfirming polls
// pay-then-book action="check-stripe-checkout-status" which calls commitDraft
// inline as soon as Stripe reports the session as paid.
//
// This webhook is the SAFETY NET in case the user closes the tab before the
// poller succeeds — Stripe will still POST checkout.session.completed and we
// run the same idempotent commitDraft path here.
//
// Handlers:
//   - checkout.session.completed → commit draft if still pending (idempotent)
//   - checkout.session.expired   → mark draft expired if still pending
//
// Legacy payment_intent.succeeded / payment_intent.payment_failed handlers
// were removed in Phase 1 demolition — they only served the old embedded
// PaymentElement flow which no longer exists.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { commitDraft } from "../_shared/commitDraft.ts";
import { notifyOwners } from "../_shared/notifyOwners.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2025-08-27.basil",
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const OWNER_ALERT_EMAIL = "charliesbarbershop.camuy@gmail.com";
const ADMIN_BASE_URL = "https://charliesbarbershop.co";
const LOG = "[stripe-webhook]";

// ────────────────────────────────────────────────────────────
// Refund / Dispute helpers
// ────────────────────────────────────────────────────────────

function fmtUsd(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}

function digits(s: string | null | undefined): string {
  return (s || "").replace(/\D+/g, "");
}

async function sendOwnerEmail(admin: ReturnType<typeof createClient>, templateData: Record<string, unknown>) {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${url}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        templateName: "refund-request-alert",
        recipientEmail: OWNER_ALERT_EMAIL,
        idempotencyKey: `refund-alert-${templateData.refKey}`,
        templateData,
      }),
    });
  } catch (e) {
    console.warn(`${LOG} owner email dispatch failed:`, (e as Error).message);
  }
}

async function recordRefundAlert(
  admin: ReturnType<typeof createClient>,
  opts: {
    source: "refund" | "dispute";
    refundReference: string;          // refund id or dispute id
    paymentIntentId: string | null;
    chargeId: string | null;
    amountCents: number;
    reasonRaw: string | null;
    evidenceDueBy: string | null;     // ISO date for disputes
  },
) {
  const { source, refundReference, paymentIntentId, chargeId, amountCents, reasonRaw, evidenceDueBy } = opts;

  // Idempotency: if we already inserted a refund row for this reference, bail.
  const { data: existing } = await admin
    .from("transactions")
    .select("id")
    .eq("refund_reference", refundReference)
    .eq("type", "refund")
    .maybeSingle();
  if (existing) {
    console.log(`${LOG} refund alert ${refundReference} already exists — skipping`);
    return;
  }

  // Locate original transaction by PI id.
  let originalTx: any = null;
  if (paymentIntentId) {
    const { data } = await admin
      .from("transactions")
      .select("id, barber_id, client_id, appointment_id, stripe_payment_id, total_cents")
      .eq("stripe_payment_id", paymentIntentId)
      .maybeSingle();
    originalTx = data;
  }

  // Pull client + appointment context if available.
  let client: any = null;
  let appt: any = null;
  if (originalTx?.client_id) {
    const { data } = await admin
      .from("clients")
      .select("id, first_name, last_name, phone, email")
      .eq("id", originalTx.client_id)
      .maybeSingle();
    client = data;
  }
  if (originalTx?.appointment_id) {
    const { data } = await admin
      .from("appointments")
      .select("id, service_name, starts_at, client_name, client_phone, client_email")
      .eq("id", originalTx.appointment_id)
      .maybeSingle();
    appt = data;
  }

  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ").trim()
    : (appt?.client_name || "Cliente desconocido");
  const clientPhone = client?.phone || appt?.client_phone || null;
  const clientEmail = client?.email || appt?.client_email || null;

  const reason = reasonRaw || (source === "dispute" ? "chargeback" : "requested_by_customer");
  const amountUsd = fmtUsd(amountCents);

  // Insert REFUND-type transaction row (status pending_review so badge + UI pick it up).
  const notesParts = [
    `REFUND REQUEST (${source.toUpperCase()})`,
    `cliente: ${clientName}`,
    clientPhone ? `tel: ${clientPhone}` : null,
    clientEmail ? `email: ${clientEmail}` : null,
    `razón: ${reason}`,
    chargeId ? `charge: ${chargeId}` : null,
    paymentIntentId ? `pi: ${paymentIntentId}` : null,
  ].filter(Boolean).join(" · ");

  await admin.from("transactions").insert({
    barber_id: originalTx?.barber_id || null,
    client_id: originalTx?.client_id || null,
    appointment_id: originalTx?.appointment_id || null,
    type: "refund",
    payment_method: "stripe",
    subtotal_cents: -Math.abs(amountCents),
    tip_cents: 0,
    total_cents: -Math.abs(amountCents),
    status: "pending_review",
    stripe_payment_id: paymentIntentId,
    refund_reference: refundReference,
    notes: notesParts,
    is_manual_entry: false,
    source: source === "dispute" ? "stripe_dispute" : "stripe_refund",
  });

  // Stamp the original transaction so it's visibly flagged.
  if (originalTx?.id) {
    await admin
      .from("transactions")
      .update({
        refund_status: source === "dispute" ? "disputed" : "requested",
        dispute_id: source === "dispute" ? refundReference : null,
        refund_initiated_at: new Date().toISOString(),
      })
      .eq("id", originalTx.id);
  }

  // Push to owner devices.
  const adminUrl = `${ADMIN_BASE_URL}/admin/sales?status=pending_review`;
  await notifyOwners({
    event_key: "admin_refund_requested",
    vars: {
      source: source === "dispute" ? "disputa" : "reembolso",
      client: clientName,
      amount: amountUsd,
      reason,
    },
    defaults: {
      title: source === "dispute" ? "⚠️ Disputa de cargo" : "⚠️ Reembolso solicitado",
      body: `${clientName}: $${amountUsd} (${reason}). Contactar antes de que se complete.`,
      url: adminUrl,
      tag: `refund-${refundReference}`,
    },
  }).catch((e) => console.warn(`${LOG} notifyOwners err:`, (e as Error).message));

  // Email owner with full contact card + Stripe deep links.
  const phoneDigits = digits(clientPhone);
  const stripeChargeUrl = chargeId ? `https://dashboard.stripe.com/payments/${paymentIntentId || chargeId}` : null;
  const stripeDisputeUrl = source === "dispute" ? `https://dashboard.stripe.com/disputes/${refundReference}` : null;
  const apptDate = appt?.starts_at
    ? new Date(appt.starts_at).toLocaleString("es-PR", { timeZone: "America/Puerto_Rico", weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true })
    : null;
  const evidenceDue = evidenceDueBy
    ? new Date(evidenceDueBy).toLocaleString("es-PR", { timeZone: "America/Puerto_Rico", weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true })
    : null;

  await sendOwnerEmail(admin, {
    refKey: refundReference,
    source,
    clientName,
    clientPhone,
    clientEmail,
    amountUsd,
    serviceName: appt?.service_name || null,
    appointmentDate: apptDate,
    reason,
    stripeChargeUrl,
    stripeDisputeUrl,
    adminUrl,
    whatsappUrl: phoneDigits ? `https://wa.me/${phoneDigits.startsWith("1") ? phoneDigits : "1" + phoneDigits}` : null,
    telUrl: phoneDigits ? `tel:+${phoneDigits.startsWith("1") ? phoneDigits : "1" + phoneDigits}` : null,
    mailtoUrl: clientEmail ? `mailto:${clientEmail}` : null,
    evidenceDueBy: evidenceDue,
  });

  console.log(`${LOG} ✔ refund alert recorded ref=${refundReference} src=${source} client=${clientName} amt=${amountUsd}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200 });

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.warn(`${LOG} missing stripe-signature header`);
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (e) {
    console.error(`${LOG} signature verification failed:`, (e as Error).message);
    return new Response(`Webhook Error: ${(e as Error).message}`, { status: 400 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  console.log(`${LOG} received event type=${event.type} id=${event.id}`);

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const draftId = (session.metadata?.draft_id || "").trim();
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "";

      // Branch: existing-appointment Stripe Checkout (admin or public /pay/:id).
      const appointmentIdMeta = (session.metadata?.appointment_id || "").trim();
      if (!draftId && appointmentIdMeta) {
        if (session.payment_status !== "paid") {
          return new Response(JSON.stringify({ received: true, skipped: "not_paid" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
        const tipCents = Number(session.metadata?.tip_cents || 0) || 0;
        const amountCents = session.amount_total ?? 0;

        const { data: appt } = await admin
          .from("appointments")
          .select("id, payment_confirmed, barber_id, client_id, service_name, amount_paid_cents")
          .eq("id", appointmentIdMeta)
          .maybeSingle();
        if (!appt) {
          console.warn(`${LOG} appointment ${appointmentIdMeta} not found for session=${session.id}`);
          return new Response(JSON.stringify({ received: true, skipped: "appt_not_found" }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }

        // Look up wallet/payment method type for transaction record
        let pmType: string | null = "card";
        try {
          if (paymentIntentId) {
            const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
            const pm = pi.payment_method as { type?: string; card?: { wallet?: { type?: string }, brand?: string, last4?: string } } | null;
            pmType = pm?.card?.wallet?.type || pm?.type || "card";
            // Save card brand/last4 on the client for one-tap future
            if (appt.client_id && pm?.card?.brand && pm?.card?.last4) {
              await admin.from("clients")
                .update({ card_brand: pm.card.brand, card_last4: pm.card.last4 })
                .eq("id", appt.client_id);
            }
          }
        } catch (e) {
          console.warn(`${LOG} could not fetch PM details: ${(e as Error).message}`);
        }

        // The payment intent, not an earlier confirmed payment, identifies a
        // duplicate. Insert and cumulative totals commit in one locked transaction.
        const { error: commitError } = await admin.rpc("record_stripe_appointment_payment", {
          p_appointment_id: appointmentIdMeta,
          p_payment_intent_id: paymentIntentId,
          p_amount_cents: amountCents,
          p_tip_cents: tipCents,
          p_method_type: pmType,
        });
        if (commitError) {
          console.error(`${LOG} appointment payment commit failed:`, commitError.message);
          return new Response(JSON.stringify({ error: "payment_commit_failed" }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        console.log(`${LOG} ✔ appointment ${appointmentIdMeta} marked paid via webhook`);
        return new Response(JSON.stringify({ received: true, appointment_paid: appointmentIdMeta }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }

      if (!draftId) {
        console.log(`${LOG} checkout.session.completed without draft_id metadata — non-booking session, skipping (session=${session.id})`);
        return new Response(JSON.stringify({ received: true, skipped: "no_draft_id" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { data: draft } = await admin
        .from("booking_drafts")
        .select("id, status, appointment_id")
        .eq("id", draftId)
        .maybeSingle();

      if (!draft) {
        console.warn(`${LOG} checkout.session.completed for unknown draft=${draftId} session=${session.id}`);
        return new Response(JSON.stringify({ received: true, skipped: "draft_not_found" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (draft.status === "committed") {
        console.log(`${LOG} draft=${draftId} already committed (poller won) — idempotent no-op`);
        return new Response(JSON.stringify({ received: true, idempotent: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (draft.status !== "pending") {
        console.warn(`${LOG} draft=${draftId} status=${draft.status} — refusing to commit from webhook`);
        return new Response(JSON.stringify({ received: true, skipped: `status_${draft.status}` }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      console.log(`${LOG} ▶ committing draft=${draftId} via webhook (pi=${paymentIntentId})`);
      let pmType: string | null = null;
      try {
        if (paymentIntentId) {
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
          const pm = pi.payment_method as { type?: string; card?: { wallet?: { type?: string } } } | null;
          pmType = pm?.card?.wallet?.type || pm?.type || null;
        }
      } catch (e) {
        console.warn(`${LOG} could not fetch payment_method: ${(e as Error).message}`);
      }
      try {
        const result = await commitDraft(admin, draftId, paymentIntentId, "stripe-webhook", "stripe", pmType);
        console.log(`${LOG} ✔ webhook commit success draft=${draftId} appointment=${result.appointmentId}`);
      } catch (e) {
        console.error(`${LOG} ✖ webhook commit failed draft=${draftId}:`, (e as Error).message);
        // Return 200 anyway — Stripe should NOT retry indefinitely; the poller
        // will surface the failure to the user and our cron jobs sweep stuck
        // drafts. Returning 5xx would just create a retry storm.
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const draftId = (session.metadata?.draft_id || "").trim();
      if (!draftId) {
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { error } = await admin
        .from("booking_drafts")
        .update({ status: "expired", failure_reason: "stripe_checkout_expired" })
        .eq("id", draftId)
        .eq("status", "pending");

      if (error) {
        console.error(`${LOG} failed to mark draft=${draftId} expired:`, error.message);
      } else {
        console.log(`${LOG} draft=${draftId} marked expired via checkout.session.expired`);
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // ────────────────────────────────────────────────────────
    // Refund events: charge.refunded, refund.created, refund.updated
    // ────────────────────────────────────────────────────────
    if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "charge.refunded") {
      let refund: Stripe.Refund | null = null;
      let chargeId: string | null = null;
      let piId: string | null = null;
      let amountCents = 0;
      let reason: string | null = null;

      if (event.type === "charge.refunded") {
        const charge = event.data.object as Stripe.Charge;
        chargeId = charge.id;
        piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id || null;
        // Use the most recent refund on the charge.
        const last = charge.refunds?.data?.[0];
        if (last) {
          refund = last;
          amountCents = last.amount;
          reason = last.reason || null;
        } else {
          amountCents = charge.amount_refunded;
        }
      } else {
        refund = event.data.object as Stripe.Refund;
        chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id || null;
        piId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id || null;
        amountCents = refund.amount;
        reason = refund.reason || null;
      }

      const ref = refund?.id || `chg_refund_${chargeId}`;
      await recordRefundAlert(admin, {
        source: "refund",
        refundReference: ref,
        paymentIntentId: piId,
        chargeId,
        amountCents,
        reasonRaw: reason,
        evidenceDueBy: null,
      });
      return new Response(JSON.stringify({ received: true, refund: ref }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // ────────────────────────────────────────────────────────
    // Dispute events: charge.dispute.created / updated / closed
    // ────────────────────────────────────────────────────────
    if (event.type.startsWith("charge.dispute.")) {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id || null;
      const piId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id || null;
      const evidenceDueBy = dispute.evidence_details?.due_by
        ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
        : null;

      // Only fire owner alert on the first event (created). Updates/closed still
      // pass through but recordRefundAlert is idempotent by dispute id.
      if (event.type === "charge.dispute.created") {
        await recordRefundAlert(admin, {
          source: "dispute",
          refundReference: dispute.id,
          paymentIntentId: piId,
          chargeId,
          amountCents: dispute.amount,
          reasonRaw: dispute.reason || null,
          evidenceDueBy,
        });
      } else if (event.type === "charge.dispute.closed") {
        // Mark original tx with final dispute status (won / lost).
        if (piId) {
          await admin
            .from("transactions")
            .update({ refund_status: `dispute_${dispute.status}` })
            .eq("stripe_payment_id", piId);
        }
      }
      return new Response(JSON.stringify({ received: true, dispute: dispute.id, type: event.type }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    console.log(`${LOG} ignoring event type=${event.type}`);
    return new Response(JSON.stringify({ received: true, ignored: event.type }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`${LOG} unhandled error:`, (e as Error).message);
    // Always 200 so Stripe doesn't retry indefinitely on programming errors.
    return new Response(JSON.stringify({ received: true, error: (e as Error).message }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
});
