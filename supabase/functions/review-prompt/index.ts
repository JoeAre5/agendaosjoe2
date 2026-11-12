// Post-booking Google review prompt: eligibility check + event logging.
// Fail-closed: any error => eligible:false. Never blocks booking flows.
// Access: signed-in client must own the appointment; guests must present the
// committed draftId tied to the appointment within the recent window.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { guestDraftAuthorized, isEligible, type PromptEventType } from "./rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f-]{36}$/i;
const EVENTS: PromptEventType[] = ["review_prompt_shown", "review_prompt_dismissed", "review_link_clicked"];

function normPhone(p: string | null) {
  const d = (p || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}
async function sha(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const appointmentId = String(body.appointmentId || "");
    const draftId = body.draftId ? String(body.draftId) : null;
    if (!UUID.test(appointmentId) || (draftId && !UUID.test(draftId))) return json({ eligible: false }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date();

    const { data: appt } = await admin.from("appointments")
      .select("id, client_id, client_email, client_phone, shop_id, status, cancelled_at")
      .eq("id", appointmentId).maybeSingle();
    if (!appt || appt.cancelled_at) return json({ eligible: false }, 403);

    // ── Authorization ──
    let authorized = false;
    let channel = "web_booking";
    const auth = req.headers.get("Authorization") || "";
    if (auth.startsWith("Bearer ")) {
      const { data: u } = await admin.auth.getUser(auth.slice(7));
      if (u?.user && appt.client_id) {
        const { data: c } = await admin.from("clients").select("id").eq("auth_user_id", u.user.id).maybeSingle();
        if (c?.id === appt.client_id) { authorized = true; channel = "client_portal"; }
      }
    }
    if (!authorized && draftId) {
      const { data: d } = await admin.from("booking_drafts")
        .select("status, appointment_id, committed_at").eq("id", draftId).maybeSingle();
      authorized = guestDraftAuthorized(d, appointmentId, now);
    }
    if (!authorized) return json({ eligible: false }, 403);

    const email = (appt.client_email || "").trim().toLowerCase();
    const phone = normPhone(appt.client_phone);
    const guestIdentifier = appt.client_id ? null
      : (phone || email) ? await sha(`${phone || ""}|${email}`) : null;

    if (action === "check") {
      let q = admin.from("review_prompt_events").select("event_type, created_at, appointment_id");
      if (appt.client_id) q = q.eq("client_id", appt.client_id);
      else if (guestIdentifier) q = q.eq("guest_identifier", guestIdentifier);
      else q = q.eq("appointment_id", appointmentId);
      const { data: events, error } = await q.limit(200);
      if (error) return json({ eligible: false });
      const { data: thisAppt, error: e2 } = await admin.from("review_prompt_events")
        .select("event_type, created_at, appointment_id").eq("appointment_id", appointmentId);
      if (e2) return json({ eligible: false });
      let verifiedAt: string[] = [];
      if (appt.client_id) {
        const { data: v, error: e3 } = await admin.from("client_review_verifications")
          .select("verified_at").eq("client_id", appt.client_id).eq("status", "active");
        if (e3) return json({ eligible: false });
        verifiedAt = (v || []).map((r) => r.verified_at);
      }
      return json({
        eligible: isEligible({ now, events: [...(events || []), ...(thisAppt || [])] as any, verifiedAt, appointmentId }),
      });
    }

    if (action === "record") {
      const eventType = String(body.eventType || "") as PromptEventType;
      if (!EVENTS.includes(eventType)) return json({ ok: false }, 400);
      const { error } = await admin.from("review_prompt_events").upsert({
        appointment_id: appointmentId, client_id: appt.client_id, guest_identifier: guestIdentifier,
        shop_id: appt.shop_id, event_type: eventType, channel,
      }, { onConflict: "appointment_id,event_type", ignoreDuplicates: true });
      return json({ ok: !error });
    }
    return json({ ok: false }, 400);
  } catch (e) {
    console.error("[review-prompt]", e);
    return json({ eligible: false, ok: false }, 500);
  }
});
