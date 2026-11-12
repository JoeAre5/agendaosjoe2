// Owner-only: revert a completed transaction back to pending_review.
//
// What it does atomically (service role):
//  1. If transaction is linked to an appointment, subtract only this payment
//     from the appointment totals. Other payments on the same appointment stay intact.
//  2. Detach the transaction from the appointment (appointment_id=null, client_id=null)
//  3. Reset transaction to pending_review (clears approver fields + allocation_method)
//  4. Append a note explaining who reverted and when
//  5. Insert audit_log row
//
// Realtime subscribers in usePendingTransactionAlerts pick up the UPDATE → status=pending_review
// and the row reappears in the "Pendientes" filter automatically.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // --- Authn: must be a logged-in OWNER -------------------------------
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

    // --- Body -----------------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const transaction_id = String(body.transaction_id || "");
    if (!transaction_id) return json({ error: "transaction_id required" }, 400);

    // --- Load transaction ----------------------------------------------
    const { data: tx, error: txErr } = await admin
      .from("transactions")
      .select("id, status, appointment_id, payment_method, total_cents, tip_cents, notes, barber_id, client_id, type")
      .eq("id", transaction_id)
      .maybeSingle();
    if (txErr) return json({ error: txErr.message }, 500);
    if (!tx) return json({ error: "Transaction not found" }, 404);

    if (tx.status === "pending_review") {
      return json({ skipped: true, reason: "already_pending" });
    }
    if (tx.status === "failed") {
      return json({ error: "Cannot revert a failed transaction" }, 400);
    }
    if (tx.type === "product_sale" && !tx.appointment_id) {
      // Standalone product sales have no appointment to "unpay" — block to avoid orphan pending entries
      return json({ error: "Standalone product sales cannot be reverted to pending. Delete instead." }, 400);
    }

    // --- Approver display name -----------------------------------------
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const approverName = prof?.full_name || user.email || "Owner";
    const revertedAt = new Date().toISOString();

    // --- 1. Remove only this payment from the linked appointment --------
    let unpaidApptId: string | null = null;
    if (tx.appointment_id) {
      const { data: appt, error: apptLoadErr } = await admin
        .from("appointments")
        .select("id, price_cents, amount_paid_cents, tip_cents, payment_method")
        .eq("id", tx.appointment_id)
        .maybeSingle();
      if (apptLoadErr) return json({ error: `Appointment load failed: ${apptLoadErr.message}` }, 500);

      const nextAmountPaid = Math.max(0, (appt?.amount_paid_cents || 0) - (tx.total_cents || 0));
      const nextTip = Math.max(0, (appt?.tip_cents || 0) - (tx.tip_cents || 0));
      const nextPaid = nextAmountPaid > 0 && Math.max(0, nextAmountPaid - nextTip) >= (appt?.price_cents || 0);

      const { error: apptErr } = await admin
        .from("appointments")
        .update({
          paid: nextPaid,
          payment_confirmed: nextAmountPaid > 0,
          amount_paid_cents: nextAmountPaid,
          payment_method: nextAmountPaid > 0 ? appt?.payment_method : null,
          payment_reference_id: nextAmountPaid > 0 ? undefined : null,
          tip_cents: nextTip,
        })
        .eq("id", tx.appointment_id);
      if (apptErr) return json({ error: `Appointment unpay failed: ${apptErr.message}` }, 500);
      unpaidApptId = tx.appointment_id;
    }

    // --- 2 + 3. Reset transaction --------------------------------------
    const noteSuffix = `[Revertido a pendiente por ${approverName} el ${new Date(revertedAt).toLocaleString("es-PR", { timeZone: "America/Puerto_Rico" })}]`;
    const newNotes = tx.notes ? `${tx.notes}\n${noteSuffix}` : noteSuffix;

    const { error: revertErr } = await admin
      .from("transactions")
      .update({
        status: "pending_review",
        appointment_id: null,
        client_id: null,
        approved_by_user_id: null,
        approved_by_name: null,
        approved_at: null,
        allocation_method: null,
        notes: newNotes,
      })
      .eq("id", transaction_id);
    if (revertErr) return json({ error: `Transaction revert failed: ${revertErr.message}` }, 500);

    // --- 4. Audit log (best-effort) ------------------------------------
    void admin.from("audit_log").insert({
      user_id: user.id,
      action: "transaction_reverted_to_pending",
      entity_type: "transaction",
      entity_id: transaction_id,
      metadata: {
        previous_status: tx.status,
        appointment_id_unlinked: unpaidApptId,
        amount_cents: tx.total_cents,
        payment_method: tx.payment_method,
        approved_by_name: approverName,
      },
    });

    return json({
      success: true,
      transaction_id,
      appointment_unpaid: unpaidApptId,
    });
  } catch (err) {
    console.error("transaction-revert-to-pending error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});
