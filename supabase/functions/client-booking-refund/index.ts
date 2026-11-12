// Client-initiated cancellation handler.
//
// Owner directive (post-roadmap): refunds are NEVER processed automatically.
// - Unpaid appointments: cancel in Acuity → webhook hard-deletes the row.
// - Paid appointments: cancel in Acuity → row stays with refund_status='manual'
//   so the transaction remains visible in Sales as evidence that a manual
//   refund (Stripe / PayPal / ATH / cash) is still owed by the owner.
//
// This function exposes a single action: `schedule`. The legacy `execute`
// and `undo` actions, plus the pending_undo + auto-refund cron path, were
// removed — refunds happen by hand from the receipt.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { queueOrDispatchRecurringPush } from "../_shared/recurringPush.ts";
import { nativeShopFor } from "../_shared/nativeDraft.ts";
import { notifyOwners } from "../_shared/notifyOwners.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PR_OFFSET_MS = 4 * 3600 * 1000;

const getCancelDeadlineMs = (startsAtIso: string) => {
  const startMs = new Date(startsAtIso).getTime();
  const prLocal = startMs - PR_OFFSET_MS;
  const dayStartPrLocal = Math.floor(prLocal / 86_400_000) * 86_400_000;
  return dayStartPrLocal + PR_OFFSET_MS;
};

const nowPuertoRicoIsoOffset = () => {
  const prNow = new Date(Date.now() - PR_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prNow.getUTCFullYear()}-${pad(prNow.getUTCMonth() + 1)}-${pad(prNow.getUTCDate())}T${pad(prNow.getUTCHours())}:${pad(prNow.getUTCMinutes())}:${pad(prNow.getUTCSeconds())}-04:00`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json();
    const action = String(body.action || "schedule");
    const appointment_id = String(body.appointment_id || "");
    if (!appointment_id) return json({ error: "appointment_id required" }, 400);

    // Legacy actions are now no-ops (kept so old client builds don't 500).
    if (action === "undo" || action === "execute") {
      return json({ skipped: true, reason: "deprecated_action", action });
    }
    if (action !== "schedule") {
      return json({ error: "Unknown action", action }, 400);
    }

    const { data: appt } = await admin
      .from("appointments")
      .select("id, acuity_id, client_id, service_name, status, payment_method, payment_confirmed, amount_paid_cents, starts_at, refund_status, cancelled_by_role, recurring_group_id")
      .eq("id", appointment_id)
      .maybeSingle();
    if (!appt) return json({ error: "Appointment not found" }, 404);

    // Authn — require Supabase user JWT + ownership of the appointment.
    const authHeader = req.headers.get("Authorization") || "";
    const userToken = authHeader.replace("Bearer ", "");
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser(userToken);
    if (!user) return json({ error: "Unauthenticated" }, 401);

    const { data: clientRow } = await admin
      .from("clients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!clientRow || clientRow.id !== appt.client_id) {
      return json({ error: "Not authorized for this appointment" }, 403);
    }

    // Window check: clients can self-cancel until 11:59 PM the day before in PR time.
    const deadlineMs = getCancelDeadlineMs(appt.starts_at);
    if (Date.now() >= deadlineMs) {
      return json({ error: "outside_window", deadlineMs }, 400);
    }

    // Cancel in Acuity (best-effort — never block local cancellation if it fails).
    // Native shops never call Acuity, not even for rows that came from Acuity before the cutover.
    const refundShop = await nativeShopFor(admin, null).catch(() => null);
    if (appt.acuity_id && refundShop?.kind !== "native") {
      const userId = Deno.env.get("ACUITY_USER_ID");
      const apiKey = Deno.env.get("ACUITY_API_KEY");
      if (userId && apiKey) {
        await fetch(`https://acuityscheduling.com/api/v1/appointments/${appt.acuity_id}/cancel?admin=true`, {
          method: "PUT",
          headers: { Authorization: `Basic ${btoa(`${userId}:${apiKey}`)}`, "Content-Type": "application/json" },
          body: JSON.stringify({ cancelNote: "Client cancellation (in-window)" }),
        }).catch((e) => console.error("Acuity cancel err:", e));
      }
    }

    const isPaid = appt.payment_confirmed && appt.amount_paid_cents > 0;
    // Paid → mark 'manual' so it shows up as needing a hand-processed refund.
    // Unpaid → 'none'; Acuity webhook will hard-delete the row entirely.
    await admin
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_by_role: "client",
        cancelled_at: nowPuertoRicoIsoOffset(),
        refund_status: isPaid ? "manual" : "none",
        
      })
      .eq("id", appointment_id);

    try {
      // Appointment-scoped key — matches acuity-webhook so the two
      // sources can never both deliver a push for the same cancellation.
      await queueOrDispatchRecurringPush({
        admin,
        client_id: appt.client_id,
        appointment_id,
        recurring_group_id: (appt as any).recurring_group_id ?? null,
        template_name: "appointment_cancelled_by_shop",
        starts_at: appt.starts_at,
        service: appt.service_name || null,
        event_key: `appt:${appointment_id}:cancel`,
      });
    } catch (pushErr) {
      console.warn("[client-booking-refund] cancellation push dispatch failed:", pushErr);
    }

    // Notify owner devices (admins) that a client cancelled.
    try {
      let clientName = "Cliente";
      if (appt.client_id) {
        const { data: c } = await admin
          .from("clients")
          .select("first_name, last_name")
          .eq("id", appt.client_id)
          .maybeSingle();
        if (c) clientName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Cliente";
      }
      const dateStr = new Date(appt.starts_at).toLocaleString("es-PR", {
        timeZone: "America/Puerto_Rico",
        weekday: "short", day: "2-digit", month: "short",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
      notifyOwners({
        event_key: "admin_booking_cancelled",
        vars: { client: clientName, service: appt.service_name || "su cita", date: dateStr, appointment_id },
        defaults: {
          title: "Cita cancelada (Cliente)",
          body: `${clientName} canceló ${appt.service_name || "su cita"}, ${dateStr}.`,
          url: `/admin/appointment/${appointment_id}`,
          tag: `cancel-${appointment_id}`,
        },
      }).catch((e) => console.warn("[client-booking-refund] notifyOwners warn:", (e as Error).message));
    } catch (e) {
      console.warn("[client-booking-refund] notifyOwners setup warn:", (e as Error).message);
    }

    return json({
      success: true,
      will_refund: isPaid,
      refund_mode: isPaid ? "manual" : "none",
      amount_cents: appt.amount_paid_cents,
    });
  } catch (err) {
    console.error("client-booking-refund error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
