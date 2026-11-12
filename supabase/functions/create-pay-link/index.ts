// create-pay-link — issues a signed pay-link code for one appointment.
// Staff only. Barbers may only issue codes for their own appointments.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
import { signPayLink } from "../_shared/payLink.ts";

function json(body: unknown, status = 200) {
  if (status >= 400) console.warn("create-pay-link rejected", status, JSON.stringify(body));
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const { data: u } = await admin.auth.getUser(auth.slice(7));
  const uid = u?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);

  let body: { appointmentId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const id = String(body.appointmentId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "invalid_appointment" }, 400);

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  const r = (roles ?? []).map((x: { role: string }) => x.role);
  const isManager = r.some((x) => ["owner", "super_owner", "manager", "staff"].includes(x));
  const isBarber = r.includes("barber");
  if (!isManager && !isBarber) return json({ error: "forbidden" }, 403);

  const { data: appt } = await admin.from("appointments")
    .select("id, status, barber_id, price_cents, amount_paid_cents").eq("id", id).maybeSingle();
  if (!appt) return json({ error: "appointment_not_found" }, 404);
  if (!isManager) {
    const { data: prof } = await admin.from("profiles").select("barber_id").eq("id", uid).maybeSingle();
    if (!prof?.barber_id || prof.barber_id !== appt.barber_id) return json({ error: "forbidden" }, 403);
  }
  if (appt.status === "cancelled") return json({ error: "appointment_cancelled" }, 409);
  const balance = Math.max(0, (appt.price_cents || 0) - (appt.amount_paid_cents || 0));
  if (balance <= 0) return json({ error: "already_paid" }, 409);

  try {
  const { code, expiresAt } = await signPayLink(appt.id, balance);
  return json({ code, balanceCents: balance, expiresAt });
  } catch (e) { console.error("create-pay-link sign failed", (e as Error).message); return json({ error: "sign_failed" }, 500); }
});
