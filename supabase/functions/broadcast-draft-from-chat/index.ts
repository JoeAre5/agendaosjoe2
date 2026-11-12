/**
 * broadcast-draft-from-chat — owner-only.
 * Reads an admin FilhoChat conversation, asks Lovable AI to summarize it as a
 * push-notification broadcast (bilingual ES/EN), inserts a draft row in
 * `broadcasts`, and returns the new id.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const URL_PRESETS = [
  "/app/cliente",
  "/app/cliente/nueva-cita",
  "/app/cliente?tab=citas",
  "/app/cliente?tab=beneficios",
  "/app/cliente?tab=perfil",
  "/app/cliente?tab=contacto",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return json({ error: "unauthorized" }, 401);
    const { data: isOwner } = await supabase.rpc("is_owner");
    if (!isOwner) return json({ error: "forbidden" }, 403);

    const { conversation_id } = await req.json();
    if (!conversation_id) return json({ error: "conversation_id_required" }, 400);

    // Verify conversation is admin-role.
    const { data: conv } = await supabase
      .from("filho_conversations")
      .select("id, role, summary")
      .eq("id", conversation_id)
      .maybeSingle();
    if (!conv || conv.role !== "admin") return json({ error: "conversation_not_found" }, 404);

    // Pull the message log.
    const { data: messages } = await supabase
      .from("filho_messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(80);

    const transcript = (messages ?? [])
      .filter((m) => m.content && m.role !== "tool")
      .map((m) => `[${m.role}] ${m.content}`)
      .join("\n\n")
      .slice(0, 12000);

    if (!transcript.trim()) return json({ error: "empty_conversation" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "ai_not_configured" }, 500);

    const sys = `Eres editor de comunicación para Charlie's Barbershop en Camuy, PR. Convierte una conversación interna del dueño con su asistente IA "Filho" en un BORRADOR de push notification para los clientes.

Reglas:
- Bilingüe: español de Puerto Rico (es_PR) e inglés americano. Calidad nativa, no traducción literal.
- Pill (etiqueta corta arriba): 1-3 palabras, mayúscula tipo título. Opcional pero recomendado.
- Title: <= 60 caracteres, mayúsculas. Gancho claro y específico.
- Body: 1-2 oraciones cortas (<= 140 chars). Beneficio para el cliente, no jerga interna.
- CTA label: 1-3 palabras imperativas (ej "Reservar", "Ver más").
- cta_url: elige UNA de la lista permitida que mejor encaje con el mensaje. Default: "/app/cliente".
- Tono: cercano, profesional, sin emojis, sin guiones largos (—), sin clichés.
- NUNCA copies texto literal del transcript: extrae la idea y reescribe para clientes.
- Si la conversación no genera un mensaje claro para clientes, devuelve un borrador genérico de novedad.

URLs permitidos: ${URL_PRESETS.join(", ")}.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content:
              `Resumen previo (puede estar vacío): ${conv.summary || "(ninguno)"}\n\n` +
              `Transcript:\n${transcript}\n\n` +
              `Genera un borrador de push notification listo para revisar.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_broadcast_draft",
            description: "Bilingual push-notification broadcast draft.",
            parameters: {
              type: "object",
              properties: {
                pill_es: { type: "string", maxLength: 28 },
                pill_en: { type: "string", maxLength: 28 },
                title_es: { type: "string", maxLength: 60 },
                title_en: { type: "string", maxLength: 60 },
                body_es: { type: "string", maxLength: 200 },
                body_en: { type: "string", maxLength: 200 },
                cta_label_es: { type: "string", maxLength: 24 },
                cta_label_en: { type: "string", maxLength: 24 },
                cta_url: { type: "string", enum: URL_PRESETS },
              },
              required: [
                "title_es", "title_en", "body_es", "body_en",
                "cta_label_es", "cta_label_en", "cta_url",
              ],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_broadcast_draft" } },
      }),
    });

    if (aiResp.status === 429) return json({ error: "rate_limited" }, 429);
    if (aiResp.status === 402) return json({ error: "credits_exhausted" }, 402);
    if (!aiResp.ok) {
      console.error("AI error", aiResp.status, await aiResp.text());
      return json({ error: "ai_error" }, 500);
    }
    const aiData = await aiResp.json();
    const call = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: "no_tool_call" }, 500);
    const draft = JSON.parse(call.function.arguments);

    // Insert draft row.
    const { data: inserted, error: insertErr } = await supabase
      .from("broadcasts")
      .insert({
        pill_es: draft.pill_es?.trim() || null,
        pill_en: draft.pill_en?.trim() || null,
        title_es: draft.title_es.trim(),
        title_en: draft.title_en.trim(),
        body_es: draft.body_es.trim(),
        body_en: draft.body_en.trim(),
        cta_label_es: draft.cta_label_es?.trim() || null,
        cta_label_en: draft.cta_label_en?.trim() || null,
        cta_url: draft.cta_url || "/app/cliente",
        status: "draft",
        created_by: userData.user.id,
      })
      .select("id")
      .single();
    if (insertErr) return json({ error: insertErr.message }, 500);

    return json({ broadcast_id: inserted.id, draft });
  } catch (e) {
    console.error("broadcast-draft-from-chat", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
