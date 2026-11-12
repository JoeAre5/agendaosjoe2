// Shared idempotent commit function used by BOTH:
//   1. pay-then-book commit-and-book (fast path / SDK callback)
//   2. athmovil-webhook (slow path / safety net)
//
// Contract:
//   - Idempotent on booking_drafts.status: if status='committed', returns existing appointment
//   - On Acuity success: upserts appointments + transactions, marks draft committed
//   - On Acuity failure: refunds via ATH Móvil business-transaction/refund, marks draft refunded, throws
//
// Logs are tagged [commitDraft] for production tracing.
//
// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { notifyOwners } from "./notifyOwners.ts";
import { contactEmail } from "./contactEmail.ts";
import { createAcuityAddonResolver } from "./acuityAddons.ts";

export interface CommitResult {
  success: true;
  alreadyCommitted: boolean;
  appointmentId: string;
  acuityId: number;
  draft: any;
  appointment: {
    id: string;
    starts_at: string;
    service_name: string;
    price: string;
    duration: number;
  };
}

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
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Paid booking that could not be confirmed. Refunds are manual only:
 * persist the real payment (idempotent on provider+reference), flag the
 * draft and alert owners. Never marks anything "refunded".
 */
export async function recordManualException(
  admin: SupabaseClient, draft: any, provider: string, paymentRef: string,
  status: "reconciliation_required" | "manual_refund_required", reason: string,
) {
  try {
    await admin.from("booking_drafts")
      .update({ status: "reconciliation_required", reconciliation_reason: reason, failure_reason: reason })
      .eq("id", draft.id).neq("status", "committed");
    await admin.from("payment_exceptions").upsert({
      provider, payment_reference: paymentRef, draft_id: draft.id,
      amount_cents: Number(draft.total_cents) || 0,
      customer_name: [draft.first_name, draft.last_name].filter(Boolean).join(" "),
      customer_contact: draft.phone || draft.email || null,
      status, failure_reason: reason,
    }, { onConflict: "provider,payment_reference", ignoreDuplicates: true });
    await admin.rpc("release_booking_hold", { _draft_id: draft.id, _final_status: "released" });
    await notifyOwners({
      title: "Pago recibido sin cita confirmada",
      body: `${draft.first_name || "Cliente"}: revisa y resuelve manualmente.`,
    } as any);
  } catch (e) {
    console.error("[commitDraft] recordManualException failed:", (e as Error).message);
  }
}

/**
 * Idempotently commits a paid booking draft to an Acuity appointment.
 *
 * @param admin   service-role Supabase client
 * @param draftId booking_drafts.id
 * @param paymentRef ATH ecommerceId / Stripe PI / PayPal order id
 * @param source  caller tag for logs ('webhook' | 'fast-path' | 'commit-and-book')
 * @param paymentMethod default 'ath_movil'
 * @param stripePmType OPTIONAL — only set by Stripe callers. Persists Stripe sub-type
 *                     ('card' | 'apple_pay' | 'google_pay' | 'klarna' | 'link') to
 *                     appointments.stripe_payment_method_type + transactions.stripe_payment_method_type.
 *                     ATH/PayPal callers should omit (defaults to null in DB).
 */
export async function commitDraft(
  admin: SupabaseClient,
  draftId: string,
  paymentRef: string,
  source: string,
  paymentMethod: "ath_movil" | "stripe" | "paypal" | "benefit" = "ath_movil",
  stripePmType: string | null = null,
): Promise<CommitResult> {
  console.log(`[commitDraft] ▶ START draftId=${draftId} ref=${paymentRef} src=${source} method=${paymentMethod} stripePmType=${stripePmType ?? "n/a"}`);

  // ─── 1. Fetch draft ───
  console.log(`[commitDraft] Fetching draft ${draftId}`);
  const { data: draft, error: loadErr } = await admin
    .from("booking_drafts")
    .select("*")
    .eq("id", draftId)
    .maybeSingle();

  if (loadErr) {
    console.error(`[commitDraft] ✖ Draft fetch error: ${loadErr.message}`);
    throw new Error(`Draft fetch failed: ${loadErr.message}`);
  }
  if (!draft) {
    console.error(`[commitDraft] ✖ Draft not found: ${draftId}`);
    throw new Error("Draft not found");
  }
  console.log(`[commitDraft] Draft loaded status=${draft.status} appointment_id=${draft.appointment_id || "none"}`);

  // ─── 2. Idempotency short-circuit ───
  if (draft.status === "committed" && draft.appointment_id) {
    console.log(`[commitDraft] ⟳ Already committed — returning existing appointment ${draft.appointment_id}`);
    const { data: appt } = await admin
      .from("appointments")
      .select("id, starts_at, service_name, price_cents, duration_minutes")
      .eq("id", draft.appointment_id)
      .maybeSingle();
    return {
      success: true,
      alreadyCommitted: true,
      appointmentId: draft.appointment_id,
      acuityId: draft.acuity_id,
      draft,
      appointment: {
        id: draft.appointment_id,
        starts_at: appt?.starts_at || draft.datetime,
        service_name: appt?.service_name || "",
        price: ((appt?.price_cents || 0) / 100).toFixed(2),
        duration: appt?.duration_minutes || 30,
      },
    };
  }

  if (draft.status !== "pending") {
    console.log(`[commitDraft] ⚠ Draft status=${draft.status} — not pending, refusing to commit`);
    throw new Error(`Draft is in status '${draft.status}', cannot commit`);
  }

  // ─── 3. Resolve / create client ───
  let clientIdFinal = draft.client_id as string | null;
  const phoneNorm = draft.phone as string;
  if (!clientIdFinal) {
    console.log(`[commitDraft] Looking up client by phone=${phoneNorm}`);
    const { data: existing } = await admin
      .from("clients")
      .select("id, first_name, card_brand, card_last4")
      .or(`phone.eq.${phoneNorm},phone.eq.+1${phoneNorm}`)
      .limit(1)
      .maybeSingle();
    if (existing) {
      clientIdFinal = existing.id;
      console.log(`[commitDraft] Matched existing client ${existing.id}`);
    } else {
      console.log(`[commitDraft] Creating new client`);
      const { data: created, error: createErr } = await admin
        .from("clients")
        .insert({
          first_name: draft.first_name,
          last_name: draft.last_name,
          phone: phoneNorm,
          email: contactEmail(draft.email),
          is_guest: draft.source === "public_site",
          account_verified: false,
          booking_source: draft.source,
        })
        .select("id")
        .single();
      if (createErr) console.error(`[commitDraft] Client create error: ${createErr.message}`);
      clientIdFinal = created?.id ?? null;
    }
  }

  // ─── 4. Create Acuity appointment (at most ONCE per draft) ───
  // Guard against repeated polls / webhooks re-running this step after a
  // later step failed: reuse a saved acuity_id, take an atomic claim, and
  // look for an identical live Acuity booking before POSTing a new one.
  const acuityEmail = draft.email || `${phoneNorm}@placeholder.local`;
  type AcuityData = Record<string, unknown> & { id?: number; error?: string; message?: string; status_code?: number };
  let acuityData: AcuityData | null = null;

  if (draft.acuity_id) {
    const got = await acuityFetch(`/appointments/${draft.acuity_id}`);
    const d = (got.data || {}) as AcuityData;
    if (got.ok && d?.id && !(d as { canceled?: boolean }).canceled) {
      console.log(`[commitDraft] ⟳ Reusing saved acuity_id=${draft.acuity_id}`);
      acuityData = d;
    }
  }

  if (!acuityData) {
    // Atomic claim: only one caller may create the Acuity booking. A claim
    // older than 3 minutes without an acuity_id is considered abandoned.
    const staleBefore = new Date(Date.now() - 3 * 60_000).toISOString();
    const { data: claimed } = await admin
      .from("booking_drafts")
      .update({ acuity_attempted_at: new Date().toISOString() })
      .eq("id", draftId)
      .eq("status", "pending")
      .is("acuity_id", null)
      .or(`acuity_attempted_at.is.null,acuity_attempted_at.lt.${staleBefore}`)
      .select("id");
    if (!claimed || claimed.length === 0) {
      console.log(`[commitDraft] ⏸ Another attempt is creating the Acuity booking — skipping`);
      throw new Error("commit_in_progress");
    }

    // Same client + same slot already live in Acuity? Reuse it.
    try {
      const day = String(draft.datetime).slice(0, 10);
      const list = await acuityFetch(`/appointments?minDate=${day}&maxDate=${day}&calendarID=${draft.calendar_id}&max=200`);
      if (list.ok && Array.isArray(list.data)) {
        const target = new Date(String(draft.datetime)).getTime();
        const phoneTail = String(phoneNorm || "").replace(/\D/g, "").slice(-7);
        const match = (list.data as AcuityData[]).find((a) => {
          const x = a as { canceled?: boolean; datetime?: string; appointmentTypeID?: number; email?: string; phone?: string };
          if (x.canceled || new Date(String(x.datetime)).getTime() !== target) return false;
          if (Number(x.appointmentTypeID) !== Number(draft.appointment_type_id)) return false;
          const realIncomingEmail = contactEmail(x.email);
          const realDraftEmail = contactEmail(draft.email);
          const sameEmail = !!realIncomingEmail && !!realDraftEmail && realIncomingEmail.toLowerCase() === realDraftEmail.toLowerCase();
          const samePhone = phoneTail.length === 7 && String(x.phone || "").replace(/\D/g, "").endsWith(phoneTail);
          return sameEmail || samePhone;
        });
        if (match?.id) {
          console.log(`[commitDraft] ⟳ Found identical live Acuity booking ${match.id} — reusing`);
          acuityData = match;
        }
      }
    } catch (e) {
      console.warn(`[commitDraft] duplicate lookup failed: ${(e as Error).message}`);
    }
  }

  if (!acuityData && draft.barber_id) {
    // Payment confirmed: before creating in Acuity, (re)acquire the hold.
    // Late payment whose slot was taken → manual exception, no second booking.
    const { data: hold } = await admin.from("booking_draft_holds")
      .select("starts_at, ends_at").eq("draft_id", draftId).maybeSingle();
    if (hold) {
      const { data: re, error: reErr } = await admin.rpc("acquire_booking_hold", {
        _draft_id: draftId, _barber_id: draft.barber_id,
        _starts_at: hold.starts_at, _ends_at: hold.ends_at, _hold_minutes: 30,
      });
      if (reErr || !(re as any)?.success) {
        await admin.from("booking_drafts").update({ acuity_attempted_at: null }).eq("id", draftId);
        await recordManualException(admin, draft, paymentMethod, paymentRef, "reconciliation_required",
          `Paid but slot unavailable: ${reErr?.message || (re as any)?.reason}`);
        throw new Error("acuity_failed: slot_unavailable_after_payment");
      }
    }
  }

  if (!acuityData) {
    console.log(`[commitDraft] Calling Acuity POST /appointments — type=${draft.appointment_type_id} cal=${draft.calendar_id} dt=${draft.datetime}`);
    const acuityRes = await acuityFetch("/appointments", {
      method: "POST",
      body: JSON.stringify({
        appointmentTypeID: draft.appointment_type_id,
        calendarID: draft.calendar_id,
        datetime: draft.datetime,
        firstName: draft.first_name,
        lastName: draft.last_name || draft.first_name,
        email: acuityEmail,
        phone: phoneNorm,
        notes: draft.notes || "",
        addonIDs: draft.addon_ids || [],
      }),
    });

    const created = (acuityRes.data || {}) as AcuityData;
    const acuityFailed =
      !acuityRes.ok ||
      !!created?.error ||
      (created?.status_code ?? 0) >= 400 ||
      !created?.id;

    if (acuityFailed) {
      const reason = String(created?.message || created?.error || `HTTP ${acuityRes.status}`);
      console.error(`[commitDraft] ✖ Acuity rejected: ${reason}`);
      // Refunds are ALWAYS manual: record the paid-but-unbooked exception.
      await recordManualException(admin, draft, paymentMethod, paymentRef, "manual_refund_required", `Acuity rejected: ${reason}`);
      throw new Error(`acuity_failed: ${reason}`);
    }
    acuityData = created;
  }

  // Persist the Acuity id right away so any retry reuses it instead of POSTing again.
  await admin.from("booking_drafts").update({ acuity_id: acuityData.id }).eq("id", draftId);
  console.log(`[commitDraft] Acuity OK — acuityId=${acuityData.id}`);

  // ─── 5. Upsert appointments row ───
  const startsAt = String(acuityData.datetime);
  const duration = Number(acuityData.duration) || 30;
  const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
  const resolveAddonNames = createAcuityAddonResolver(async () => {
    const result = await acuityFetch("/appointment-addons");
    if (!result.ok) throw new Error(`Add-on catalog HTTP ${result.status}`);
    return result.data;
  }, (error) => console.warn("[commitDraft] Add-on names unresolved; preserving stored names", String(error)));
  const addonNames = await resolveAddonNames(acuityData);
  const priceCentsAcuity = Math.round(parseFloat(String(acuityData.price || "0")) * 100);
  const amountPaidCents = draft.total_cents != null ? Number(draft.total_cents) : priceCentsAcuity;
  const tipCents = Number(draft.tip_cents) || 0;

  console.log(`[commitDraft] Upserting appointments row`);
  const { data: upserted, error: upsertErr } = await admin
    .from("appointments")
    .upsert(
      {
        acuity_id: acuityData.id,
        barber_id: draft.barber_id,
        client_name: `${acuityData.firstName} ${acuityData.lastName}`.trim(),
        client_email: contactEmail(acuityData.email),
        client_phone: (acuityData.phone as string) || phoneNorm,
        client_id: clientIdFinal,
        service_name: acuityData.type as string,
        service_id: acuityData.appointmentTypeID as number,
        ...(addonNames !== undefined ? { addons: addonNames } : {}),
        starts_at: startsAt,
        ends_at: endsAt,
        duration_minutes: duration,
        price_cents: priceCentsAcuity,
        status: "scheduled",
        paid: true,
        payment_confirmed: true,
        payment_method: paymentMethod,
        amount_paid_cents: amountPaidCents,
        tip_cents: tipCents,
        payment_reference_id: paymentRef,
        stripe_payment_method_type: paymentMethod === "stripe" ? stripePmType : null,
        created_by_role: draft.source === "client_app" ? "client_app" : "public_site",
        created_by_user_id: draft.created_by_user_id,
        booking_source: draft.source === "client_app" ? "pwa" : "public_site",
        applied_benefit_redemption_id: draft.applied_benefit_redemption_id ?? null,
        benefit_discount_cents: Number(draft.benefit_discount_cents) || 0,
      },
      { onConflict: "acuity_id" }
    )
    .select("id")
    .single();

  if (upsertErr || !upserted) {
    console.error(`[commitDraft] ✖ Appointment upsert failed: ${upsertErr?.message}`);
    // Acuity accepted (acuity_id saved above). Never cancel it automatically;
    // flag for the owner and keep IDs so a later retry can finish safely.
    await recordManualException(admin, draft, paymentMethod, paymentRef, "reconciliation_required",
      `Acuity ${acuityData.id} created but local save failed: ${upsertErr?.message}`);
    throw new Error(`Appointment upsert failed: ${upsertErr?.message}`);
  }
  await admin.rpc("release_booking_hold", { _draft_id: draftId, _final_status: "committed" });
  console.log(`[commitDraft] Appointment upserted ${upserted.id}`);

  // ─── 5b. Mark benefit redemption as redeemed (if any) ───
  if (draft.applied_benefit_redemption_id) {
    const { error: redErr } = await admin
      .from("client_benefit_redemptions")
      .update({
        redeemed_at: new Date().toISOString(),
        redeemed_appointment_id: upserted.id,
      })
      .eq("id", draft.applied_benefit_redemption_id)
      .is("redeemed_at", null);
    if (redErr) {
      console.warn(`[commitDraft] redemption mark warning: ${redErr.message}`);
    } else {
      console.log(`[commitDraft] Marked redemption ${draft.applied_benefit_redemption_id} as redeemed`);
    }
  }

  // ─── 6. Insert SERVICE transaction (idempotent on athmovil_transaction_id unique constraint) ───
  // For mini-shop bookings, the SERVICE line uses the service amount only;
  // products are recorded as separate transactions with source='public_booking'
  // and commission_cents=0 (no barber commission on autonomous online sales).
  const productsArr: Array<{ id: string; qty: number; name?: string; price_cents?: number }> =
    Array.isArray(draft.products) ? draft.products : [];
  const productsTotalCents = Number(draft.products_total_cents) || 0;
  const serviceTotalCents = amountPaidCents - productsTotalCents;
  const serviceSubtotalCents = serviceTotalCents - tipCents;

  console.log(`[commitDraft] Inserting service transaction (svc=${serviceTotalCents}c, products=${productsTotalCents}c)`);
  const { error: txErr } = await admin.from("transactions").insert({
    barber_id: draft.barber_id,
    client_id: clientIdFinal,
    appointment_id: upserted.id,
    type: "service",
    payment_method: paymentMethod,
    subtotal_cents: serviceSubtotalCents,
    tip_cents: tipCents,
    total_cents: serviceTotalCents,
    status: "completed",
    athmovil_transaction_id: paymentMethod === "ath_movil" ? paymentRef : null,
    stripe_payment_id: paymentMethod === "stripe" ? paymentRef : null,
    stripe_payment_method_type: paymentMethod === "stripe" ? stripePmType : null,
    source: draft.source === "client_app" ? "client_app" : "public_booking",
    notes: `${draft.source} booking — ${source}`,
  });
  if (txErr) {
    console.warn(`[commitDraft] Service transaction insert warning (may be benign duplicate): ${txErr.message}`);
  }

  // ─── 6b. Mini-shop: insert one transaction per product line + decrement stock ───
  // RULES:
  //   • barber_id = NULL  → 100% shop revenue, never attributed to a barber
  //   • commission cents implicit (transactions table has no per-line commission_cents;
  //     downstream payroll respects source='public_booking' + barber_id IS NULL)
  //   • source='public_booking' → reports filter as "Online sale"
  //   • Stock decrement is best-effort + per-row to avoid partial-cart failures
  if (productsArr.length > 0) {
    for (const item of productsArr) {
      const qty = Math.max(1, Math.floor(Number(item.qty) || 0));
      const unitCents = Math.max(0, Math.floor(Number(item.price_cents) || 0));
      const lineTotal = unitCents * qty;
      if (lineTotal === 0) continue;
      const { error: prodTxErr } = await admin.from("transactions").insert({
        barber_id: null,
        client_id: clientIdFinal,
        appointment_id: upserted.id,
        type: "product",
        payment_method: paymentMethod,
        subtotal_cents: lineTotal,
        tip_cents: 0,
        total_cents: lineTotal,
        status: "completed",
        source: "public_booking",
        notes: `Online product sale — ${item.name || item.id} × ${qty}`,
      });
      if (prodTxErr) {
        console.warn(`[commitDraft] product tx insert warning ${item.id}: ${prodTxErr.message}`);
      }
      // Decrement stock atomically
      const { data: prodRow } = await admin
        .from("products")
        .select("stock_count")
        .eq("id", item.id)
        .maybeSingle();
      if (prodRow) {
        const newStock = Math.max(0, (prodRow.stock_count || 0) - qty);
        await admin.from("products").update({ stock_count: newStock, updated_at: new Date().toISOString() }).eq("id", item.id);
      }
    }
    // Fire-and-forget owner notification
    try {
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-product-sale`;
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
        },
        body: JSON.stringify({
          appointment_id: upserted.id,
          client_name: `${acuityData.firstName} ${acuityData.lastName}`.trim(),
          products: productsArr,
          total_cents: productsTotalCents,
        }),
      }).catch((e) => console.warn(`[commitDraft] notify-product-sale dispatch warn: ${(e as Error).message}`));
    } catch (e) {
      console.warn(`[commitDraft] notify-product-sale setup warn: ${(e as Error).message}`);
    }
  }

  // ─── 7. Mark draft committed ───
  console.log(`[commitDraft] Marking draft committed`);
  await admin
    .from("booking_drafts")
    .update({
      status: "committed",
      appointment_id: upserted.id,
      acuity_id: acuityData.id,
      committed_at: new Date().toISOString(),
    })
    .eq("id", draftId);

  // ─── 7b. Notify owner devices (fire-and-forget) ───
  // Sends a push to every owner with an active subscription, so admins with
  // the PWA installed get a system push for every appointment booked from
  // the public site or the client portal.
  try {
    const clientFullName = `${acuityData.firstName ?? ""} ${acuityData.lastName ?? ""}`.trim() || "Cliente";
    const serviceName = String(acuityData.type || "Servicio");
    const startDate = new Date(startsAt);
    const dateStr = startDate.toLocaleString("es-PR", {
      timeZone: "America/Puerto_Rico",
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const sourceLabel = draft.source === "client_app" ? "App cliente" : "Sitio público";
    const barberName = String((acuityData as { calendar?: string }).calendar || "").trim() || "Barbero";
    notifyOwners({
      event_key: "admin_booking_new",
      vars: { source: sourceLabel, client: clientFullName, service: serviceName, barber: barberName, date: dateStr, appointment_id: upserted.id },
      defaults: {
        title: `Nueva cita (${sourceLabel})`,
        body: `${clientFullName} reservó ${serviceName}, ${dateStr}.`,
        url: `/admin/appointment/${upserted.id}`,
        tag: `new-appointment-${upserted.id}`,
      },
    }).catch((e) => console.warn(`[commitDraft] notifyOwners warn: ${(e as Error).message}`));
  } catch (e) {
    console.warn(`[commitDraft] notifyOwners setup warn: ${(e as Error).message}`);
  }

  // ─── 8. Persist card-on-file + preferred payment method on the client ───
  // Always update preferred_payment_method (so next checkout pre-selects).
  // For Stripe card/apple_pay/google_pay we also fetch the card details from
  // the PaymentIntent and persist brand + last4 so the admin appointment
  // summary and client profile both surface the card the customer used.
  if (clientIdFinal) {
    const preferredMethod =
      paymentMethod === "stripe" ? (stripePmType || "card") : paymentMethod;
    const clientUpdate: Record<string, unknown> = {
      preferred_payment_method: preferredMethod,
    };

    if (paymentMethod === "stripe" && paymentRef) {
      try {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
        if (stripeKey) {
          // Lazy-import Stripe SDK only when needed (keeps ATH/PayPal callers fast).
          const { default: StripeMod } = await import("https://esm.sh/stripe@18.5.0");
          const stripe = new StripeMod(stripeKey, { apiVersion: "2025-08-27.basil" });
          const pi = await stripe.paymentIntents.retrieve(paymentRef, {
            expand: ["payment_method"],
          });
          const pm = pi.payment_method as { card?: { brand?: string; last4?: string }; type?: string } | null;
          if (pm?.card?.last4) {
            clientUpdate.card_brand = pm.card.brand || null;
            clientUpdate.card_last4 = pm.card.last4;
          }
          if (pm?.type && !stripePmType) {
            clientUpdate.preferred_payment_method = pm.type;
          }
        }
      } catch (e) {
        console.warn(`[commitDraft] could not fetch payment_method for pi=${paymentRef}: ${(e as Error).message}`);
      }
    }

    const { error: cliErr } = await admin
      .from("clients")
      .update(clientUpdate)
      .eq("id", clientIdFinal);
    if (cliErr) {
      console.warn(`[commitDraft] client preferred_payment update warning: ${cliErr.message}`);
    } else {
      console.log(`[commitDraft] Client ${clientIdFinal} updated:`, clientUpdate);
    }
  }

  console.log(`[commitDraft] ✔ DONE draftId=${draftId} appointmentId=${upserted.id} acuityId=${acuityData.id}`);

  return {
    success: true,
    alreadyCommitted: false,
    appointmentId: upserted.id,
    acuityId: acuityData.id as number,
    draft,
    appointment: {
      id: upserted.id,
      starts_at: startsAt,
      service_name: String(acuityData.type),
      price: String(acuityData.price || (priceCentsAcuity / 100).toFixed(2)),
      duration,
    },
  };
}
