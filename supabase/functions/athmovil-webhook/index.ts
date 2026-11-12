// ATH Móvil webhook
// Match priority:
//   1. Pending checkout transaction (in-app paywall flow)
//   2. Note-based match: payer's "metadata1" / "description" mentions the appointment client's name → auto-allocate
//   3. Identity-first match: phone / email / name + amount on today's appointments
//   4. No match → pending_review (visible to entire shop, allocated manually)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { commitDraft } from "../_shared/commitDraft.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(raw: string | number | null | undefined): string {
  if (!raw && raw !== 0) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}
function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}
function normalizeText(raw: string | null | undefined): string {
  if (!raw) return "";
  // Strip diacritics + lowercase + collapse whitespace
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
/* Duplicate-match guard: an appointment that already has a settled (completed
   or pending_review) transaction must never be auto-matched again. */
async function alreadySettled(supabase: any, appointmentId: string) {
  const { data } = await supabase
    .from("transactions")
    .select("id")
    .eq("appointment_id", appointmentId)
    .in("status", ["completed", "pending_review"])
    .limit(1);
  return !!data?.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  // Best-effort audit trail. NEVER let logging break payment processing.
  async function logWebhook(entry: Record<string, unknown>) {
    try {
      await supabase.from("athmovil_webhook_log").insert(entry);
    } catch (e) {
      console.error("[athmovil-webhook] log insert failed", e);
    }
  }

  try {
    const payload = await req.json();
    console.log("ATH Movil webhook received:", JSON.stringify(payload));

    const status = payload.status || payload.eventName || "";
    const referenceNumber = payload.referenceNumber || payload.transactionId || "";
    const ecommerceId = payload.ecommerceId || payload.ecommerceID || "";
    const totalDollars = parseFloat(payload.total || "0");
    const totalCents = Math.round(totalDollars * 100);

    /* ─── AUTHENTICITY ───
       ATH Móvil / Evertec does NOT sign webhooks and the webhook URL is
       configured inside the ATH Business dashboard, outside our control.
       A hard "shared secret required" gate silently killed every inbound
       notification (Jul 18 → Jul 29, 2026: every call answered 503
       webhook_not_configured, so no ATH payment was auto-marked again).

       Permanent design — layered, never fail-closed on config alone:
         A. secret matches ATHMOVIL_WEBHOOK_SECRET (if configured) → trusted
         B. payment confirmed straight from ATH's own API → verified
         C. external ATH transfer that has no ecommerceId to verify →
            processed as before, but flagged unverified in the audit log.
       Every request is written to `athmovil_webhook_log` so a regression
       like this is visible instead of silent. */
    const expectedSecret = Deno.env.get("ATHMOVIL_WEBHOOK_SECRET") || "";
    const url = new URL(req.url);
    const providedSecret =
      url.searchParams.get("secret") ||
      req.headers.get("x-webhook-secret") ||
      req.headers.get("x-athmovil-secret") ||
      "";

    let authMode = "unverified_external";
    let verified = false;

    if (expectedSecret && providedSecret === expectedSecret) {
      authMode = "shared_secret";
      verified = true;
    } else {
      const refToCheck = ecommerceId || referenceNumber;
      const publicToken = Deno.env.get("ATH_MOVIL_PUBLIC_TOKEN") || "";
      const privateToken = Deno.env.get("ATH_MOVIL_PRIVATE_TOKEN") || "";
      if (refToCheck && publicToken && privateToken) {
        try {
          const vRes = await fetch(
            "https://payments.athmovil.com/api/business-transaction/ecommerce/findPayment",
            {
              method: "POST",
              headers: { Accept: "application/json", "Content-Type": "application/json" },
              body: JSON.stringify({ publicToken, privateToken, ecommerceId: refToCheck }),
            },
          );
          const vData = await vRes.json().catch(() => ({}));
          const vStatus = String(
            vData?.status || vData?.data?.status || vData?.ecommerceStatus || "",
          ).toLowerCase();
          if (vStatus === "completed" || vStatus === "success") {
            authMode = "ath_api_verified";
            verified = true;
          } else {
            console.warn("[athmovil-webhook] ATH verification inconclusive", vStatus);
          }
        } catch (e) {
          console.warn("[athmovil-webhook] ATH verification call failed", e);
        }
      }
      if (!verified && expectedSecret && providedSecret) authMode = "secret_mismatch_unverified";
    }
    console.log(`[athmovil-webhook] auth=${authMode} verified=${verified} ref=${referenceNumber}`);
    await logWebhook({
      auth_mode: authMode,
      verified,
      status_code: 200,
      reference_number: referenceNumber || null,
      total_cents: Number.isFinite(totalCents) ? totalCents : null,
      event_status: String(status || ""),
      outcome: "accepted",
      payload,
    });

    const payerName = normalizeName(payload.name);
    const payerPhone = normalizePhone(payload.phoneNumber);
    const payerEmail = (payload.email || "").trim().toLowerCase();
    // Sender note — ATH stores it under different keys depending on integration version
    const payerNote = normalizeText(
      payload.metadata1 || payload.description || payload.note || payload.notes || ""
    );


    const isCompleted =
      status === "COMPLETED" || status === "completed" || status === "ecommercePaymentReceivedEvent";
    const isFailed =
      status === "ecommercePaymentCancelledEvent" || status === "ecommercePaymentExpiredEvent" ||
      status === "cancelled" || status === "expired" ||
      status === "CANCEL" || status === "CANCELLED" || status === "EXPIRED";

    /* ─── IDEMPOTENCY / DUPLICATE PROTECTION ───
       A single ATH reference may only ever produce ONE record. If a
       transaction already exists for this reference in ANY state
       (completed, pending_review, refunded...) we stop here — this is what
       previously allowed an online booking to be marked paid AND still land
       in Pending Transactions. We also stop if an appointment already
       carries this reference (fast-path commit won the race). */
    if (referenceNumber && isCompleted) {
      const { data: existingTxns } = await supabase
        .from("transactions")
        .select("id, status, appointment_id")
        .eq("athmovil_transaction_id", referenceNumber)
        .limit(1);
      const existing = existingTxns?.[0];
      if (existing) {
        console.log(`Duplicate webhook ignored — reference already recorded (${existing.status}):`, referenceNumber);
        return json({ received: true, duplicate: true, status: existing.status });
      }
      const { data: refAppt } = await supabase
        .from("appointments")
        .select("id")
        .eq("payment_reference_id", referenceNumber)
        .limit(1)
        .maybeSingle();
      if (refAppt) {
        console.log("Duplicate webhook ignored — appointment already holds this reference:", referenceNumber);
        return json({ received: true, duplicate: true, type: "appointment_already_paid" });
      }

      /* Order-independent dedupe by ecommerceId. The waiting page / fast-path
         commits with ATH's ecommerceId (not the referenceNumber), so the
         reference checks above miss it. If this ecommerceId is already applied
         anywhere, the money is already on its appointment: backfill the ATH
         reference and stop, never create a Pendientes duplicate. */
      if (ecommerceId) {
        const { data: ecTxns } = await supabase
          .from("transactions")
          .select("id, status, appointment_id")
          .eq("status", "completed")
          .or(`athmovil_transaction_id.eq.${ecommerceId},ath_reference_number.eq.${ecommerceId}`)
          .limit(1);
        // Only a COMPLETED txn means money already applied; admin/public
        // appointment flows pre-create PENDING txns that Step 0.5 must finish.
        const ecTxn = ecTxns?.[0]?.status === "completed" ? ecTxns[0] : null;
        const { data: ecAppt } = await supabase
          .from("appointments")
          .select("id")
          .eq("payment_reference_id", ecommerceId)
          .limit(1)
          .maybeSingle();
        const { data: ecDraft } = await supabase
          .from("booking_drafts")
          .select("id, appointment_id")
          .eq("ath_ecommerce_id", ecommerceId)
          .eq("status", "committed")
          .limit(1)
          .maybeSingle();
        if (ecTxn || ecAppt || ecDraft) {
          if (ecTxn && referenceNumber) {
            await supabase
              .from("transactions")
              .update({ ath_reference_number: referenceNumber })
              .eq("id", ecTxn.id)
              .is("ath_reference_number", null);
          }
          console.log(`Duplicate webhook ignored — ecommerceId already applied:`, ecommerceId);
          return json({ received: true, duplicate: true, type: "ecommerce_already_applied" });
        }
      }
    }

    if (isCompleted) {
      // ── Step 0: Public-booking draft commit (highest priority) ──
      // Fast-path may have already committed; commitDraft is idempotent.
      const draftIdMeta = (payload.metadata1 || "").toString().trim();
      const sourceMeta = (payload.metadata2 || "").toString().trim();
      const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draftIdMeta);

      if (looksLikeUuid && sourceMeta === "public-booking") {
        console.log(`[athmovil-webhook] Step 0: draft commit attempt draftId=${draftIdMeta} ref=${referenceNumber}`);
        const { data: draftRow } = await supabase
          .from("booking_drafts")
          .select("id, status, appointment_id, ath_ecommerce_id")
          .eq("id", draftIdMeta)
          .maybeSingle();

        // Authenticity: the ecommerceId is only known to ATH and our server.
        const draftBound = !!draftRow && (verified ||
          (!!ecommerceId && !!draftRow.ath_ecommerce_id && draftRow.ath_ecommerce_id === ecommerceId));
        if (draftRow && !draftBound) {
          console.warn(`[athmovil-webhook] Step 0: ecommerceId mismatch for draft ${draftIdMeta} — ignored`);
          return json({ received: true, matched: false, type: "draft_unverified" });
        }
        if (draftRow) {
          if (draftRow.status === "committed") {
            console.log(`[athmovil-webhook] Step 0: draft already committed (fast-path won the race) — returning 200`);
            return json({ received: true, matched: true, type: "draft_already_committed" });
          }
          try {
            const result = await commitDraft(supabase, draftIdMeta, referenceNumber, "webhook", "ath_movil");
            console.log(`[athmovil-webhook] Step 0: ✔ draft committed via webhook appointmentId=${result.appointmentId}`);
            return json({ received: true, matched: true, type: "draft_commit_webhook", appointmentId: result.appointmentId });
          } catch (e) {
            const msg = (e as Error).message || "commit failed";
            console.error(`[athmovil-webhook] Step 0: ✖ commit failed: ${msg}`);
            // commitDraft already updated draft status to 'refunded' on acuity failure;
            // for any other throw we mark it failed here.
            if (!msg.startsWith("acuity_failed")) {
              await supabase
                .from("booking_drafts")
                .update({ status: "failed", failure_reason: msg.slice(0, 500) })
                .eq("id", draftIdMeta)
                .eq("status", "pending");
            }
            // ALWAYS return 200 to Evertec so it doesn't retry the webhook.
            return json({ received: true, matched: false, type: "draft_commit_failed", error: msg });
          }
        }
        // No draft found — fall through to existing logic
        console.log(`[athmovil-webhook] Step 0: no draft found for ${draftIdMeta}, falling through`);
      }

      // ── Step 0.5: Admin appointment pay — exact match by transaction id ──
      if (looksLikeUuid && sourceMeta === "admin-appointment") {
        console.log(`[athmovil-webhook] Step 0.5: admin appointment txn=${draftIdMeta} ref=${referenceNumber}`);
        const { data: adminTxn } = await supabase
          .from("transactions")
          .select("id, appointment_id, client_id, status, total_cents, tip_cents, subtotal_cents, ath_reference_number")
          .eq("id", draftIdMeta)
          .maybeSingle();
        const adminBound = !!adminTxn && (verified ||
          (!!ecommerceId && !!adminTxn.ath_reference_number && adminTxn.ath_reference_number === ecommerceId));
        if (adminTxn && !adminBound) {
          console.warn(`[athmovil-webhook] Step 0.5: ecommerceId mismatch for txn ${draftIdMeta} — ignored`);
          return json({ received: true, matched: false, type: "admin_appointment_unverified" });
        }
        if (adminTxn && adminTxn.status === "pending") {
          await supabase
            .from("transactions")
            .update({
              status: "completed",
              athmovil_transaction_id: referenceNumber,
              approved_at: new Date().toISOString(),
              approved_by_name: "ATH Móvil (admin)",
            })
            .eq("id", adminTxn.id);
          if (adminTxn.appointment_id) {
            await supabase
              .from("appointments")
              .update({
                paid: true,
                payment_method: "ath_movil",
                payment_confirmed: true,
                payment_reference_id: referenceNumber,
                amount_paid_cents: adminTxn.total_cents,
                tip_cents: adminTxn.tip_cents,
              })
              .eq("id", adminTxn.appointment_id);
            if (adminTxn.client_id && payerPhone) {
              await supabase
                .from("clients")
                .update({ ath_phone: payerPhone, ath_phone_last4: payerPhone.slice(-4) })
                .eq("id", adminTxn.client_id)
                .is("ath_phone", null);
            }
            await writeAcuityNote(supabase, adminTxn.appointment_id, referenceNumber);
          }
          return json({ received: true, matched: true, type: "admin_appointment" });
        }
      }

      // ── Step 1: Match pending checkout transaction ───
      // Only a RECENT pending checkout (last 2h) may be claimed by amount,
      // and only if it has not already been tied to another ATH reference.
      const recentCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: pendingTxn } = await supabase
        .from("transactions")
        .select("id, appointment_id, client_id, ath_reference_number")
        .eq("payment_method", "ath_movil")
        .eq("status", "pending")
        .eq("total_cents", totalCents)
        .is("athmovil_transaction_id", null)
        .gte("created_at", recentCutoff)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // A pending checkout may only be completed by a verified notice or one
      // carrying the exact ecommerceId ATH issued for that checkout.
      const pendingBound = !!pendingTxn && (verified ||
        (!!ecommerceId && !!pendingTxn.ath_reference_number && pendingTxn.ath_reference_number === ecommerceId));
      if (pendingTxn && pendingBound) {
        await supabase
          .from("transactions")
          .update({ status: "completed", athmovil_transaction_id: referenceNumber })
          .eq("id", pendingTxn.id);

        if (pendingTxn.appointment_id) {
          await supabase
            .from("appointments")
            .update({ payment_confirmed: true, payment_reference_id: referenceNumber })
            .eq("id", pendingTxn.appointment_id);

          // Auto-save ATH phone to client (one-tap next time)
          if (pendingTxn.client_id && payerPhone) {
            await supabase
              .from("clients")
              .update({ ath_phone: payerPhone, ath_phone_last4: payerPhone.slice(-4) })
              .eq("id", pendingTxn.client_id)
              .is("ath_phone", null); // only on first save
          }

          await writeAcuityNote(supabase, pendingTxn.appointment_id, referenceNumber);
        }
        return json({ received: true, matched: true, type: "checkout" });
      }

      // ── Step 2: Pull candidate appointments — today ±3 days, unpaid, not cancelled
      const startWindow = new Date(); startWindow.setDate(startWindow.getDate() - 3); startWindow.setHours(0, 0, 0, 0);
      const endWindow = new Date(); endWindow.setDate(endWindow.getDate() + 3); endWindow.setHours(23, 59, 59, 999);
      const { data: candidates } = await supabase
        .from("appointments")
        .select("id, barber_id, client_id, client_name, client_phone, client_email, price_cents, status, acuity_id, starts_at")
        .gte("starts_at", startWindow.toISOString())
        .lte("starts_at", endWindow.toISOString())
        .neq("status", "cancelled")
        .eq("paid", false);

      // ── Step 2a: Note-based match (parent paying for kid)
      // Match if note contains client's full name OR last 4 of client's phone
      let noteMatches: any[] = [];
      if (payerNote && candidates) {
        for (const appt of candidates) {
          const apptName = normalizeText(appt.client_name);
          const apptPhone = normalizePhone(appt.client_phone);
          const apptPhoneLast4 = apptPhone.slice(-4);

          // Skip empty names
          if (!apptName || apptName.length < 3) continue;

          let nameMatch = false;
          // Match if note contains the full name (after diacritic strip + lowercase)
          if (apptName && payerNote.includes(apptName)) nameMatch = true;
          // Or if note contains BOTH first name AND last name as separate words
          if (!nameMatch) {
            const parts = apptName.split(" ").filter((p) => p.length >= 2);
            if (parts.length >= 2 && parts.every((p) => payerNote.includes(p))) nameMatch = true;
          }

          const phoneMatch = apptPhoneLast4.length === 4 && payerNote.includes(apptPhoneLast4);

          if (nameMatch || phoneMatch) {
            noteMatches.push({ ...appt, _matchedBy: nameMatch ? "name" : "phone_last4" });
          }
        }
      }

      // Auto-allocate ONLY if exactly one note match (per user spec: multiple matches → manual)
      // Auto-settle only verified notices; unverified ones go to Pending for staff approval.
      if (verified && noteMatches.length === 1 && !(await alreadySettled(supabase, noteMatches[0].id))) {
        const matchedAppt = noteMatches[0];
        const serviceCents = matchedAppt.price_cents || 0;
        const tipCents = Math.max(0, totalCents - serviceCents);
        const subtotalCents = totalCents - tipCents;

        const { data: newTxn, error: insertError } = await supabase
          .from("transactions")
          .insert({
            barber_id: matchedAppt.barber_id,
            client_id: matchedAppt.client_id,
            appointment_id: matchedAppt.id,
            type: "service",
            payment_method: "ath_movil",
            subtotal_cents: subtotalCents,
            tip_cents: tipCents,
            total_cents: totalCents,
            status: "completed",
            athmovil_transaction_id: referenceNumber,
            allocation_method: "auto_note",
            approved_by_name: "Sistema (auto-nota)",
            approved_at: new Date().toISOString(),
            notes: `ATH Móvil — auto-asignado por nota (${matchedAppt._matchedBy})${tipCents > 0 ? ` | Propina: $${(tipCents / 100).toFixed(2)}` : ""} | Nota: "${payload.metadata1 || payload.description || ""}"`,
          })
          .select("id")
          .single();

        if (!insertError) {
          await supabase
            .from("appointments")
            .update({
              paid: true,
              payment_method: "ath_movil",
              payment_confirmed: true,
              payment_reference_id: referenceNumber,
              amount_paid_cents: totalCents,
              tip_cents: tipCents,
            })
            .eq("id", matchedAppt.id);

          if (matchedAppt.client_id && payerPhone) {
            await supabase
              .from("clients")
              .update({ ath_phone: payerPhone, ath_phone_last4: payerPhone.slice(-4) })
              .eq("id", matchedAppt.client_id)
              .is("ath_phone", null);
          }

          await writeAcuityNote(supabase, matchedAppt.id, referenceNumber);
          return json({ received: true, matched: true, type: "auto_note", matched_by: matchedAppt._matchedBy });
        }
      }

      // ── Step 2b: Identity-first matching (phone/email/name + amount)
      let matchedAppt: any = null;
      let matchScore = 0;
      if (candidates) {
        for (const appt of candidates) {
          let score = 0;
          if (payerPhone && normalizePhone(appt.client_phone) === payerPhone) score += 3;
          if (payerEmail && appt.client_email?.toLowerCase() === payerEmail) score += 3;
          if (payerName && normalizeName(appt.client_name) === payerName) score += 2;
          if (score > 0 && appt.price_cents === totalCents) score += 1;
          if (score > matchScore) { matchScore = score; matchedAppt = appt; }
        }
      }

      // Unverified (e.g. shop's printed QR) may auto-settle ONLY on an exact match:
      // payer phone + exact amount match exactly ONE unpaid appointment today (PR time).
      const prDay = (d: Date) => new Date(d.getTime() - 4 * 3600_000).toISOString().slice(0, 10);
      const todayPR = prDay(new Date());
      const exactMatches = (!verified && payerPhone && candidates)
        ? candidates.filter((a: any) =>
            normalizePhone(a.client_phone) === payerPhone &&
            a.price_cents === totalCents &&
            a.starts_at && prDay(new Date(a.starts_at)) === todayPR)
        : [];
      const exactOk = exactMatches.length === 1;
      if (exactOk) { matchedAppt = exactMatches[0]; matchScore = Math.max(matchScore, 4); }

      if ((verified || exactOk) && matchedAppt && matchScore >= 2 && !(await alreadySettled(supabase, matchedAppt.id))) {
        const serviceCents = matchedAppt.price_cents || 0;
        const tipCents = Math.max(0, totalCents - serviceCents);
        const subtotalCents = totalCents - tipCents;

        const { error: insertError } = await supabase
          .from("transactions")
          .insert({
            barber_id: matchedAppt.barber_id,
            client_id: matchedAppt.client_id,
            appointment_id: matchedAppt.id,
            type: "service",
            payment_method: "ath_movil",
            subtotal_cents: subtotalCents,
            tip_cents: tipCents,
            total_cents: totalCents,
            status: "completed",
            athmovil_transaction_id: referenceNumber,
            allocation_method: exactOk && !verified ? "auto_exact_unverified" : "auto_identity",
            approved_by_name: "Sistema (auto-identidad)",
            approved_at: new Date().toISOString(),
            notes: `ATH Móvil — auto-asignado por identidad (score: ${matchScore})${tipCents > 0 ? ` | Propina: $${(tipCents / 100).toFixed(2)}` : ""}`,
          });

        if (insertError) {
          if (insertError.message.includes("transactions_athmovil_unique")) {
            return json({ received: true, duplicate: true });
          }
          console.error("Failed to insert matched transaction:", insertError);
        } else {
          await supabase
            .from("appointments")
            .update({
              paid: true,
              payment_method: "ath_movil",
              payment_confirmed: true,
              payment_reference_id: referenceNumber,
              amount_paid_cents: totalCents,
              tip_cents: tipCents,
            })
            .eq("id", matchedAppt.id);

          if (matchedAppt.client_id && payerPhone) {
            await supabase
              .from("clients")
              .update({ ath_phone: payerPhone, ath_phone_last4: payerPhone.slice(-4) })
              .eq("id", matchedAppt.client_id)
              .is("ath_phone", null);
          }

          await writeAcuityNote(supabase, matchedAppt.id, referenceNumber);
        }
        return json({ received: true, matched: true, type: "identity_match", score: matchScore });
      }

      // ── Step 3: No match → pending_review (visible to entire shop)
      const { data: defaultBarber } = await supabase
        .from("barbers").select("id").eq("is_active", true).order("name").limit(1).single();
      const barberId = defaultBarber?.id;
      if (!barberId) return json({ received: true, matched: false, error: "no_barber" }, 200);

      const noteSummary = payload.metadata1 || payload.description || "";
      const { error: pendingInsertError } = await supabase.from("transactions").insert({
        barber_id: barberId,
        type: "service",
        payment_method: "ath_movil",
        subtotal_cents: totalCents,
        tip_cents: 0,
        total_cents: totalCents,
        status: "pending_review",
        athmovil_transaction_id: referenceNumber,
        notes: `ATH Móvil externo — ${payload.name || "Desconocido"} | ${payload.phoneNumber || ""} | ${payload.email || ""}${noteSummary ? ` | Nota: "${noteSummary}"` : ""} | Candidatos con nota: ${noteMatches.length}${(noteMatches.length === 1 ? noteMatches[0] : (matchScore >= 2 ? matchedAppt : null)) ? ` | Sugerida: ${(noteMatches.length === 1 ? noteMatches[0] : matchedAppt).client_name || ""}` : ""}${verified ? "" : " | Sin verificar con ATH"}`,
      });
      if (pendingInsertError) {
        if (pendingInsertError.message.includes("transactions_athmovil_unique")) {
          return json({ received: true, duplicate: true });
        }
        console.error("Failed to insert pending_review transaction:", pendingInsertError);
      }
      return json({ received: true, matched: false, type: "pending_review", note_match_count: noteMatches.length });
    }

    if (isFailed && !verified) {
      console.warn("[athmovil-webhook] unverified failure notice ignored");
    }
    if (isFailed && verified) {
      const { data: failedTxns } = await supabase
        .from("transactions")
        .update({ status: "failed" })
        .eq("payment_method", "ath_movil")
        .eq("status", "pending")
        .eq("total_cents", totalCents)
        .select("appointment_id");

      const appointmentId = payload.metadata2 || "";
      if (appointmentId) {
        await supabase.from("appointments")
          .update({ paid: false, payment_confirmed: false, amount_paid_cents: 0, payment_method: null, tip_cents: 0 })
          .eq("id", appointmentId);
      }
      if (failedTxns) {
        for (const tx of failedTxns) {
          if (tx.appointment_id && tx.appointment_id !== appointmentId) {
            await supabase.from("appointments")
              .update({ paid: false, payment_confirmed: false, amount_paid_cents: 0, payment_method: null, tip_cents: 0 })
              .eq("id", tx.appointment_id);
          }
        }
      }
    }

    return json({ received: true });
  } catch (error) {
    console.error("ATH Movil webhook error:", (error as Error).message);
    // ALWAYS return 200 to Evertec — non-2xx triggers retries and duplicate processing.
    return new Response(JSON.stringify({ received: true, error: (error as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function writeAcuityNote(supabase: any, appointmentId: string | null, referenceNumber: string) {
  if (!appointmentId) return;
  try {
    const acuityUserId = Deno.env.get("ACUITY_USER_ID");
    const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
    if (!acuityUserId || !acuityApiKey) return;
    const { data: appt } = await supabase.from("appointments").select("acuity_id").eq("id", appointmentId).maybeSingle();
    if (appt?.acuity_id) {
      const basicAuth = btoa(`${acuityUserId}:${acuityApiKey}`);
      await fetch(`https://acuityscheduling.com/api/v1/appointments/${appt.acuity_id}`, {
        method: "PUT",
        headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ notes: `Paid via ATH Movil — Ref: ${referenceNumber}` }),
      });
    }
  } catch (err) {
    console.error("Acuity note failed:", (err as Error).message);
  }
}
