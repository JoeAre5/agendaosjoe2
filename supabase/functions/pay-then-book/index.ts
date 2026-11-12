// Atomic "pay-then-book" — payment is verified BEFORE the Acuity appointment is created.
// Replaces the old "create appointment then pay" flow that left orphan unpaid bookings.
//
// Lifecycle:
//   1. Client calls action='prepare-draft'  → returns { draftId }
//      (saves booking intent in booking_drafts; NO Acuity call, NO appointment row)
//   2. Client runs payment UI (Stripe/PayPal/ATH) using draftId in metadata
//   3. After payment success, client calls action='commit-and-book' with payment proof
//      → server verifies payment, creates Acuity appointment, inserts appointments row,
//        marks draft 'committed'. If Acuity fails → automatic refund.
//
// No payment, no appointment. Period.
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { commitDraft } from "../_shared/commitDraft.ts";
import { appBookingEmailsEnabled } from "../_shared/appEmailSwitch.ts";
import { nativeQuote, nativeShopFor } from "../_shared/nativeDraft.ts";
import { canAccessDraft, isAllowedReturnOrigin as guardOrigin } from "../_shared/accessGuards.ts";

const BOOKING_HOLD_MINUTES = 30;
const ATH_FIND_PAYMENT_URL = "https://payments.athmovil.com/api/business-transaction/ecommerce/business/findPayment";
const ATH_AUTHORIZATION_URL = "https://payments.athmovil.com/api/business-transaction/ecommerce/authorization";
const CHECK_LOG = "[check-ath-status]";

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

function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

/* ─── Acuity helpers ─── */
async function acuityFetch(path: string, init: RequestInit = {}) {
  const acuityUserId = Deno.env.get("ACUITY_USER_ID");
  const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
  if (!acuityUserId || !acuityApiKey) throw new Error("Acuity not configured");
  const basicAuth = btoa(`${acuityUserId}:${acuityApiKey}`);
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://acuityscheduling.com/api/v1${path}${sep}admin=true`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { ok: res.ok, status: res.status, data };
}

// Refunds are manual-only (owner policy): no refund helpers here.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const action = String(body.action || "");

    /* ═══════════════════════════════════════════════════════════
       ACTION: prepare-draft
       Stores booking intent, returns draftId. NO Acuity call yet.
       ═══════════════════════════════════════════════════════════ */
    if (action === "prepare-draft") {
      const {
        source,                // 'public_site' | 'client_app'
        appointmentTypeID,
        calendarID,
        datetime,
        firstName,
        lastName,
        phone,
        email,
        addonIDs,
        notes,
        totalCents,
        tipCents,
        clientId,              // optional, when logged-in
        createdByUserId,       // optional, when logged-in
        products,              // OPTIONAL mini-shop cart: [{ id: uuid, qty: number }]
        confirmedClientId,     // optional, set after the user resolved a phone-only match prompt
        forceNewProfile,       // optional, true when user explicitly chose "keep separate"
      } = body;

      if (!source || !appointmentTypeID || !calendarID || !datetime || !firstName || !phone || !email || typeof totalCents !== "number") {
        return jsonRes({ error: "Missing required fields (email is required)" }, 400);
      }

      const phoneNorm = normalizePhone(String(phone));
      if (phoneNorm.length < 7) return jsonRes({ error: "Invalid phone" }, 400);

      const emailNorm = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
        return jsonRes({ error: "Invalid email" }, 400);
      }

      // Native scheduler (shops.booking_provider = native): ids are local uuids, price and hours come
      // from this database, and there is no Acuity call anywhere in the booking.
      const nativeShop = await nativeShopFor(admin, null);
      const isNative = nativeShop.kind === "native";

      // Resolve barber from calendar (validate the slot really maps to a known barber)
      const calQuery = admin.from("barbers").select("id, name");
      const { data: calRow, error: calErr } = await (isNative
        ? calQuery.eq("id", String(calendarID)).eq("shop_id", nativeShop.shopId)
        : calQuery.eq("acuity_calendar_id", calendarID)
      ).maybeSingle();
      if (calErr) console.error("[prepare-draft] barbers lookup error:", calErr, "calendarID=", calendarID, typeof calendarID);
      if (!calRow?.id) {
        console.error("[prepare-draft] No barber for calendarID=", calendarID, "(", typeof calendarID, ") err=", calErr?.message);
        return jsonRes({ error: "Barber not found for calendar", calendarID, detail: calErr?.message || null }, 400);
      }

      // ─── Mini-shop: validate cart against current stock ───
      let validatedProducts: Array<{ id: string; qty: number; name: string; price_cents: number }> = [];
      let productsTotalCents = 0;
      if (Array.isArray(products) && products.length > 0) {
        const ids = products.map((p: any) => String(p?.id)).filter(Boolean);
        const { data: prodRows, error: prodErr } = await admin
          .from("products")
          .select("id, name, price_cents, stock_count, is_active")
          .in("id", ids);
        if (prodErr) return jsonRes({ error: "Could not validate cart", detail: prodErr.message }, 500);
        for (const item of products) {
          const qty = Math.max(1, Math.floor(Number(item?.qty) || 0));
          const row = (prodRows || []).find((r) => r.id === String(item?.id));
          if (!row || !row.is_active) {
            return jsonRes({ error: `product_unavailable:${item?.id}` }, 409);
          }
          if (row.stock_count < qty) {
            return jsonRes({ error: `product_out_of_stock:${row.name}`, productId: row.id }, 409);
          }
          validatedProducts.push({ id: row.id, qty, name: row.name, price_cents: row.price_cents });
          productsTotalCents += row.price_cents * qty;
        }
      }

      // ─── SERVER-SIDE TOTAL RECALCULATION (anti-tampering) ───
      // Source of truth for service price is ACUITY (matches the price the
      // client sees in the UI, which also comes from Acuity). This prevents
      // charge/display drift when prices are updated in Acuity but the local
      // `services` table hasn't been re-synced yet.
      // Fallback to the local DB row only if Acuity is unreachable.
      let serviceCents = 0;
      let serviceDurationMin = 0;
      let addonsDurationMin = 0;
      if (!isNative) {
        let acuityPriceCents: number | null = null;
        try {
          // Acuity v1 has no /appointment-types/:id; read the full catalog.
          const { ok, data: list } = await acuityFetch(`/appointment-types`);
          const at = ok && Array.isArray(list)
            ? (list as any[]).find((t) => Number(t.id) === Number(appointmentTypeID))
            : null;
          if (at && typeof (at as any).price !== "undefined") {
            const parsed = parseFloat(String((at as any).price || "0"));
            if (Number.isFinite(parsed) && parsed >= 0) {
              acuityPriceCents = Math.round(parsed * 100);
            }
            serviceDurationMin = Math.max(0, Number((at as any).duration) || 0);
          }
        } catch (e) {
          console.warn("[prepare-draft] Acuity price fetch failed, falling back to DB", e);
        }
        if (acuityPriceCents !== null) {
          serviceCents = acuityPriceCents;
        } else {
          const { data: svc } = await admin
            .from("services")
            .select("price_cents, duration_minutes")
            .eq("acuity_type_id", Number(appointmentTypeID))
            .eq("barber_id", calRow.id)
            .eq("is_active", true)
            .maybeSingle();
          if (!svc) return jsonRes({ error: "Service not found for this barber" }, 400);
          serviceCents = Number(svc.price_cents) || 0;
          serviceDurationMin = Math.max(0, Number(svc.duration_minutes) || 0);
        }
      }
      // Addons: source of truth is ACUITY (global price per addon).
      // Fallback to local `service_addons.price_cents` only when Acuity is
      // unreachable OR the addon doesn't exist in Acuity (legacy addons).
      let addonsCents = 0;
      if (isNative) {
        const qte = await nativeQuote(admin, nativeShop.shopId, {
          serviceId: String(appointmentTypeID),
          barberId: calRow.id,
          addonIds: Array.isArray(addonIDs) ? addonIDs.map((a: unknown) => String(a)) : [],
          startsAt: String(datetime),
        });
        if (!qte.ok) return jsonRes({ error: qte.error === "slot_unavailable" ? "slot_taken" : qte.error }, qte.status);
        serviceCents = qte.serviceCents;
        addonsCents = qte.addonsCents;
        serviceDurationMin = qte.totalDurationMinutes;
      }
      if (!isNative && Array.isArray(addonIDs) && addonIDs.length > 0) {
        const addonIdsNum = addonIDs.map((a: any) => Number(a)).filter((n: number) => Number.isFinite(n));

        // 1) Try Acuity first — one call returns all addons.
        const acuityPriceById = new Map<number, number>();
        try {
          const { ok, data: list } = await acuityFetch(`/appointment-addons`);
          if (ok && Array.isArray(list)) {
            for (const a of list as Array<{ id: number; price?: string | number; duration?: number }>) {
              if (addonIdsNum.includes(Number(a.id))) addonsDurationMin += Math.max(0, Number(a.duration) || 0);
              const parsed = parseFloat(String(a?.price ?? "0"));
              if (Number.isFinite(parsed) && parsed >= 0) {
                acuityPriceById.set(Number(a.id), Math.round(parsed * 100));
              }
            }
          }
        } catch (e) {
          console.warn("[prepare-draft] Acuity addons fetch failed, will use DB fallback", e);
        }

        // 2) DB fallback map (used only for addons Acuity didn't return).
        const missingFromAcuity = addonIdsNum.filter((id) => !acuityPriceById.has(id));
        const dbPriceById = new Map<number, number>();
        if (missingFromAcuity.length > 0) {
          const { data: addonRows } = await admin
            .from("service_addons")
            .select("acuity_addon_id, price_cents")
            .in("acuity_addon_id", missingFromAcuity)
            .eq("barber_id", calRow.id)
            .eq("is_active", true);
          for (const r of (addonRows || []) as Array<{ acuity_addon_id: number; price_cents: number }>) {
            dbPriceById.set(Number(r.acuity_addon_id), Number(r.price_cents) || 0);
          }
        }

        for (const aId of addonIdsNum) {
          if (acuityPriceById.has(aId)) {
            addonsCents += acuityPriceById.get(aId)!;
          } else if (dbPriceById.has(aId)) {
            addonsCents += dbPriceById.get(aId)!;
          } else {
            return jsonRes({ error: `addon_unavailable:${aId}` }, 400);
          }
        }
      }
      const safeTip = Math.max(0, Math.floor(Number(tipCents) || 0));
      const serverTotalCents = serviceCents + addonsCents + productsTotalCents + safeTip;
      if (Number(totalCents) < serverTotalCents - 1) {
        console.warn(`[prepare-draft] price tamper detected: client=${totalCents} server=${serverTotalCents}`);
        return jsonRes({ error: "Price mismatch", serverTotalCents }, 400);
      }
      const finalTotalCents = serverTotalCents;

      // ─── Slot range (fail closed) ───
      // Unknown service duration blocks the booking instead of guessing 30 min.
      // The atomic hold below is the real guard; this only computes the range.
      const holdStartMs = new Date(String(datetime)).getTime();
      if (!Number.isFinite(holdStartMs)) return jsonRes({ error: "invalid_datetime" }, 400);
      if (!serviceDurationMin || serviceDurationMin <= 0) {
        return jsonRes({ error: "duration_unknown" }, 503);
      }
      const holdStartIso = new Date(holdStartMs).toISOString();
      const holdEndIso = new Date(holdStartMs + (serviceDurationMin + addonsDurationMin) * 60000).toISOString();

      // ─── Unified client matching (guest matrix) ───
      // Skipped when caller already provided clientId (logged-in path).
      let resolvedClientId: string | null = clientId || null;
      if (!resolvedClientId && !forceNewProfile) {
        const { data: matchRows } = await admin.rpc("find_matching_client", {
          _phone: phoneNorm || null,
          _email: emailNorm || null,
        });
        const m = Array.isArray(matchRows) && matchRows.length > 0 ? matchRows[0] : null;
        const mType = (m?.match_type as string) || "none";
        const mId = (m?.client_id as string) || null;

        if (mId && mType === "phone" && confirmedClientId !== mId) {
          // Phone-only match → require explicit confirmation before creating draft.
          return jsonRes({
            requiresPhoneConfirm: true,
            match: { clientId: mId, displayName: m?.display_name || null },
          });
        }
        if (mId && (mType === "both" || mType === "email" || confirmedClientId === mId)) {
          resolvedClientId = mId;
          // Note: an unauthenticated caller must never change a stored profile.
          // The phone typed here stays on the draft/appointment only.
        }
      }

      const { data: draft, error: draftErr } = await admin
        .from("booking_drafts")
        .insert({
          source,
          ...(isNative
            ? {
                shop_id: nativeShop.shopId,
                service_ref_id: String(appointmentTypeID),
                addon_ref_ids: Array.isArray(addonIDs) ? addonIDs.map((a: unknown) => String(a)) : [],
                appointment_type_id: null,
                calendar_id: null,
              }
            : { appointment_type_id: appointmentTypeID, calendar_id: calendarID }),
          barber_id: calRow.id,
          datetime: String(datetime),
          addon_ids: !isNative && Array.isArray(addonIDs) ? addonIDs : [],
          notes: notes || null,
          client_id: resolvedClientId,
          first_name: String(firstName).trim().slice(0, 80),
          last_name: lastName ? String(lastName).trim().slice(0, 80) : null,
          phone: phoneNorm,
          email: emailNorm,
          total_cents: finalTotalCents,
          tip_cents: tipCents || 0,
          created_by_user_id: createdByUserId || null,
          products: validatedProducts,
          products_total_cents: productsTotalCents,
        })
        .select("id")
        .single();
      if (draftErr || !draft) {
        return jsonRes({ error: "Could not create draft", detail: draftErr?.message }, 500);
      }

      // ─── Atomic slot hold (serialized per barber in the database) ───
      // 30 minutes: Stripe Checkout requires a session expiry of at least 30 min.
      const { data: hold, error: holdErr } = await admin.rpc("acquire_booking_hold", {
        _draft_id: draft.id,
        _barber_id: calRow.id,
        _starts_at: holdStartIso,
        _ends_at: holdEndIso,
        _hold_minutes: BOOKING_HOLD_MINUTES,
      });
      if (holdErr || !(hold as any)?.success) {
        await admin.from("booking_drafts")
          .update({ status: "failed", failure_reason: holdErr ? "hold_check_failed" : `hold_${(hold as any)?.reason}` })
          .eq("id", draft.id);
        if (holdErr) return jsonRes({ error: "slot_check_failed" }, 503);
        return jsonRes({ error: "slot_taken" }, 409);
      }

      return jsonRes({ draftId: draft.id, barberName: calRow.name, productsTotalCents });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: update-draft-tip
       Persists the user's selected tip on the booking_drafts row JUST BEFORE
       a redirect/push happens for any payment gateway. The draft is the
       single source of truth for the amount each gateway charges:
         - create-booking-checkout reads draft.total_cents
         - athmovil-create-payment reads draft.total_cents + draft.tip_cents
         - prepare-paypal-redirect reads draft.total_cents
       Without this call the tip would be ignored on Stripe / PayPal / ATH.
       Idempotent: only mutates rows still in 'pending' status.
       ═══════════════════════════════════════════════════════════ */
    if (action === "update-draft-tip") {
      const { draftId, tipCents } = body;
      if (!draftId || typeof draftId !== "string") {
        return jsonRes({ error: "missing_draft_id" }, 400);
      }
      const tip = Math.max(0, Math.round(Number(tipCents) || 0));

      const { data: draft, error: loadErr } = await admin
        .from("booking_drafts")
        .select("id, status, total_cents, tip_cents, client_id")
        .eq("id", draftId)
        .maybeSingle();
      if (loadErr) return jsonRes({ error: "draft_fetch_failed" }, 500);
      if (!draft) return jsonRes({ error: "draft_not_found" }, 404);
      if (!(await canAccessDraft(admin, req, draft.client_id))) return jsonRes({ error: "forbidden" }, 403);
      if (tip > Math.max(10000, (draft.total_cents || 0) - (draft.tip_cents || 0))) {
        return jsonRes({ error: "invalid_tip" }, 400);
      }
      if (draft.status !== "pending") {
        return jsonRes({ error: "draft_not_pending", currentStatus: draft.status }, 409);
      }

      const subtotal = (draft.total_cents || 0) - (draft.tip_cents || 0);
      const newTotal = subtotal + tip;

      const { error: updErr } = await admin
        .from("booking_drafts")
        .update({ tip_cents: tip, total_cents: newTotal })
        .eq("id", draftId)
        .eq("status", "pending");
      if (updErr) return jsonRes({ error: "draft_update_failed", detail: updErr.message }, 500);

      return jsonRes({ success: true, totalCents: newTotal, tipCents: tip });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: commit-benefit-only
       Books a draft whose total is fully covered by an applied
       benefit redemption (balance $0.00). No gateway charge — we
       just commit the Acuity appointment and mark the redemption
       as redeemed. Idempotent on draft.status='committed'.
       ═══════════════════════════════════════════════════════════ */
    if (action === "commit-benefit-only") {
      const { draftId } = body;
      if (!draftId || typeof draftId !== "string") {
        return jsonRes({ error: "missing_draft_id" }, 400);
      }

      const { data: draft, error: dErr } = await admin
        .from("booking_drafts")
        .select("*")
        .eq("id", draftId)
        .maybeSingle();
      if (dErr) return jsonRes({ error: "draft_fetch_failed", detail: dErr.message }, 500);
      if (!draft) return jsonRes({ error: "draft_not_found" }, 404);

      if (draft.status === "committed" && draft.appointment_id) {
        return jsonRes({
          success: true,
          alreadyCommitted: true,
          appointmentId: draft.appointment_id,
          acuityId: draft.acuity_id,
        });
      }
      if (draft.status !== "pending") {
        return jsonRes({ error: "draft_not_pending", currentStatus: draft.status }, 409);
      }
      if (new Date(draft.expires_at).getTime() < Date.now()) {
        await admin.from("booking_drafts").update({ status: "failed", failure_reason: "Draft expired" }).eq("id", draftId);
        return jsonRes({ error: "draft_expired" }, 410);
      }
      if (!draft.applied_benefit_redemption_id) {
        return jsonRes({ error: "no_benefit_applied" }, 400);
      }

      // Force tip to 0 so total reflects the fully-covered amount.
      if ((draft.tip_cents || 0) !== 0 || (draft.total_cents || 0) !== 0) {
        const subtotal = (draft.total_cents || 0) - (draft.tip_cents || 0);
        if (subtotal !== 0) {
          return jsonRes({ error: "balance_not_zero", balanceCents: subtotal }, 409);
        }
        await admin
          .from("booking_drafts")
          .update({ tip_cents: 0, total_cents: 0 })
          .eq("id", draftId)
          .eq("status", "pending");
      }

      try {
        const result = await commitDraft(
          admin,
          draftId,
          String(draft.applied_benefit_redemption_id),
          "benefit-redeem",
          "benefit",
        );
        return jsonRes({
          success: true,
          alreadyCommitted: result.alreadyCommitted,
          appointmentId: result.appointmentId,
          acuityId: result.acuityId,
          clientId: result.draft?.client_id,
          appointment: result.appointment,
        });
      } catch (e) {
        const msg = (e as Error).message || "Commit failed";
        console.error("[commit-benefit-only] error:", msg);
        const acuityFailed = msg.startsWith("acuity_failed");
        return jsonRes({
          error: acuityFailed ? "slot_unavailable" : "commit_failed",
          message: acuityFailed
            ? "El horario ya no está disponible. Tu beneficio sigue disponible para otra cita."
            : msg,
          messageEn: acuityFailed
            ? "That time is no longer available. Your benefit is still available for another booking."
            : msg,
        }, acuityFailed ? 409 : 500);
      }
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: prepare-stripe-intent
       Creates a Stripe PaymentIntent for INLINE Payment Element use
       (Filho chat). Persists nothing extra; webhook + commit-and-book
       handle the rest via metadata.draft_id.
       ═══════════════════════════════════════════════════════════ */
    if (action === "prepare-stripe-intent") {
      const { draftId } = body;
      if (!draftId || typeof draftId !== "string") {
        return jsonRes({ error: "missing_draft_id" }, 400);
      }

      const { data: draft, error: dErr } = await admin
        .from("booking_drafts")
        .select("id, status, expires_at, total_cents, client_id, first_name, last_name, email, phone, appointment_type_id, service_ref_id")
        .eq("id", draftId)
        .maybeSingle();
      if (dErr || !draft) return jsonRes({ error: "draft_not_found" }, 404);
      if (draft.status !== "pending") return jsonRes({ error: "draft_not_pending" }, 409);
      if (new Date(draft.expires_at).getTime() < Date.now()) {
        return jsonRes({ error: "draft_expired" }, 410);
      }
      if (!draft.total_cents || draft.total_cents <= 0) {
        return jsonRes({ error: "invalid_total" }, 400);
      }

      const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY") || "";
      const secretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
      if (!secretKey || !publishableKey) {
        return jsonRes({ error: "stripe_not_configured" }, 500);
      }

      const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });

      // Reuse the same customer-resolver as create-booking-checkout.
      const { resolveOrCreateStripeCustomer } = await import("../_shared/stripeCustomer.ts");
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
        console.error("[prepare-stripe-intent] customer error:", (e as Error).message);
      }

      // Look up service name for description.
      let serviceName = "Charlie's Barbershop appointment";
      if (draft.appointment_type_id) {
        const { data: svc } = await admin
          .from("services")
          .select("name")
          .eq("acuity_type_id", draft.appointment_type_id)
          .maybeSingle();
        if (svc?.name) serviceName = svc.name as string;
      } else if (draft.service_ref_id) {
        const { data: svc } = await admin.from("services").select("name").eq("id", draft.service_ref_id).maybeSingle();
        if (svc?.name) serviceName = svc.name as string;
      }

      try {
        const intent = await stripe.paymentIntents.create({
          amount: draft.total_cents,
          currency: "usd",
          customer: customerId,
          automatic_payment_methods: { enabled: true },
          ...(customerId ? { setup_future_usage: "off_session" as const } : {}),
          metadata: {
            draft_id: draftId,
            source: "filho_inline",
          },
          description: serviceName,
        });
        return jsonRes({
          client_secret: intent.client_secret,
          publishable_key: publishableKey,
          amount_cents: draft.total_cents,
          payment_intent_id: intent.id,
        });
      } catch (e) {
        console.error("[prepare-stripe-intent] stripe error:", (e as Error).message);
        return jsonRes({ error: "stripe_intent_failed", detail: (e as Error).message }, 502);
      }
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: commit-and-book
       Verifies payment server-side, then creates Acuity appointment
       and DB row. Auto-refunds if Acuity fails after a paid charge.
       ═══════════════════════════════════════════════════════════ */
    if (action === "commit-and-book") {
      const {
        draftId,
        paymentMethod,         // 'stripe' | 'paypal' | 'ath_movil'
        paymentRef,            // PI id (stripe), order id (paypal), ecommerceId (ath)
        amountPaidCents,
        tipCents,
      } = body;

      if (!draftId || !paymentMethod || !paymentRef || typeof amountPaidCents !== "number") {
        return jsonRes({ error: "Missing required fields" }, 400);
      }

      // Load draft
      const { data: draft, error: loadErr } = await admin
        .from("booking_drafts")
        .select("*")
        .eq("id", draftId)
        .maybeSingle();
      if (loadErr || !draft) return jsonRes({ error: "Draft not found" }, 404);

      if (draft.status === "committed" && draft.appointment_id) {
        // Idempotent: already booked, return the same appointment
        return jsonRes({
          success: true,
          alreadyCommitted: true,
          appointmentId: draft.appointment_id,
          acuityId: draft.acuity_id,
        });
      }

      if (new Date(draft.expires_at).getTime() < Date.now()) {
        await admin.from("booking_drafts").update({ status: "failed", failure_reason: "Draft expired" }).eq("id", draftId);
        return jsonRes({ error: "Booking draft expired. Please start again." }, 410);
      }

      /* ─── ATH MÓVIL: delegate to shared commitDraft (idempotent w/ webhook) ─── */
      if (paymentMethod === "ath_movil") {
        try {
          const result = await commitDraft(admin, draftId, paymentRef, "fast-path", "ath_movil");

          // Try to enrich with returning-client info for the success screen
          let isReturning = false;
          let returningName: string | null = null;
          let cardOnFile: { brand: string | null; last4: string | null } | null = null;
          if (result.draft?.client_id || result.draft?.phone) {
            const { data: client } = await admin
              .from("clients")
              .select("first_name, card_brand, card_last4, total_visits")
              .eq("id", result.draft.client_id)
              .maybeSingle();
            if (client) {
              isReturning = (client.total_visits || 0) > 0;
              returningName = client.first_name;
              if (client.card_last4) cardOnFile = { brand: client.card_brand, last4: client.card_last4 };
            }
          }

          return jsonRes({
            success: true,
            alreadyCommitted: result.alreadyCommitted,
            appointmentId: result.appointmentId,
            acuityId: result.acuityId,
            clientId: result.draft?.client_id,
            isReturning,
            returningName,
            cardOnFile,
            appointment: result.appointment,
          });
        } catch (e) {
          const msg = (e as Error).message || "Commit failed";
          const refunded = msg.startsWith("acuity_failed");
          console.error("[commit-and-book] commitDraft error:", msg);
          return jsonRes({
            error: refunded
              ? "El pago se recibió, pero el horario no se pudo confirmar. El equipo te contactará para reprogramar o reembolsar."
              : msg,
            errorEn: refunded
              ? "Your payment was received but the time could not be confirmed. The team will contact you to rebook or refund."
              : msg,
            refunded: false,
            reconciliationRequired: refunded,
          }, refunded ? 409 : 500);
        }
      }

      /* ─── 1. SERVER-SIDE PAYMENT VERIFICATION (Stripe / PayPal) ─── */
      let verifiedAmountCents = 0;
      let paymentVerified = false;
      let athReferenceNumber: string | null = null;
      let stripePmType: string | null = null;

      if (paymentMethod === "stripe") {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
        const intent = await stripe.paymentIntents.retrieve(paymentRef, { expand: ["payment_method"] });
        if (intent.status !== "succeeded") {
          return jsonRes({ error: `Stripe payment not succeeded: ${intent.status}` }, 400);
        }
        verifiedAmountCents = intent.amount_received || intent.amount;
        paymentVerified = true;

        // Extract Stripe sub-type. Wallet wallets (Apple/Google/Link) come back as
        // type='card' with the wallet info nested under card.wallet.type. Klarna comes
        // through as type='klarna' directly.
        const pm = intent.payment_method as Stripe.PaymentMethod | null;
        let pmType: string = (pm?.type as string) ?? "card";
        if (pmType === "card" && pm?.card?.wallet?.type) {
          pmType = pm.card.wallet.type; // 'apple_pay' | 'google_pay' | 'link'
        }
        stripePmType = pmType;
        console.log(`[commit-and-book] Stripe sub-type resolved: ${stripePmType}`);

        // Save card on file (for future one-tap) — only for plain cards, not wallets
        if (draft.client_id && pm?.card && !pm.card.wallet) {
          try {
            await admin
              .from("clients")
              .update({ card_brand: pm.card.brand, card_last4: pm.card.last4 })
              .eq("id", draft.client_id);
          } catch (e) { console.error("Save card failed:", e); }
        }
      } else if (paymentMethod === "paypal") {
        // Verify the order is COMPLETED in PayPal
        const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
        const secret = Deno.env.get("PAYPAL_SECRET") || "";
        const base = "https://api-m.paypal.com";
        const authRes = await fetch(`${base}/v1/oauth2/token`, {
          method: "POST",
          headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=client_credentials",
        });
        const { access_token } = await authRes.json();
        const orderRes = await fetch(`${base}/v2/checkout/orders/${paymentRef}`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        const order = await orderRes.json();
        if (order.status !== "COMPLETED") {
          return jsonRes({ error: `PayPal order not completed: ${order.status}` }, 400);
        }
        const cap = order?.purchase_units?.[0]?.payments?.captures?.[0];
        verifiedAmountCents = Math.round(parseFloat(cap?.amount?.value || "0") * 100);
        paymentVerified = true;
      } else if (paymentMethod === "ath_movil") {
        const publicToken = Deno.env.get("ATH_MOVIL_PUBLIC_TOKEN") ?? "";
        const privateToken = Deno.env.get("ATH_MOVIL_PRIVATE_TOKEN") ?? "";
        if (!publicToken || !privateToken) return jsonRes({ error: "ATH not configured" }, 500);

        const verifyRes = await fetch(
          "https://payments.athmovil.com/api/business-transaction/ecommerce/findPayment",
          {
            method: "POST",
            headers: { "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ publicToken, privateToken, ecommerceId: paymentRef }),
          }
        );
        const verifyData = await verifyRes.json();
        const status = verifyData?.status || verifyData?.data?.status || verifyData?.ecommerceStatus;
        if (status !== "completed" && status !== "COMPLETED" && status !== "success") {
          return jsonRes({ error: "ATH Móvil payment not confirmed", details: verifyData }, 400);
        }
        const paymentData = verifyData?.data || verifyData;
        verifiedAmountCents = Math.round(parseFloat(paymentData.total || paymentData.totalAmount || "0") * 100);
        athReferenceNumber = paymentData.referenceNumber || paymentData.dailyTransactionId || paymentRef;
        paymentVerified = true;
      } else {
        return jsonRes({ error: `Unsupported payment method: ${paymentMethod}` }, 400);
      }

      if (!paymentVerified) return jsonRes({ error: "Payment verification failed" }, 400);

      // HARD CHECK: verified gateway amount must cover the server-trusted draft total.
      // Allow 100¢ tolerance for ATH rounding; reject anything below that.
      const draftTotalCents = Number(draft.total_cents) || 0;
      if (verifiedAmountCents < draftTotalCents - 100) {
        console.error(`[commit-and-book] underpayment: verified=${verifiedAmountCents} draft=${draftTotalCents} claimed=${amountPaidCents}`);
        await admin.from("booking_drafts").update({ status: "failed", failure_reason: `underpaid:${verifiedAmountCents}/${draftTotalCents}` }).eq("id", draftId);
        return jsonRes({ error: "Payment amount does not match booking total", verifiedAmountCents, expectedCents: draftTotalCents }, 402);
      }
      if (Math.abs(verifiedAmountCents - amountPaidCents) > 100) {
        console.warn(`Amount mismatch: verified=${verifiedAmountCents}, claimed=${amountPaidCents}`);
      }

      /* ─── 2. DELEGATE TO SHARED commitDraft ───
         Aligns Stripe/PayPal fast path with ATH webhook path so mini-shop
         products get their own type='product' transactions (barber_id=null,
         source='public_booking'), stock is decremented, and product-sale
         notifications fire. Fixes the "product-as-tip" bug where the fast
         path wrote a single type='service' row that absorbed product money. */
      let commitResult;
      try {
        commitResult = await commitDraft(
          admin,
          draftId,
          paymentRef,
          "fast-path",
          paymentMethod as "stripe" | "paypal",
          stripePmType,
        );
      } catch (e) {
        const msg = (e as Error).message || "Commit failed";
        console.error("[commit-and-book] commitDraft error:", msg);

        // Paid but not booked → manual exception already recorded. No automatic refund.
        if (msg.startsWith("acuity_failed")) {
          return jsonRes({
            error: "El pago se recibió, pero el horario no se pudo confirmar. El equipo te contactará para reprogramar o reembolsar.",
            errorEn: "Your payment was received but the time could not be confirmed. The team will contact you to rebook or refund.",
            refunded: false,
            reconciliationRequired: true,
          }, 409);
        }

        return jsonRes({ error: msg }, 500);
      }

      /* ─── 3. ENRICH RESPONSE (returning-client info for success screen) ─── */
      const clientIdFinal = commitResult.draft?.client_id ?? null;
      let isReturning = false;
      let returningName: string | null = null;
      let cardOnFile: { brand: string | null; last4: string | null } | null = null;
      if (clientIdFinal) {
        const { data: client } = await admin
          .from("clients")
          .select("first_name, card_brand, card_last4, total_visits")
          .eq("id", clientIdFinal)
          .maybeSingle();
        if (client) {
          isReturning = (client.total_visits || 0) > 0;
          returningName = client.first_name;
          if (client.card_last4) cardOnFile = { brand: client.card_brand, last4: client.card_last4 };
        }
      }

      /* ─── 4. SEND PAID BOOKING CONFIRMATION EMAIL (fire-and-forget) ─── */
      if (draft.email && (await appBookingEmailsEnabled(admin))) {
        const apptDate = new Date(commitResult.appointment.starts_at);
        const dateLabel = apptDate.toLocaleString("es-PR", {
          weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
          timeZone: "America/Puerto_Rico",
        });
        const { data: barberRow } = await admin
          .from("barbers")
          .select("name")
          .eq("id", draft.barber_id)
          .maybeSingle();
        admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "booking-confirmation",
            recipientEmail: draft.email,
            // Native bookings have no Acuity id: key on the appointment so each paid booking gets its own email.
            idempotencyKey: `booking-paid-${commitResult.acuityId ?? commitResult.appointmentId}`,
            templateData: {
              clientName: draft.first_name,
              serviceName: commitResult.appointment.service_name,
              barberName: barberRow?.name,
              appointmentDate: dateLabel,
              totalLabel: `$${(amountPaidCents / 100).toFixed(2)}`,
              isPaid: true,
            },
          },
        }).catch((e) => console.error("Paid email send failed:", e));
      }

      return jsonRes({
        success: true,
        alreadyCommitted: commitResult.alreadyCommitted,
        appointmentId: commitResult.appointmentId,
        acuityId: commitResult.acuityId,
        clientId: clientIdFinal,
        isReturning,
        returningName,
        cardOnFile,
        appointment: commitResult.appointment,
      });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: check-stripe-checkout-status
       Poll-first commit path for hosted Stripe Checkout (replaces the legacy
       legacy embedded-PaymentElement actions removed in Phase 1).
       BookingConfirming polls this after Stripe redirects to /citas/confirmando.
       Mirrors the check-ath-status pattern: idempotent on draft.status, commits
       inline as soon as Stripe reports the session as paid. The stripe-webhook
       (checkout.session.completed) is the backstop, not the primary path.
       ═══════════════════════════════════════════════════════════ */
    if (action === "check-stripe-checkout-status") {
      const { draftId, sessionId } = body;
      const STRIPE_LOG = "[check-stripe-checkout-status]";
      if (!draftId || typeof draftId !== "string") {
        return jsonRes({ success: false, error: "missing_draft_id" }, 400);
      }
      if (!sessionId || typeof sessionId !== "string") {
        return jsonRes({ success: false, error: "missing_session_id" }, 400);
      }

      console.log(`${STRIPE_LOG} ▶ START draft=${draftId} session=${sessionId}`);

      // 1. Load draft
      const { data: draft, error: draftErr } = await admin
        .from("booking_drafts")
        .select("id, status, appointment_id, failure_reason, stripe_checkout_session_id")
        .eq("id", draftId)
        .maybeSingle();

      if (draftErr) {
        console.error(`${STRIPE_LOG} ✖ draft fetch error:`, draftErr);
        return jsonRes({ success: false, error: "draft_fetch_failed" }, 500);
      }
      if (!draft) {
        console.warn(`${STRIPE_LOG} ✖ draft_not_found id=${draftId}`);
        return jsonRes({ success: false, error: "draft_not_found" }, 404);
      }

      // 2. Idempotent terminal states
      if (draft.status === "committed") {
        console.log(`${STRIPE_LOG} ⟳ draft already committed appt=${draft.appointment_id}`);
        return jsonRes({
          success: true,
          status: "committed",
          appointment_id: draft.appointment_id,
        });
      }
      if (draft.status === "failed" || draft.status === "refunded" || draft.status === "expired") {
        console.log(`${STRIPE_LOG} ⟳ draft terminal status=${draft.status}`);
        return jsonRes({
          success: true,
          status: draft.status,
          reason: draft.failure_reason || null,
        });
      }

      // 3. Retrieve Stripe Checkout session
      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
      let session: Stripe.Checkout.Session;
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId, {
          expand: ["payment_intent"],
        });
      } catch (e) {
        console.error(`${STRIPE_LOG} ✖ session retrieve failed:`, (e as Error).message);
        return jsonRes({ success: false, status: "polling", error: "stripe_unreachable" }, 502);
      }

      const sStatus = String(session.status || "").toLowerCase();
      const pStatus = String(session.payment_status || "").toLowerCase();
      const piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || "";
      console.log(`${STRIPE_LOG} session.status=${sStatus} payment_status=${pStatus} pi=${piId}`);

      // 4. Branch on session status
      if (sStatus === "complete" && (pStatus === "paid" || pStatus === "no_payment_required")) {
        console.log(`${STRIPE_LOG} COMPLETE+paid — committing inline`);

        // Try to capture which Stripe sub-type the customer actually used
        // (card / apple_pay / google_pay / link / klarna) so it lands on the
        // appointment + transaction + client.preferred_payment_method.
        let pmType: string | null = null;
        try {
          if (piId) {
            const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] });
            const pm = pi.payment_method as { type?: string; card?: { wallet?: { type?: string } } } | null;
            // Wallet sub-type (apple_pay / google_pay / link) lives under card.wallet.type
            pmType = pm?.card?.wallet?.type || pm?.type || null;
          }
        } catch (e) {
          console.warn(`${STRIPE_LOG} could not fetch payment_method for pi=${piId}: ${(e as Error).message}`);
        }

        try {
          const result = await commitDraft(admin, draftId, piId, "stripe-checkout-poll", "stripe", pmType);
          return jsonRes({
            success: true,
            status: "committed",
            appointment_id: result.appointmentId,
          });
        } catch (e) {
          console.error(`${STRIPE_LOG} ✖ commit-inline failed:`, (e as Error).message);
          return jsonRes(
            { success: false, status: "polling", error: "commit_failed", message: (e as Error).message },
            500,
          );
        }
      }

      if (sStatus === "open") {
        // User is still on Stripe Checkout (or just landed back from cancel).
        return jsonRes({ success: true, status: "polling", session_status: sStatus, payment_status: pStatus });
      }

      if (sStatus === "expired") {
        console.log(`${STRIPE_LOG} session expired — marking draft expired`);
        await admin
          .from("booking_drafts")
          .update({ status: "expired", failure_reason: "stripe_checkout_expired" })
          .eq("id", draftId)
          .eq("status", "pending");
        return jsonRes({ success: true, status: "expired", reason: "stripe_checkout_expired" });
      }

      // Unknown / failed
      console.warn(`${STRIPE_LOG} ⚠ unexpected status combo session=${sStatus} payment=${pStatus}`);
      return jsonRes({
        success: true,
        status: "failed",
        reason: `stripe_status_${sStatus || "unknown"}_${pStatus || "unknown"}`,
      });
    }


    /* ═══════════════════════════════════════════════════════════
       ACTION: prepare-paypal-order
       ═══════════════════════════════════════════════════════════ */
    if (action === "prepare-paypal-order") {
      const { draftId } = body;
      if (!draftId) return jsonRes({ error: "Missing draftId" }, 400);

      const { data: draft } = await admin
        .from("booking_drafts")
        .select("id, total_cents, status")
        .eq("id", draftId)
        .maybeSingle();
      if (!draft) return jsonRes({ error: "Draft not found" }, 404);
      if (draft.status !== "pending") return jsonRes({ error: "Draft not pending" }, 400);

      const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
      const secret = Deno.env.get("PAYPAL_SECRET") || "";
      const base = "https://api-m.paypal.com";

      const authRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      if (!authRes.ok) {
        const errBody = await authRes.text();
        console.error(`[pay-then-book] PayPal auth failed status=${authRes.status} body=${errBody}`);
        return jsonRes({ error: "PayPal auth failed", status: authRes.status, details: errBody }, 502);
      }
      const { access_token } = await authRes.json();

      const orderRes = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: { currency_code: "USD", value: (draft.total_cents / 100).toFixed(2) },
            custom_id: draftId,
          }],
        }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) return jsonRes({ error: "PayPal order failed", details: order }, 502);
      // Bind the order to this draft so capture-paypal only captures our own orders.
      await admin.from("booking_drafts").update({ paypal_order_id: order.id }).eq("id", draftId).eq("status", "pending");
      return jsonRes({ orderID: order.id });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: capture-paypal
       Captures the PayPal order (must be done before commit-and-book)
       ═══════════════════════════════════════════════════════════ */
    if (action === "capture-paypal") {
      const { orderID } = body;
      if (!orderID) return jsonRes({ error: "Missing orderID" }, 400);
      // Only capture orders created by this app for a booking draft.
      const { data: ppDraft } = await admin
        .from("booking_drafts")
        .select("id, status")
        .eq("paypal_order_id", String(orderID))
        .maybeSingle();
      if (!ppDraft || !["pending", "processing"].includes(String(ppDraft.status))) {
        return jsonRes({ error: "Unknown PayPal order" }, 404);
      }
      const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
      const secret = Deno.env.get("PAYPAL_SECRET") || "";
      const base = "https://api-m.paypal.com";
      const authRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      if (!authRes.ok) {
        const errBody = await authRes.text();
        console.error(`[pay-then-book/capture] PayPal auth failed status=${authRes.status} body=${errBody}`);
        return jsonRes({ error: "PayPal auth failed", status: authRes.status, details: errBody }, 502);
      }
      const { access_token } = await authRes.json();
      const capRes = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
      });
      const capData = await capRes.json();
      if (!capRes.ok || capData.status !== "COMPLETED") {
        return jsonRes({ error: "PayPal capture failed", details: capData }, 502);
      }
      return jsonRes({ success: true, orderID });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: prepare-paypal-redirect
       Server-side PayPal Orders v2 with full-page redirect (no popup).
       Mirrors the AthMovilRestButton precedent: client receives an
       approveUrl + draftId, navigates window.location.href away to
       PayPal, customer approves, PayPal redirects back to
       /citas/confirmando?draftId=...&paypal_token=ORDERID, where
       BookingConfirming polls check-paypal-status until terminal.
       ═══════════════════════════════════════════════════════════ */
    if (action === "prepare-paypal-redirect") {
      const { draftId, returnOrigin } = body;
      if (!draftId) return jsonRes({ error: "missing_draft_id" }, 400);
      if (!returnOrigin || typeof returnOrigin !== "string") {
        return jsonRes({ error: "missing_return_origin" }, 400);
      }

      const { data: draft } = await admin
        .from("booking_drafts")
        .select("id, total_cents, status")
        .eq("id", draftId)
        .maybeSingle();
      if (!draft) return jsonRes({ error: "draft_not_found" }, 404);
      if (draft.status !== "pending") return jsonRes({ error: "draft_not_pending" }, 400);

      const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
      const secret = Deno.env.get("PAYPAL_SECRET") || "";
      const base = "https://api-m.paypal.com";

      const authRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      if (!authRes.ok) {
        const errBody = await authRes.text();
        console.error(`[prepare-paypal-redirect] auth failed ${authRes.status} ${errBody}`);
        return jsonRes({ error: "paypal_auth_failed" }, 502);
      }
      const { access_token } = await authRes.json();

      // Sanitize returnOrigin — must be https and bare origin (no path).
      let safeOrigin: string;
      try {
        const u = new URL(returnOrigin);
        safeOrigin = u.origin;
        if (!(await guardOrigin(admin, safeOrigin))) {
          return jsonRes({ error: "invalid_return_origin" }, 400);
        }
      } catch (_) {
        return jsonRes({ error: "invalid_return_origin" }, 400);
      }
      const returnUrl = `${safeOrigin}/citas/confirmando?draftId=${encodeURIComponent(draftId)}&paypal_return=1`;
      const cancelUrl = `${safeOrigin}/citas/confirmando?draftId=${encodeURIComponent(draftId)}&paypal_cancel=1`;

      const orderRes = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: { currency_code: "USD", value: (draft.total_cents / 100).toFixed(2) },
            custom_id: draftId,
          }],
          application_context: {
            return_url: returnUrl,
            cancel_url: cancelUrl,
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
            brand_name: "Charlie's Barbershop",
          },
        }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok || !order?.id) {
        console.error(`[prepare-paypal-redirect] order failed`, order);
        return jsonRes({ error: "paypal_order_failed", details: order }, 502);
      }
      const approveLink = (order.links || []).find((l: { rel: string; href: string }) => l.rel === "approve" || l.rel === "payer-action");
      if (!approveLink?.href) {
        console.error(`[prepare-paypal-redirect] no approve link`, order);
        return jsonRes({ error: "no_approve_link" }, 502);
      }

      // Persist orderID on the draft so check-paypal-status can find it.
      const { error: updErr } = await admin
        .from("booking_drafts")
        .update({ paypal_order_id: order.id })
        .eq("id", draftId)
        .eq("status", "pending");
      if (updErr) {
        console.error(`[prepare-paypal-redirect] update draft failed`, updErr);
        return jsonRes({ error: "draft_update_failed" }, 500);
      }

      return jsonRes({ success: true, approveUrl: approveLink.href, orderID: order.id });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: check-paypal-status
       Recovery + finalize path for the PayPal redirect flow.
       Mirrors check-ath-status:
         1. Returns terminal immediately if draft already committed/failed/refunded.
         2. Looks up paypal_order_id on the draft.
         3. Reads order from PayPal. If APPROVED → captures, then commits.
            If COMPLETED → commits (race recovery). If VOIDED → marks failed.
         4. CREATED/PAYER_ACTION_REQUIRED → returns pending.
       Public — draftId is the secret, idempotent.
       ═══════════════════════════════════════════════════════════ */
    if (action === "check-paypal-status") {
      const { draftId } = body;
      if (!draftId || typeof draftId !== "string") {
        return jsonRes({ success: false, error: "missing_draft_id" }, 400);
      }
      const PP_LOG = "[check-paypal-status]";
      console.log(`${PP_LOG} ▶ START draftId=${draftId}`);

      const { data: draft, error: draftErr } = await admin
        .from("booking_drafts")
        .select("id, status, paypal_order_id, total_cents, tip_cents, appointment_id, failure_reason")
        .eq("id", draftId)
        .maybeSingle();

      if (draftErr) return jsonRes({ success: false, error: "draft_fetch_failed" }, 500);
      if (!draft) return jsonRes({ success: false, error: "draft_not_found" }, 404);

      if (draft.status === "committed") {
        return jsonRes({ success: true, status: "committed", appointment_id: draft.appointment_id });
      }
      if (draft.status === "failed" || draft.status === "refunded") {
        return jsonRes({ success: true, status: draft.status, reason: draft.failure_reason || null });
      }
      if (!draft.paypal_order_id) {
        return jsonRes({ success: true, status: "pending", reason: "paypal_not_initiated" });
      }

      const clientIdEnv = Deno.env.get("PAYPAL_CLIENT_ID") || "";
      const secretEnv = Deno.env.get("PAYPAL_SECRET") || "";
      const base = "https://api-m.paypal.com";
      const authRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${clientIdEnv}:${secretEnv}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      if (!authRes.ok) {
        console.error(`${PP_LOG} ✖ PayPal auth failed ${authRes.status}`);
        return jsonRes({ success: false, error: "paypal_unreachable" }, 502);
      }
      const { access_token } = await authRes.json();

      // Fetch the order
      const orderRes = await fetch(`${base}/v2/checkout/orders/${draft.paypal_order_id}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const order = await orderRes.json();
      if (!orderRes.ok) {
        console.error(`${PP_LOG} ✖ order fetch failed`, order);
        return jsonRes({ success: false, error: "paypal_unreachable" }, 502);
      }
      const status = String(order?.status || "").toUpperCase();
      console.log(`${PP_LOG} order status=${status}`);

      // Idempotent commit via shared helper (mirrors ATH check-ath-status).
      // We've already verified + captured the order at the PayPal API above,
      // so we skip commit-and-book's HTTP self-call (which re-reads the order
      // and can race: capture returns COMPLETED but a follow-up read may still
      // report APPROVED for a few seconds → spurious "failed" in the UI even
      // though the money was captured and the appointment will be created).
      const commit = async () => {
        const result = await commitDraft(
          admin,
          draftId,
          draft.paypal_order_id!,
          "paypal-status-check",
          "paypal",
        );
        return { appointmentId: result.appointmentId, alreadyCommitted: result.alreadyCommitted };
      };

      if (status === "APPROVED") {
        console.log(`${PP_LOG} APPROVED — capturing then committing`);
        const capRes = await fetch(`${base}/v2/checkout/orders/${draft.paypal_order_id}/capture`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        });
        const capData = await capRes.json();
        if (!capRes.ok || capData?.status !== "COMPLETED") {
          const issues: Array<{ issue?: string }> = capData?.details || [];
          const alreadyCap = issues.some((d) => d?.issue === "ORDER_ALREADY_CAPTURED");
          const recoverable = issues.some((d) =>
            d?.issue === "INSTRUMENT_DECLINED" ||
            d?.issue === "PAYER_ACTION_REQUIRED" ||
            d?.issue === "ORDER_NOT_APPROVED"
          );
          if (!alreadyCap) {
            if (recoverable) {
              console.warn(`${PP_LOG} capture recoverable — keep polling`, issues);
              return jsonRes({ success: true, status: "pending", paypal_status: "AWAITING_PAYER" });
            }
            console.error(`${PP_LOG} ✖ capture failed`, capData);
            await admin.from("booking_drafts").update({
              status: "failed",
              failure_reason: `paypal_capture_failed: ${capData?.name || capRes.status}`,
            }).eq("id", draftId).eq("status", "pending");
            return jsonRes({ success: false, status: "failed", error: "paypal_capture_failed" });
          }
        }
        try {
          const r = await commit();
          return jsonRes({ success: true, status: "committed", appointment_id: r.appointmentId });
        } catch (e) {
          console.error(`${PP_LOG} ✖ commit failed`, (e as Error).message);
          const { data: latest } = await admin
            .from("booking_drafts").select("status, failure_reason, appointment_id").eq("id", draftId).maybeSingle();
          // Race recovery: a concurrent poll may have already finished.
          if (latest?.status === "committed" && latest.appointment_id) {
            return jsonRes({ success: true, status: "committed", appointment_id: latest.appointment_id });
          }
          return jsonRes({
            success: false,
            status: latest?.status === "refunded" ? "refunded" : "failed",
            reason: latest?.failure_reason || (e as Error).message,
          });
        }
      }

      if (status === "COMPLETED") {
        // Capture already happened (concurrent poll). Just commit idempotently.
        try {
          const r = await commit();
          return jsonRes({ success: true, status: "committed", appointment_id: r.appointmentId });
        } catch (e) {
          const { data: latest } = await admin
            .from("booking_drafts").select("status, failure_reason, appointment_id").eq("id", draftId).maybeSingle();
          if (latest?.status === "committed" && latest.appointment_id) {
            return jsonRes({ success: true, status: "committed", appointment_id: latest.appointment_id });
          }
          return jsonRes({
            success: false,
            status: latest?.status === "refunded" ? "refunded" : "failed",
            reason: latest?.failure_reason || (e as Error).message,
          });
        }
      }

      if (status === "VOIDED") {
        await admin.from("booking_drafts").update({
          status: "failed",
          failure_reason: "paypal_voided",
        }).eq("id", draftId).eq("status", "pending");
        return jsonRes({ success: true, status: "failed", reason: "paypal_voided" });
      }

      // CREATED, SAVED, PAYER_ACTION_REQUIRED → still waiting for the user.
      return jsonRes({ success: true, status: "pending", paypal_status: status });
    }

    if (action === "prepare-ath") {
      const { draftId, phoneNumber } = body;
      if (!draftId) return jsonRes({ error: "Missing draftId" }, 400);
      const { data: draft } = await admin
        .from("booking_drafts")
        .select("id, status, phone")
        .eq("id", draftId)
        .maybeSingle();
      if (!draft) return jsonRes({ error: "Draft not found" }, 404);
      if (draft.status !== "pending") return jsonRes({ error: "Draft not pending" }, 400);
      const publicToken = Deno.env.get("ATH_MOVIL_PUBLIC_TOKEN") ?? "";
      // Echo back a normalized 10-digit phone for the SDK push notification.
      const rawPhone = String(phoneNumber || draft.phone || "");
      const phoneNorm = rawPhone.replace(/\D/g, "").slice(-10);
      return jsonRes({ publicToken, phoneNumber: phoneNorm });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: get-public-config
       ═══════════════════════════════════════════════════════════ */
    if (action === "get-public-config") {
      return jsonRes({
        paypal_client_id: Deno.env.get("PAYPAL_CLIENT_ID") || "",
        athmovil_public_token: Deno.env.get("ATH_MOVIL_PUBLIC_TOKEN") || "",
      });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: check-ath-status
       Recovery path for ATH REST flow. After the customer authorizes
       in the ATH app, transactions sit in CONFIRM until the merchant
       calls /authorization. ATH's webhook only fires AFTER /authorization
       returns COMPLETED. This action:
         1. Returns early if draft already terminal (committed/failed/refunded)
         2. Calls ATH /findPayment with stored ecommerceId
         3. CONFIRM → calls /authorization with stored auth_token (JWT bearer)
                     → on COMPLETED, calls commitDraft inline
         4. COMPLETED (race) → calls commitDraft inline
         5. CANCEL/EXPIRED → marks draft failed
         6. OPEN/PENDING → returns pending so frontend keeps polling
       Public action — draftId is the secret. No JWT required.
       ═══════════════════════════════════════════════════════════ */
    if (action === "check-ath-status") {
      const { draftId } = body;
      if (!draftId || typeof draftId !== "string") {
        return jsonRes({ success: false, error: "missing_draft_id" }, 400);
      }

      console.log(`${CHECK_LOG} ▶ START draftId=${draftId}`);

      // 1. Load draft
      const { data: draft, error: draftErr } = await admin
        .from("booking_drafts")
        .select("id, status, ath_ecommerce_id, ath_auth_token, appointment_id, failure_reason")
        .eq("id", draftId)
        .maybeSingle();

      if (draftErr) {
        console.error(`${CHECK_LOG} ✖ draft fetch error:`, draftErr);
        return jsonRes({ success: false, error: "draft_fetch_failed" }, 500);
      }
      if (!draft) {
        console.warn(`${CHECK_LOG} ✖ draft_not_found id=${draftId}`);
        return jsonRes({ success: false, error: "draft_not_found" }, 404);
      }

      // 2. Already terminal — return immediately
      if (draft.status === "committed") {
        console.log(`${CHECK_LOG} ⟳ draft already committed appt=${draft.appointment_id}`);
        return jsonRes({
          success: true,
          status: "committed",
          appointment_id: draft.appointment_id,
        });
      }
      if (draft.status === "failed" || draft.status === "refunded") {
        console.log(`${CHECK_LOG} ⟳ draft terminal status=${draft.status}`);
        return jsonRes({
          success: true,
          status: draft.status,
          reason: draft.failure_reason || null,
        });
      }

      // 3. ATH not yet initiated — frontend should keep polling
      if (!draft.ath_ecommerce_id || !draft.ath_auth_token) {
        console.log(`${CHECK_LOG} draft pending, ATH not initiated yet (ecommerceId=${!!draft.ath_ecommerce_id} authToken=${!!draft.ath_auth_token})`);
        return jsonRes({
          success: true,
          status: "pending",
          reason: "ath_not_initiated",
        });
      }

      const publicToken = Deno.env.get("ATH_MOVIL_PUBLIC_TOKEN");
      const privateToken = Deno.env.get("ATH_MOVIL_PRIVATE_TOKEN");
      if (!publicToken || !privateToken) {
        console.error(`${CHECK_LOG} ✖ ATH tokens not configured`);
        return jsonRes({ success: false, error: "server_misconfigured" }, 500);
      }

      // 4. Call /findPayment
      let findData: Record<string, unknown> | null = null;
      let findStatus = 0;
      try {
        console.log(`${CHECK_LOG} → POST /findPayment ecommerceId=${draft.ath_ecommerce_id}`);
        const findRes = await fetch(ATH_FIND_PAYMENT_URL, {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            privateToken,
            ecommerceId: draft.ath_ecommerce_id,
          }),
        });
        findStatus = findRes.status;
        const findText = await findRes.text();
        try { findData = JSON.parse(findText); } catch { findData = { raw: findText.slice(0, 500) }; }
        console.log(`${CHECK_LOG} ← /findPayment status=${findStatus} body=${JSON.stringify(findData).slice(0, 600)}`);
      } catch (e) {
        console.error(`${CHECK_LOG} ✖ /findPayment network error:`, e);
        return jsonRes({ success: false, error: "ath_unreachable" }, 502);
      }

      if (findStatus < 200 || findStatus >= 300) {
        console.error(`${CHECK_LOG} ✖ /findPayment HTTP ${findStatus}`);
        return jsonRes({ success: false, error: "ath_unreachable" }, 502);
      }

      const findPayload = (findData?.data ?? findData) as { ecommerceStatus?: string } | undefined;
      const ecommerceStatus = String(findPayload?.ecommerceStatus || "").toUpperCase();
      console.log(`${CHECK_LOG} ecommerceStatus=${ecommerceStatus}`);

      // 5. Branch on status
      if (ecommerceStatus === "COMPLETED") {
        // Race: webhook hasn't fired yet but ATH already finalized. Commit now.
        console.log(`${CHECK_LOG} COMPLETED race — committing inline`);
        try {
          const result = await commitDraft(admin, draftId, draft.ath_ecommerce_id, "status-check");
          // Persist ATH's own reference so the later webhook recognizes this payment.
          const athRef = String((findPayload as any)?.referenceNumber || (findPayload as any)?.dailyTransactionId || "");
          if (athRef) {
            await admin.from("transactions").update({ ath_reference_number: athRef })
              .eq("athmovil_transaction_id", draft.ath_ecommerce_id).is("ath_reference_number", null);
          }
          return jsonRes({
            success: true,
            status: "committed",
            appointment_id: result.appointmentId,
          });
        } catch (e) {
          console.error(`${CHECK_LOG} ✖ commit-inline failed:`, (e as Error).message);
          return jsonRes({ success: false, status: "pending", error: "commit_failed", message: (e as Error).message }, 500);
        }
      }

      if (ecommerceStatus === "CONFIRM") {
        // Customer authorized in ATH app — call /authorization to push to COMPLETED.
        // Per ATH docs: empty body, JWT bearer header. Logged verbosely for diagnosis.
        console.log(`${CHECK_LOG} CONFIRM — calling /authorization with auth_token (${draft.ath_auth_token.length} chars)`);

        let authData: Record<string, unknown> | null = null;
        let authHttpStatus = 0;
        try {
          const reqHeaders: Record<string, string> = {
            "Accept": "application/json",
            "Authorization": `Bearer ${draft.ath_auth_token}`,
            "Content-Type": "application/json",
          };
          console.log(`${CHECK_LOG} → POST /authorization headers=${JSON.stringify({ ...reqHeaders, Authorization: `Bearer ${draft.ath_auth_token.slice(0, 12)}…` })} body=""`);

          const authRes = await fetch(ATH_AUTHORIZATION_URL, {
            method: "POST",
            headers: reqHeaders,
            body: "",
          });
          authHttpStatus = authRes.status;
          const authText = await authRes.text();
          try { authData = JSON.parse(authText); } catch { authData = { raw: authText.slice(0, 500) }; }
          console.log(`${CHECK_LOG} ← /authorization status=${authHttpStatus} body=${JSON.stringify(authData).slice(0, 600)}`);
        } catch (e) {
          console.error(`${CHECK_LOG} ✖ /authorization network error:`, e);
          return jsonRes({ success: false, error: "ath_unreachable" }, 502);
        }

        const authPayload = (authData?.data ?? authData) as { ecommerceStatus?: string } | undefined;
        const authStatusField = String((authData?.status as string | undefined) || "").toLowerCase();
        const authEcommerceStatus = String(authPayload?.ecommerceStatus || "").toUpperCase();

        if (authHttpStatus >= 200 && authHttpStatus < 300 && authStatusField === "success" && authEcommerceStatus === "COMPLETED") {
          console.log(`${CHECK_LOG} ✔ /authorization → COMPLETED, committing inline`);
          try {
            const result = await commitDraft(admin, draftId, draft.ath_ecommerce_id, "status-check");
            return jsonRes({
              success: true,
              status: "committed",
              appointment_id: result.appointmentId,
            });
          } catch (e) {
            console.error(`${CHECK_LOG} ✖ commit-inline failed after authorization:`, (e as Error).message);
            return jsonRes({ success: false, status: "pending", error: "commit_failed", message: (e as Error).message }, 500);
          }
        }

        // /authorization rejected — mark failed
        const failReason = `ath_authorization_failed: HTTP ${authHttpStatus} status=${authStatusField} ecommerceStatus=${authEcommerceStatus}`;
        console.error(`${CHECK_LOG} ✖ ${failReason} fullBody=${JSON.stringify(authData).slice(0, 400)}`);
        await admin
          .from("booking_drafts")
          .update({ status: "failed", failure_reason: failReason })
          .eq("id", draftId)
          .eq("status", "pending");
        return jsonRes({ success: false, status: "failed", error: failReason });
      }

      if (ecommerceStatus === "CANCEL" || ecommerceStatus === "EXPIRED") {
        const failReason = `ath_${ecommerceStatus.toLowerCase()}`;
        console.log(`${CHECK_LOG} ${ecommerceStatus} — marking draft failed`);
        await admin
          .from("booking_drafts")
          .update({ status: "failed", failure_reason: failReason })
          .eq("id", draftId)
          .eq("status", "pending");
        return jsonRes({ success: true, status: "failed", reason: failReason });
      }

      if (ecommerceStatus === "OPEN" || ecommerceStatus === "PENDING") {
        console.log(`${CHECK_LOG} ${ecommerceStatus} — customer hasn't authorized yet, frontend keeps polling`);
        return jsonRes({ success: true, status: "pending", ath_status: ecommerceStatus });
      }

      // Unknown status — surface but keep polling
      console.warn(`${CHECK_LOG} ⚠ unknown ecommerceStatus=${ecommerceStatus} fullBody=${JSON.stringify(findData).slice(0, 400)}`);
      return jsonRes({ success: true, status: "pending", ath_status: ecommerceStatus || "unknown" });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: get-booking-details
       Public read for the confirmation popup. Server-side uses service role
       to bypass RLS (browser anon role cannot read booking_drafts/appointments).
       Returns minimal, non-sensitive fields only.
       =══════════════════════════════════════════════════════════ */
    if (action === "get-booking-details") {
      const draftId = String(body.draftId || "");
      if (!draftId) return jsonRes({ error: "draftId required" }, 400);

      const { data: draft } = await admin
        .from("booking_drafts")
        .select("id, status, first_name, appointment_id, failure_reason, email, client_id")
        .eq("id", draftId)
        .maybeSingle();

      if (!draft) return jsonRes({ error: "draft_not_found" }, 404);

      // If not yet committed, just return draft status — frontend keeps polling.
      if (draft.status !== "committed" || !draft.appointment_id) {
        return jsonRes({
          success: true,
          status: draft.status,
          first_name: draft.first_name,
          failure_reason: draft.failure_reason,
        });
      }

      const { data: appt } = await admin
        .from("appointments")
        .select("id, starts_at, ends_at, service_name, price_cents, amount_paid_cents, tip_cents, barber_id, client_id")
        .eq("id", draft.appointment_id)
        .maybeSingle();

      if (!appt) {
        return jsonRes({
          success: true,
          status: "committed",
          first_name: draft.first_name,
          appointment: null,
        });
      }

      const { data: barber } = await admin
        .from("barbers")
        .select("name")
        .eq("id", appt.barber_id)
        .maybeSingle();

      // Look up the latest completed transaction tied to this appointment so we
      // can surface the actual payment method + ATH reference number on the
      // confirmation screen. Newest row wins (handles add-on top-ups, refunds, etc.).
      const { data: txn } = await admin
        .from("transactions")
        .select("payment_method, ath_reference_number, created_at")
        .eq("appointment_id", appt.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Account-claim status: can the user create a password from this booking?
      // Only when we have an email AND the linked client has no auth account yet.
      // Fall back to appointment.client_id since drafts don't always store it.
      let canClaimAccount = false;
      let isReturningGuest = false;
      const resolvedClientId = draft.client_id || appt.client_id;
      if (draft.email && resolvedClientId) {
        const { data: client } = await admin
          .from("clients")
          .select("auth_user_id, total_visits")
          .eq("id", resolvedClientId)
          .maybeSingle();
        if (client && !client.auth_user_id) {
          canClaimAccount = true;
          isReturningGuest = (client.total_visits || 0) > 1;
        }
      }

      return jsonRes({
        success: true,
        status: "committed",
        first_name: draft.first_name,
        email: draft.email,
        client_id: resolvedClientId,
        can_claim_account: canClaimAccount,
        is_returning_guest: isReturningGuest,
        payment_method: txn?.payment_method ?? null,
        ath_reference_number: txn?.ath_reference_number ?? null,
        appointment: {
          id: appt.id,
          starts_at: appt.starts_at,
          ends_at: appt.ends_at,
          service_name: appt.service_name,
          // Total actually charged (service + tip). Falls back to price_cents
          // for legacy rows that didn't capture amount_paid_cents.
          price_cents: (appt.amount_paid_cents && appt.amount_paid_cents > 0)
            ? appt.amount_paid_cents
            : appt.price_cents,
          barber_name: barber?.name || "",
        },
      });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: claim-account
       Creates a password-based auth user from a committed booking draft,
       links the existing guest client row, assigns 'client' role, and
       returns a session the browser can install via setSession().
       Requires: draftId, password (>= 8 chars). Email comes from the draft.
       ═══════════════════════════════════════════════════════════ */
    if (action === "claim-account") {
      const draftId = String(body.draftId || "");
      const password = String(body.password || "");
      if (!draftId || password.length < 8) {
        return jsonRes({ error: "draftId and password (min 8 chars) required" }, 400);
      }

      const { data: draft } = await admin
        .from("booking_drafts")
        .select("id, status, email, first_name, last_name, phone, client_id, appointment_id")
        .eq("id", draftId)
        .maybeSingle();

      if (!draft || draft.status !== "committed") {
        return jsonRes({ error: "Booking not found or not committed" }, 404);
      }
      if (!draft.email) return jsonRes({ error: "No email on booking" }, 400);

      // Resolve client_id: drafts don't always store it after commit; fall back to appointment.
      let resolvedClientId: string | null = draft.client_id || null;
      if (!resolvedClientId && draft.appointment_id) {
        const { data: appt } = await admin
          .from("appointments")
          .select("client_id")
          .eq("id", draft.appointment_id)
          .maybeSingle();
        resolvedClientId = appt?.client_id || null;
      }
      if (!resolvedClientId) return jsonRes({ error: "No client linked to booking" }, 400);

      const emailLc = draft.email.toLowerCase().trim();

      // Block if a user already exists with this email — they should sign in instead.
      const { data: clientRow } = await admin
        .from("clients")
        .select("id, auth_user_id")
        .eq("id", resolvedClientId)
        .maybeSingle();
      if (clientRow?.auth_user_id) {
        return jsonRes({ error: "account_already_exists", message: "An account already exists for this booking. Please sign in." }, 409);
      }

      // Create the auth user (auto-confirmed so they can sign in immediately).
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: emailLc,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: [draft.first_name, draft.last_name].filter(Boolean).join(" "),
          phone: draft.phone,
        },
      });
      if (createErr || !created?.user?.id) {
        const msg = createErr?.message || "could not create user";
        // If the email is already registered in auth, surface a friendly error.
        if (/already.*registered|already exists/i.test(msg)) {
          return jsonRes({ error: "email_taken", message: "Ya existe una cuenta con este email. Inicia sesión." }, 409);
        }
        return jsonRes({ error: "create_failed", message: msg }, 500);
      }

      const newUserId = created.user.id;

      // Link the existing client row to the new auth user.
      await admin
        .from("clients")
        .update({
          auth_user_id: newUserId,
          is_guest: false,
          account_verified: true,
        })
        .eq("id", resolvedClientId);

      // Assign 'client' role (idempotent).
      await admin
        .from("user_roles")
        .upsert({ user_id: newUserId, role: "client" }, { onConflict: "user_id,role" });

      // Issue a session by signing in with the password just set.
      // We use a fresh anon client so we don't pollute the admin client.
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!
      );
      const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
        email: emailLc,
        password,
      });
      if (signInErr || !signInData.session) {
        // Account is created — frontend can fall back to signing in manually.
        return jsonRes({
          success: true,
          account_created: true,
          session: null,
          message: signInErr?.message || "Account created; please sign in.",
        });
      }

      return jsonRes({
        success: true,
        account_created: true,
        session: {
          access_token: signInData.session.access_token,
          refresh_token: signInData.session.refresh_token,
        },
      });
    }

    /* ═══════════════════════════════════════════════════════════
       ACTION: debug-log
       Temporary diagnostic ingester for client-side instrumentation
       (e.g. barber-photo audit). Public action — no auth required.
       Insert-only, capped payload size, owner-readable via RLS.
       Remove this action and the debug_logs table once the audit
       is complete.
       ═══════════════════════════════════════════════════════════ */
    if (action === "debug-log") {
      const tag = String(body.tag || "").slice(0, 80);
      const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
      if (!tag) return jsonRes({ error: "tag required" }, 400);
      const ua = req.headers.get("user-agent")?.slice(0, 300) || null;
      try {
        await admin.from("debug_logs").insert({ tag, payload, user_agent: ua });
      } catch (e) {
        console.error("debug-log insert failed:", e);
      }
      return jsonRes({ ok: true });
    }

    return jsonRes({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("pay-then-book error:", err);
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
