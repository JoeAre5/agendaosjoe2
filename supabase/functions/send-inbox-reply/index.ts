// send-inbox-reply — owner-only wrapper that sends a manual reply via the
// inbox-reply transactional template. Forwards to send-transactional-email
// using the service-role key (required by that function).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return json({ error: "unauthorized" }, 401);
    const { data: isOwner } = await supabase.rpc("is_owner");
    if (!isOwner) return json({ error: "forbidden" }, 403);

    const { recipientEmail, name, subject, body, language = "es", submissionId } = await req.json();
    if (!recipientEmail || !body) return json({ error: "missing_fields" }, 400);

    const idempotencyKey = `inbox-reply-${submissionId || crypto.randomUUID()}-${Date.now()}`;
    const finalSubject = subject?.trim()
      ? (subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`)
      : undefined;

    const r = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: "inbox-reply",
        recipientEmail,
        idempotencyKey,
        templateData: { name, bodyText: body, language, subject: finalSubject },
      }),
    });
    const respBody = await r.text();
    if (!r.ok) return json({ error: "send_failed", detail: respBody.slice(0, 500) }, 502);

    if (submissionId) {
      await supabase.from("contact_submissions")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("id", submissionId);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: "server_error", detail: String((e as Error).message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
