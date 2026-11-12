// Owner-only: move a completed transaction from the wrong appointment to the correct appointment.
// It subtracts the payment from the old appointment, stacks it onto the target appointment,
// updates the transaction link, and records an audit entry.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthenticated" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthenticated" }, 401);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();
    if (!roleRow) return json({ error: "Owner role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const transactionId = String(body.transaction_id || "");
    const targetAppointmentId = String(body.appointment_id || "");
    const splitBalanceCents = Math.max(0, Math.round(Number(body.split_balance_cents || 0)));
    const splitTipCents = Math.max(0, Math.round(Number(body.split_tip_cents || 0)));

    if (!transactionId) return json({ error: "transaction_id required" }, 400);
    if (!targetAppointmentId) return json({ error: "appointment_id required" }, 400);

    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .select("id, status, appointment_id, client_id, barber_id, payment_method, subtotal_cents, tip_cents, total_cents, notes, type")
      .eq("id", transactionId)
      .maybeSingle();
    if (txErr) return json({ error: txErr.message }, 500);
    if (!tx) return json({ error: "Transaction not found" }, 404);
    if (tx.status !== "completed") return json({ error: "Only completed transactions can be reassigned" }, 400);
    if (tx.appointment_id === targetAppointmentId) return json({ error: "Choose a different appointment" }, 400);
    if (splitBalanceCents + splitTipCents !== (tx.total_cents || 0)) {
      return json({ error: "Split must equal transaction total" }, 400);
    }

    const apptIds = [tx.appointment_id, targetAppointmentId].filter(Boolean) as string[];
    const { data: appts, error: apptErr } = await admin
      .from("appointments")
      .select("id, price_cents, amount_paid_cents, tip_cents, payment_method, client_id, barber_id, client_name")
      .in("id", apptIds);
    if (apptErr) return json({ error: apptErr.message }, 500);

    const oldAppt = tx.appointment_id ? appts?.find((a) => a.id === tx.appointment_id) : null;
    const targetAppt = appts?.find((a) => a.id === targetAppointmentId);
    if (!targetAppt) return json({ error: "Target appointment not found" }, 404);

    if (oldAppt) {
      const oldNextPaid = Math.max(0, (oldAppt.amount_paid_cents || 0) - (tx.total_cents || 0));
      const oldNextTip = Math.max(0, (oldAppt.tip_cents || 0) - (tx.tip_cents || 0));
      const oldIsPaid = oldNextPaid > 0 && Math.max(0, oldNextPaid - oldNextTip) >= (oldAppt.price_cents || 0);

      const { error: oldUpdateErr } = await admin
        .from("appointments")
        .update({
          amount_paid_cents: oldNextPaid,
          tip_cents: oldNextTip,
          paid: oldIsPaid,
          payment_confirmed: oldNextPaid > 0,
          payment_method: oldNextPaid > 0 ? oldAppt.payment_method : null,
          payment_reference_id: oldNextPaid > 0 ? undefined : null,
        })
        .eq("id", oldAppt.id);
      if (oldUpdateErr) return json({ error: `Old appointment update failed: ${oldUpdateErr.message}` }, 500);
    }

    const targetNextPaid = (targetAppt.amount_paid_cents || 0) + (tx.total_cents || 0);
    const targetNextTip = (targetAppt.tip_cents || 0) + splitTipCents;
    const targetIsPaid = Math.max(0, targetNextPaid - targetNextTip) >= (targetAppt.price_cents || 0);
    const targetHadPriorPayment = (targetAppt.amount_paid_cents || 0) > 0 && !!targetAppt.payment_method;

    const { data: prof } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const approverName = prof?.full_name || user.email || "Owner";
    const movedAt = new Date().toISOString();

    const noteSuffix = `[Reasignado por ${approverName} a ${targetAppt.client_name} · balance ${money(splitBalanceCents)}, propina ${money(splitTipCents)}]`;
    const newNotes = tx.notes ? `${tx.notes}\n${noteSuffix}` : noteSuffix;

    const { error: txUpdateErr } = await admin
      .from("transactions")
      .update({
        appointment_id: targetAppt.id,
        client_id: targetAppt.client_id,
        barber_id: targetAppt.barber_id,
        subtotal_cents: splitBalanceCents,
        tip_cents: splitTipCents,
        allocation_method: "manual_reassign",
        approved_by_user_id: user.id,
        approved_by_name: approverName,
        approved_at: movedAt,
        notes: newNotes,
      })
      .eq("id", tx.id);
    if (txUpdateErr) return json({ error: `Transaction update failed: ${txUpdateErr.message}` }, 500);

    const { error: targetUpdateErr } = await admin
      .from("appointments")
      .update({
        amount_paid_cents: targetNextPaid,
        tip_cents: targetNextTip,
        paid: targetIsPaid,
        payment_confirmed: true,
        payment_method: targetHadPriorPayment ? targetAppt.payment_method : tx.payment_method,
      })
      .eq("id", targetAppt.id);
    if (targetUpdateErr) return json({ error: `Target appointment update failed: ${targetUpdateErr.message}` }, 500);

    void admin.from("audit_log").insert({
      user_id: user.id,
      action: "transaction_reassigned",
      entity_type: "transaction",
      entity_id: tx.id,
      metadata: {
        from_appointment_id: tx.appointment_id,
        to_appointment_id: targetAppt.id,
        previous_client_id: tx.client_id,
        new_client_id: targetAppt.client_id,
        previous_barber_id: tx.barber_id,
        new_barber_id: targetAppt.barber_id,
        amount_cents: tx.total_cents,
        previous_subtotal_cents: tx.subtotal_cents,
        previous_tip_cents: tx.tip_cents,
        split_balance_cents: splitBalanceCents,
        split_tip_cents: splitTipCents,
        approved_by_name: approverName,
      },
    });

    return json({ success: true, transaction_id: tx.id, appointment_id: targetAppt.id });
  } catch (err) {
    console.error("transaction-reassign-appointment error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
