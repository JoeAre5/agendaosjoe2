// Scheduled every 5 min. Alerts owners when a customer paid (draft claimed
// for commit) but the appointment was not confirmed within 5 minutes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { notifyOwners } from "../_shared/notifyOwners.ts";
import { isInternalCaller, unauthorizedResponse } from "../_shared/internalAuth.ts";

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  if (!(await isInternalCaller(req, admin))) return unauthorizedResponse();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

  const { data: drafts, error } = await admin
    .from("booking_drafts")
    .select("id, first_name, last_name, datetime, total_cents, status, claimed_at, acuity_attempted_at")
    .not("status", "in", "(committed,refunded,expired)")
    .is("appointment_id", null)
    .is("stuck_alerted_at", null)
    .or(`claimed_at.lt.${cutoff},acuity_attempted_at.lt.${cutoff}`)
    .gte("created_at", since)
    .limit(20);

  if (error) {
    console.error("[alert-stuck-drafts]", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  for (const d of drafts ?? []) {
    const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || "Cliente";
    const amount = ((d.total_cents ?? 0) / 100).toFixed(2);
    const when = d.datetime ? new Date(d.datetime).toLocaleString("es-PR", {
      timeZone: "America/Puerto_Rico", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit",
    }) : "";
    await notifyOwners({
      title: "Pago sin cita confirmada",
      body: `${name} pagó $${amount} (${when}) pero la cita no se confirmó en 5 minutos. Revísalo.`,
      url: "/admin",
      tag: `stuck-draft-${d.id}`,
    });
    await admin.from("booking_drafts").update({ stuck_alerted_at: new Date().toISOString() }).eq("id", d.id);
  }

  return new Response(JSON.stringify({ alerted: drafts?.length ?? 0 }), {
    headers: { "Content-Type": "application/json" },
  });
});
