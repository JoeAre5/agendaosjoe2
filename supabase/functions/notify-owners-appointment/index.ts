// Server-side push to owner devices for client-portal events that aren't
// already handled inside another edge function. Currently used by the
// client reschedule flow (which runs entirely client-side via acuity-proxy).
//
// Body: { appointment_id: string, kind: "reschedule" | "new" | "cancel" }
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { notifyOwners } from "../_shared/notifyOwners.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const appointment_id = String(body.appointment_id || "");
    const kind = String(body.kind || "reschedule") as "reschedule" | "new" | "cancel";
    if (!appointment_id) return json({ error: "appointment_id required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorize: caller must own the appointment via clients.auth_user_id.
    const { data: appt } = await admin
      .from("appointments")
      .select("id, client_id, service_name, starts_at, client_name")
      .eq("id", appointment_id)
      .maybeSingle();
    if (!appt) return json({ error: "Appointment not found" }, 404);

    const { data: clientRow } = await admin
      .from("clients")
      .select("id, first_name, last_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!clientRow || clientRow.id !== appt.client_id) {
      return json({ error: "Forbidden" }, 403);
    }

    const clientName =
      `${clientRow.first_name ?? ""} ${clientRow.last_name ?? ""}`.trim() ||
      appt.client_name ||
      "Cliente";

    const dateStr = new Date(appt.starts_at).toLocaleString("es-PR", {
      timeZone: "America/Puerto_Rico",
      weekday: "short", day: "2-digit", month: "short",
      hour: "numeric", minute: "2-digit", hour12: true,
    });

    const titleByKind = {
      reschedule: "Cita reprogramada (Cliente)",
      new: "Nueva cita (App cliente)",
      cancel: "Cita cancelada (Cliente)",
    } as const;
    const verbByKind = {
      reschedule: "movió",
      new: "reservó",
      cancel: "canceló",
    } as const;

    const kindLabelEs = kind === "reschedule" ? "reprogramada" : kind === "cancel" ? "cancelada" : "nueva";
    const verb = verbByKind[kind] ?? "actualizó";
    await notifyOwners({
      event_key: kind === "cancel" ? "admin_booking_cancelled" : "admin_appointment_changed",
      vars: {
        client: clientName,
        service: appt.service_name || "su cita",
        date: dateStr,
        appointment_id,
        kind_label: kindLabelEs,
        verb,
      },
      defaults: {
        title: titleByKind[kind] ?? titleByKind.reschedule,
        body: `${clientName} ${verb} ${appt.service_name || "su cita"}, ${dateStr}.`,
        url: `/admin/appointment/${appointment_id}`,
        tag: `${kind}-${appointment_id}`,
      },
    });

    return json({ ok: true });
  } catch (err) {
    console.error("[notify-owners-appointment]", err);
    return json({ error: (err as Error).message }, 500);
  }
});
