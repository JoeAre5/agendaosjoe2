// Inbound email webhook — receives parsed email payloads from a Google Apps
// Script poller running on charliesbarbershop.camuy@gmail.com. Stores each
// reply in contact_submissions (source='email_reply') and notifies all owners.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { notifyOwners } from "../_shared/notifyOwners.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

interface InboundPayload {
  gmail_message_id: string;
  gmail_thread_id?: string;
  from_name?: string;
  from_email: string;
  to_email?: string;
  cc_email?: string;
  subject?: string;
  body_plain?: string;
  received_at?: string;
  in_reply_to?: string;   // RFC 5322 In-Reply-To header
  references?: string;    // RFC 5322 References header
}

function splitName(full?: string) {
  const s = (full || "").trim();
  if (!s) return { first: "Sin nombre", last: null as string | null };
  const parts = s.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") || null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Shared secret authentication (Apps Script sends X-Webhook-Secret header)
  const expected = Deno.env.get("INBOUND_EMAIL_WEBHOOK_SECRET");
  const provided = req.headers.get("x-webhook-secret") || "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: InboundPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!payload.gmail_message_id || !payload.from_email) {
    return new Response(JSON.stringify({ error: "missing gmail_message_id or from_email" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ============================================================
  // 🛡️ STRICT FILTER — only accept replies to OUR outbound mail
  // ------------------------------------------------------------
  // Rule: the email must be addressed TO one of our sender addresses
  //   (noreply@ or news@ on charliesbarber.co / charliesbarbershop.co)
  // AND must have an In-Reply-To / References header (i.e., it's a
  // threaded reply to a message WE sent — not a cold inbound).
  //
  // This eliminates 100% of unrelated inbox noise without relying on
  // subject-line heuristics.
  //
  // Kill switch: set INBOUND_EMAIL_PAUSED=true to drop EVERYTHING.
  // ============================================================
  if ((Deno.env.get("INBOUND_EMAIL_PAUSED") || "").toLowerCase() === "true") {
    return new Response(JSON.stringify({ ok: true, ignored: "paused" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const recipients = `${payload.to_email || ""} ${payload.cc_email || ""}`.toLowerCase();
  const addressedToUs =
    recipients.includes("noreply@charliesbarber") ||
    recipients.includes("news@charliesbarber") ||
    recipients.includes("noreply@charliesbarbershop") ||
    recipients.includes("news@charliesbarbershop");

  const isThreadedReply = !!(payload.in_reply_to?.trim() || payload.references?.trim());

  if (!addressedToUs || !isThreadedReply) {
    return new Response(
      JSON.stringify({
        ok: true,
        ignored: !addressedToUs ? "not_addressed_to_us" : "not_a_threaded_reply",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Idempotency: if we've already ingested this Gmail message, skip silently
  const { data: existing } = await admin
    .from("contact_submissions")
    .select("id")
    .eq("gmail_message_id", payload.gmail_message_id)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ ok: true, duplicate: true, id: existing.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Try to match an existing client by email
  const fromEmail = payload.from_email.trim().toLowerCase();
  const { data: clientMatch } = await admin
    .from("clients")
    .select("id")
    .ilike("email", fromEmail)
    .limit(1)
    .maybeSingle();

  // Newsletter replies are addressed to news@; everything else is a
  // generic reply to noreply@.
  const toLower = (payload.to_email || "").toLowerCase();
  const isNewsletter = toLower.includes("news@");

  const { first, last } = splitName(payload.from_name);
  const trimmedBody = (payload.body_plain || "").trim().slice(0, 8000);

  const { data: inserted, error: insertErr } = await admin
    .from("contact_submissions")
    .insert({
      first_name: first,
      last_name: last,
      email: fromEmail,
      phone: null,
      message: trimmedBody || "(sin contenido)",
      subject: payload.subject || null,
      from_email: fromEmail,
      to_email: payload.to_email || null,
      gmail_message_id: payload.gmail_message_id,
      gmail_thread_id: payload.gmail_thread_id || null,
      language: "es",
      source: isNewsletter ? "newsletter_reply" : "email_reply",
      status: "new",
      matched_client_id: clientMatch?.id ?? null,
      is_existing_client: !!clientMatch?.id,
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("[inbound-email] insert failed", insertErr);
    return new Response(JSON.stringify({ error: insertErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Push-notify all owner devices via shared helper.
  // Throttle: skip push if another reply on the same Gmail thread already
  // notified the owner within the last 5 minutes (prevents push spam during
  // a rapid back-and-forth burst).
  let shouldPush = true;
  if (payload.gmail_thread_id) {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("contact_submissions")
      .select("id")
      .eq("gmail_thread_id", payload.gmail_thread_id)
      .neq("id", inserted.id)
      .gte("created_at", fiveMinAgo)
      .limit(1)
      .maybeSingle();
    if (recent) shouldPush = false;
  }

  if (shouldPush) {
    const senderLabel = payload.from_name?.trim() || fromEmail;
    const subjPreview = (payload.subject || "(sin asunto)").slice(0, 80);
    await notifyOwners({
      event_key: "admin_email_reply",
      vars: { sender: senderLabel, subject: subjPreview },
      defaults: {
        title: isNewsletter ? "📬 Respuesta al newsletter" : "📬 Nuevo email",
        body: `${senderLabel}: ${subjPreview}`,
        url: "https://charliesbarbershop.co/admin/bandeja",
        tag: payload.gmail_thread_id ? `thread-${payload.gmail_thread_id}` : `inbound-${inserted.id}`,
      },
    });
  }

  return new Response(JSON.stringify({ ok: true, id: inserted.id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
