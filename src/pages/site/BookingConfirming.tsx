// /citas/confirmando — popup-based booking confirmation sequence.
// The same component stays mounted across polling → committed (or failed/refunded/timeout)
// so the customer sees one continuous animated experience instead of a page change.
//
// Branches on URL params (in priority order):
//   ?stripe_cancel=1            → render stripe_cancelled state immediately, no polling
//   ?stripe_session_id=...      → Stripe Checkout poller (check-stripe-checkout-status)
//   ?paypal_token=... / ?paypal_return=1 → PayPal poller (check-paypal-status)
//   ?paypal_cancel=1            → render failed state immediately, no polling
//   (default)                   → ATH poller (check-ath-status)
//
// Public route — no auth guard.
import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { savePendingBooking, clearPendingBooking } from "@/lib/pendingBooking";
import ConfirmationPopup, { type PopupState } from "@/components/site/booking/ConfirmationPopup";
import { useReviewPrompt } from "@/hooks/useReviewPrompt";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 300_000; // 5 min — real authorization can exceed 90s
const ACTIVE_CHECK_EVERY_N_POLLS = 4;  // ~every 8s (ATH/PayPal cadence)
const STRIPE_POLL_INTERVAL_MS = 2000;

type DraftStatus = "pending" | "committed" | "refunded" | "failed" | "expired" | "reconciliation_required" | "manual_refund_required";

interface CommittedData {
  firstName: string;
  serviceName: string;
  barberName: string;
  whenLabel: string;
  priceCents: number;
  startsAtIso: string;
  endsAtIso: string;
  appointmentId: string;
  email: string | null;
  canClaimAccount: boolean;
  paymentMethodCode: string | null;   // raw db value: ath_movil | stripe | paypal | cash …
  athReferenceNumber: string | null;  // ATH transaction ID, when paid via ATH
}

const LOG = "[BookingConfirming]";

export default function BookingConfirming() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { language } = useTranslation();
  const isEs = language === "es";

  const draftId = searchParams.get("draftId");
  // PayPal redirect signals (set by application_context.return_url / cancel_url
  // server-side in pay-then-book/prepare-paypal-redirect).
  const paypalReturn = searchParams.get("paypal_return") === "1";
  const paypalCancel = searchParams.get("paypal_cancel") === "1";
  // Stripe Checkout redirect signals (set by create-booking-checkout
  // success_url / cancel_url server-side).
  const stripeSessionId = searchParams.get("stripe_session_id");
  const stripeCancel = searchParams.get("stripe_cancel") === "1";
  // flowSource passed through the Stripe redirect so the cancel CTA can
  // route the user back to the correct booking entry point.
  const flowSourceParam = searchParams.get("source");
  const isClientPortal = flowSourceParam === "client_portal";
  // Dev/QA preview: ?preview=polling|committed|failed|refunded|timeout|stripe_cancelled
  const preview = searchParams.get("preview") as PopupState | null;

  const initialState: PopupState =
    preview ??
    (stripeCancel
      ? "stripe_cancelled"
      : paypalCancel
      ? "failed"
      : "polling");

  const [state, setState] = useState<PopupState>(initialState);
  const [slow, setSlow] = useState(false);

  // Remember this in-progress confirmation so a retry comes back here,
  // and reassure the customer after 45s instead of an endless spinner.
  useEffect(() => {
    if (preview || !draftId || state !== "polling") return;
    savePendingBooking(draftId, window.location.pathname + window.location.search);
    const t = window.setTimeout(() => setSlow(true), 45_000);
    return () => window.clearTimeout(t);
  }, [preview, draftId, state]);

  /* ─── Defensive draft cleanup on terminal states ───
     Whenever the booking flow reaches a final outcome (committed / failed /
     refunded / timeout / stripe_cancelled), wipe any leftover client-side
     booking draft from ClientNewAppointment. Belt-and-suspenders next to
     the synchronous guard in that page so a stale draft can never resurrect
     the payment step on a brand-new "Reservar" tap. */
  useEffect(() => {
    const terminal = state === "committed" || state === "failed"
      || state === "refunded" || state === "timeout" || state === "stripe_cancelled";
    if (!terminal) return;
    clearPendingBooking();
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("agendaos.clientNewAppt.v1."))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch { /* ignore */ }
  }, [state]);
  const [reason, setReason] = useState<string | null>(
    preview === "failed"
      ? (isEs ? "Pago rechazado por tu banco" : "Payment declined by your bank")
      : preview === "refunded"
      ? (isEs ? "Otro cliente reservó ese horario antes que tú" : "Another customer booked that time first")
      : paypalCancel
      ? (isEs ? "Cancelaste el pago en PayPal" : "You cancelled the PayPal payment")
      : null,
  );
  const [committed, setCommitted] = useState<CommittedData | null>(
    preview === "committed"
      ? {
          firstName: "Carlos",
          serviceName: "CORTE DE CABELLO",
          barberName: "Charlie Corchado",
          whenLabel: isEs ? "Martes 21 De Abril - 1:00 PM" : "Tuesday, April 21 - 1:00 PM",
          priceCents: 2500,
          startsAtIso: new Date(Date.now() + 86400000).toISOString(),
          endsAtIso: new Date(Date.now() + 86400000 + 1800000).toISOString(),
          appointmentId: "preview-0000",
          email: "test@example.com",
          canClaimAccount: true,
          paymentMethodCode: "ath_movil",
          athReferenceNumber: "215070440-8a36d420882a293a018849cae9f500a8",
        }
      : null,
  );
  const startTimeRef = useRef(Date.now());
  const pollCountRef = useRef(0);

  /* ─── Load committed appointment data via edge function (bypasses RLS) ─── */
  const loadCommittedData = async (apptId: string) => {
    const { data, error } = await supabase.functions.invoke("pay-then-book", {
      body: { action: "get-booking-details", draftId: draftId! },
    });

    if (error || !data?.success) {
      console.error(`${LOG} get-booking-details failed`, error, data);
      setState("failed");
      setReason(isEs ? "No pudimos cargar tu cita" : "Could not load appointment");
      return;
    }

    const a = data.appointment as {
      id: string; starts_at: string; ends_at: string;
      service_name: string; price_cents: number; barber_name: string;
    } | null;

    if (!a) {
      setState("failed");
      setReason(isEs ? "No pudimos cargar tu cita" : "Could not load appointment");
      return;
    }

    void apptId; // apptId is informational; the edge function resolved appointment from draftId
    const startDate = new Date(a.starts_at);
    const whenLabel = format(
      startDate,
      isEs ? "EEEE d 'de' MMMM - h:mm a" : "EEEE, MMMM d - h:mm a",
      { locale: isEs ? esLocale : undefined }
    );

    setCommitted({
      firstName: data.first_name || "",
      serviceName: a.service_name,
      barberName: a.barber_name,
      whenLabel: whenLabel.charAt(0).toUpperCase() + whenLabel.slice(1),
      priceCents: a.price_cents,
      startsAtIso: a.starts_at,
      endsAtIso: a.ends_at,
      appointmentId: a.id,
      email: data.email || null,
      canClaimAccount: !!data.can_claim_account,
      paymentMethodCode: data.payment_method ?? null,
      athReferenceNumber: data.ath_reference_number ?? null,
    });
    setState("committed");

    // Fire-and-forget referral attribution for first_booking. Passing the
    // resolved clientId ensures assign_client_referral runs and the
    // client_referral_attributions row is created, so the matching-bonus
    // and spending-points triggers can fire (and backfill prior tx).
    try {
      const { recordReferralConversion } = await import("@/lib/referral");
      void recordReferralConversion("first_booking", data.client_id ?? null, a.id);
    } catch { /* ignore */ }
  };

  /* ─── Stripe Checkout poller ─────────────────────────────────────── */
  useEffect(() => {
    if (preview) return;
    if (!stripeSessionId || stripeCancel) return;
    if (!draftId) {
      navigate("/citas", { replace: true });
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        console.log(`${LOG} stripe-poll → check-stripe-checkout-status`);
        const { data, error } = await supabase.functions.invoke("pay-then-book", {
          body: {
            action: "check-stripe-checkout-status",
            draftId,
            sessionId: stripeSessionId,
          },
        });
        if (cancelled) return;

        const payload = data as {
          status?: "committed" | "polling" | "expired" | "failed";
          appointment_id?: string | null;
          reason?: string | null;
          error?: string | null;
        } | null;

        if (error && !payload) {
          console.warn(`${LOG} stripe poll transport error — continuing`, error);
        } else if (payload?.status === "committed") {
          await loadCommittedData(payload.appointment_id || "");
          return;
        } else if (payload?.status === "expired") {
          setReason(payload.reason || null);
          setState("timeout");
          return;
        } else if (payload?.status === "failed") {
          setReason(payload.reason || payload.error || null);
          setState("failed");
          return;
        }

        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed >= MAX_POLL_DURATION_MS) {
          setState("timeout");
          return;
        }
        timeoutId = window.setTimeout(poll, STRIPE_POLL_INTERVAL_MS);
      } catch (e) {
        console.error(`${LOG} stripe poll exception`, e);
        if (!cancelled) timeoutId = window.setTimeout(poll, STRIPE_POLL_INTERVAL_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, stripeSessionId, stripeCancel]);

  /* ─── ATH / PayPal poll loop ────────────────────────────────────── */
  useEffect(() => {
    if (preview) return; // QA preview mode — skip polling entirely
    if (paypalCancel) return; // PayPal cancel branch — show error, no polling
    if (stripeSessionId || stripeCancel) return; // Stripe branches handled separately
    if (!draftId) {
      navigate("/citas", { replace: true });
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;

    const poll = async () => {
      if (cancelled) return;
      pollCountRef.current += 1;
      const cycle = pollCountRef.current;

      try {
        // Every Nth cycle, actively check the gateway via the edge function.
        // PayPal flow → check-paypal-status (captures + commits server-side).
        // ATH flow    → check-ath-status (authorizes + commits server-side).
        if (cycle % ACTIVE_CHECK_EVERY_N_POLLS === 0) {
          const action = paypalReturn ? "check-paypal-status" : "check-ath-status";
          console.log(`${LOG} cycle=${cycle} → ${action}`);
          try {
            const { data, error } = await supabase.functions.invoke("pay-then-book", {
              body: { action, draftId },
            });
            if (cancelled) return;

            const payload = data as {
              success?: boolean;
              status?: string;
              appointment_id?: string | null;
              error?: string;
              reason?: string | null;
            } | null;

            const transientErr =
              payload?.success === false &&
              (payload?.error === "ath_unreachable" || payload?.error === "paypal_unreachable");

            if (error && !payload) {
              console.warn(`${LOG} ${action} transport error — continuing poll`, error);
            } else if (transientErr) {
              console.warn(`${LOG} ${payload.error} — continuing poll`);
            } else if (payload?.status === "committed" && payload.appointment_id) {
              await loadCommittedData(payload.appointment_id);
              return;
            } else if (payload?.status === "committed") {
              await loadCommittedData("");
              return;
            } else if (payload?.status === "failed") {
              setReason(payload.reason || payload.error || null);
              setState("failed");
              return;
            } else if (payload?.status === "refunded") {
              setReason(payload.reason || null);
              setState("refunded");
              return;
            }
          } catch (e) {
            console.warn(`${LOG} active-check exception — continuing`, e);
          }
        }

        // Cheap status read via edge function (bypasses RLS).
        const { data: detailsData, error: detailsErr } = await supabase.functions.invoke(
          "pay-then-book",
          { body: { action: "get-booking-details", draftId } }
        );

        if (cancelled) return;
        if (detailsErr) console.error(`${LOG} get-booking-details poll error`, detailsErr);

        const status = (detailsData?.status || "pending") as DraftStatus;

        if (status === "committed") {
          await loadCommittedData("");
          return;
        }

        if (status === "refunded") {
          setReason(detailsData?.failure_reason || null);
          setState("refunded");
          return;
        }

        // Paid but the appointment is NOT confirmed: never show success,
        // calendar or review. The team resolves it manually.
        if (status === "reconciliation_required" || status === "manual_refund_required") {
          setReason(isEs
            ? "Recibimos tu pago, pero tu cita no quedó confirmada. El equipo te contactará para reprogramar o reembolsar."
            : "We received your payment, but your appointment was not confirmed. The team will contact you to rebook or refund.");
          setState("failed");
          return;
        }

        if (status === "failed") {
          setReason(detailsData?.failure_reason || null);
          setState("failed");
          return;
        }

        // Still pending — check timeout
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed >= MAX_POLL_DURATION_MS) {
          setState("timeout");
          return;
        }

        timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
      } catch (e) {
        console.error(`${LOG} poll exception`, e);
        if (!cancelled) timeoutId = window.setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    // For PayPal returns, run the active check immediately (no 8s wait)
    // so committed bookings flip the popup right after the bounce-back.
    if (paypalReturn) pollCountRef.current = ACTIVE_CHECK_EVERY_N_POLLS - 1;
    poll();
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, paypalReturn, paypalCancel, stripeSessionId, stripeCancel]);

  /* ─── ICS download ──────────────────────────────────────────────── */
  const downloadIcs = () => {
    if (!committed) return;
    const dt = (iso: string) =>
      iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "").replace(/Z?$/, "Z");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Charlie's Barbershop//Booking//EN",
      "BEGIN:VEVENT",
      `UID:${committed.appointmentId}@charliesbarbershop.com`,
      `DTSTAMP:${dt(new Date().toISOString())}`,
      `DTSTART:${dt(new Date(committed.startsAtIso).toISOString())}`,
      `DTEND:${dt(new Date(committed.endsAtIso).toISOString())}`,
      `SUMMARY:${committed.serviceName} — Charlie's Barbershop`,
      `DESCRIPTION:${isEs ? "Cita con" : "Appointment with"} ${committed.barberName}`,
      "LOCATION:PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cita-${committed.appointmentId.slice(0, 8)}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ─── CTA wiring per state ──────────────────────────────────────── */
  // For committed bookings, logged-in/PWA users go straight back to their portal.
  // Guests still go through the install/account bridge.
  const goToPostBookingLogin = async (extraMode?: "signup") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (isClientPortal || session?.user) {
      navigate("/app/cliente", { replace: true });
      return;
    }

    const params = new URLSearchParams();
    if (committed?.email) params.set("email", committed.email);
    if (extraMode) params.set("mode", extraMode);
    const qs = params.toString();
    navigate(`/citas/instala${qs ? `?${qs}` : ""}`);
  };

  const review = useReviewPrompt(
    committed?.appointmentId ?? null,
    draftId,
    !preview && state === "committed",
    isEs,
    preview === "committed" && searchParams.get("previewReview") === "1",
  );

  const onPrimary = () => {
    if (state === "stripe_cancelled") {
      return navigate(isClientPortal ? "/app/cliente/nueva-cita" : "/citas");
    }
    if (state === "committed") {
      // Download ICS, then route to the new login page so they can keep
      // managing the booking from inside the portal / PWA.
      downloadIcs();
      window.setTimeout(() => { review.runAfter(() => { void goToPostBookingLogin(); }); }, 350);
      return;
    }
    if (state === "refunded") return navigate("/citas");
    return navigate("/app/cliente");
  };
  const onSecondary = () => {
    if (state === "stripe_cancelled") {
      return navigate(isClientPortal ? "/app/cliente" : "/citas");
    }
    if (state === "committed") return review.runAfter(() => { void goToPostBookingLogin(); });
    return navigate("/app/cliente");
  };

  // Tertiary CTA — committed state only — sends guests to the post-booking
  // login page in signup mode with their email pre-filled.
  const onTertiary = committed?.canClaimAccount && committed.email
    ? () => { void goToPostBookingLogin("signup"); }
    : undefined;

  const committedSecondaryLabel = isEs ? "Ver mis citas" : "View my bookings";

  const paymentMethod: "ath" | "stripe" | "paypal" =
    stripeSessionId || stripeCancel ? "stripe" : (paypalReturn || paypalCancel ? "paypal" : "ath");

  if (review.open) return <>{review.overlay}</>;

  return (
    <ConfirmationPopup
      state={state}
      slow={slow}
      isEs={isEs}
      paymentMethod={paymentMethod}
      firstName={committed?.firstName}
      appointment={
        committed
          ? {
              serviceName: committed.serviceName,
              barberName: committed.barberName,
              whenLabel: committed.whenLabel,
              priceCents: committed.priceCents,
              paymentMethodCode: committed.paymentMethodCode,
              athReferenceNumber: committed.athReferenceNumber,
            }
          : undefined
      }
      reason={reason}
      onPrimaryAction={onPrimary}
      onSecondaryAction={onSecondary}
      onTertiaryAction={onTertiary}
      committedSecondaryLabel={committedSecondaryLabel}
    />
  );
}
