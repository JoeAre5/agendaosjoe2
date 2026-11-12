// filo-reply-suggest — generates a polished reply draft for an inbound email
// thread in the Bandeja inbox. Owner-only. Uses Lovable AI (gemini-2.5-flash).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ThreadMsg { from?: string; date?: string; subject?: string; body?: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return json({ error: "unauthorized" }, 401);
    const { data: isOwner } = await supabase.rpc("is_owner");
    if (!isOwner) return json({ error: "forbidden" }, 403);

    const { thread = [], language = "es", recipientName = "" } = await req.json() as {
      thread: ThreadMsg[]; language?: "es" | "en"; recipientName?: string;
    };
    if (!Array.isArray(thread) || thread.length === 0) return json({ error: "thread_required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "ai_not_configured" }, 500);

    const es = language !== "en";
    const sys = es
      ? `Eres Charlie Corchado, dueño de Charlie's Barbershop en Camuy, PR. Respondes correos de clientes con calidez, profesionalismo y brevedad (3-6 oraciones). Tono cercano de PR pero pulido. NO uses guiones em (—); usa comas o paréntesis. NO firmes (la firma se añade automáticamente). NO incluyas saludo "Hola X" (ya se añade). Solo el cuerpo del mensaje.`
      : `You are Charlie Corchado, owner of Charlie's Barbershop in Camuy, PR. Reply to customer emails warmly, professionally, briefly (3-6 sentences). Friendly Puerto Rican tone but polished. Do NOT use em dashes; use commas or parentheses. Do NOT sign off (signature is appended). Do NOT include "Hi X" greeting (it's added). Only the message body.`;

    const threadStr = thread.map((m, i) =>
      `[${i + 1}] From: ${m.from || "?"}  Date: ${m.date || "?"}\nSubject: ${m.subject || "(no subject)"}\n${(m.body || "").slice(0, 2000)}`
    ).join("\n\n---\n\n");

    const userPrompt = (es
      ? `Hilo de correo (más reciente al final):\n\n${threadStr}\n\nDestinatario: ${recipientName || "(sin nombre)"}\n\nEscribe SOLO el cuerpo de la respuesta en español PR.`
      : `Email thread (most recent last):\n\n${threadStr}\n\nRecipient: ${recipientName || "(no name)"}\n\nWrite ONLY the reply body in English.`);

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: userPrompt }],
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      return json({ error: "ai_failed", detail: txt.slice(0, 500) }, 502);
    }
    const data = await r.json();
    const draft = (data?.choices?.[0]?.message?.content || "").trim();
    return json({ draft });
  } catch (e) {
    return json({ error: "server_error", detail: String((e as Error).message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
