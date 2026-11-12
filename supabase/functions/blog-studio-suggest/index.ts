/**
 * blog-studio-suggest — guided chat helper for the Titulares AI Studio.
 *
 * Stages:
 *  - "pain_points": returns 5-6 pain-point options for the audience
 *  - "angles": returns 3 narrative angles for the chosen pain point
 *  - "question": returns the next contextual question (with optional quick-reply chips)
 *
 * Owner-only. Uses google/gemini-3-flash-preview for speed.
 */
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
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);
    const { data: isOwner } = await supabase.rpc("is_owner");
    if (!isOwner) return json({ error: "Forbidden" }, 403);

    const {
      stage,
      audience = null,
      painPoint = null,
      angle = null,
      qa = [],
      askedCount = 0,
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sys = `Eres estratega de contenido SEO/GEO para Charlie's Barbershop (Camuy, Puerto Rico).
Audiencias posibles:
- "clients": hombres de PR (15-55) buscando cortes, barba, cuidado masculino. Pain points reales: barba dispareja, caspa, cuello irritado, no saber qué corte pedir, sudor en clima tropical, productos baratos vs profesionales.
- "barbers": dueños/barberos en PR/LATAM que quieren organizar y escalar su barbería. Pain points reales: cancelaciones de último minuto, no saber cuánto produce cada barbero, propinas perdidas, citas dobles, depender solo de WhatsApp, no cobrar online, no llevar récord financiero.

Habla en el idioma del usuario (asume español PR a menos que detectes inglés).
Sé específico, local, accionable. Nada genérico.`;

    let toolName = "";
    let toolParams: any = {};
    let userMsg = "";

    if (stage === "pain_points") {
      toolName = "return_pain_points";
      toolParams = {
        type: "object",
        properties: {
          pain_points: {
            type: "array",
            minItems: 5,
            maxItems: 6,
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Frase corta en primera persona, ≤8 palabras" },
                hint: { type: "string", description: "Una línea explicando por qué duele" },
              },
              required: ["label", "hint"],
              additionalProperties: false,
            },
          },
        },
        required: ["pain_points"],
        additionalProperties: false,
      };
      userMsg = `Audiencia: ${audience === "barbers" ? "barberos/dueños de barbería" : "clientes de la barbería"}.
Genera 5-6 pain points reales y específicos que esa audiencia BUSCARÍA en Google o le preguntaría a ChatGPT.
Mezcla: técnicos, emocionales, de negocio (si barbers), de apariencia (si clients).`;
    } else if (stage === "angles") {
      toolName = "return_angles";
      toolParams = {
        type: "object",
        properties: {
          angles: {
            type: "array",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Nombre del ángulo, ≤6 palabras" },
                description: { type: "string", description: "Una línea de qué cubrirá" },
              },
              required: ["label", "description"],
              additionalProperties: false,
            },
          },
        },
        required: ["angles"],
        additionalProperties: false,
      };
      userMsg = `Audiencia: ${audience}. Pain point elegido: "${painPoint}".
Propón 3 ángulos narrativos distintos para abordarlo (ej: guía paso-a-paso, mito vs realidad, historia desde la silla, comparativa, checklist).`;
    } else if (stage === "question") {
      toolName = "return_question";
      toolParams = {
        type: "object",
        properties: {
          question: { type: "string", description: "Pregunta corta, conversacional, ≤20 palabras" },
          quick_replies: {
            type: "array",
            maxItems: 4,
            items: { type: "string" },
            description: "Opciones rápidas para tap (vacío si requiere texto libre)",
          },
          done: { type: "boolean", description: "true si ya tienes suficiente contexto y no hace falta más preguntas" },
        },
        required: ["question", "quick_replies", "done"],
        additionalProperties: false,
      };
      const qaText = qa.map((x: any, i: number) => `${i + 1}. P: ${x.q}\n   R: ${x.a}`).join("\n");
      userMsg = `Audiencia: ${audience}. Pain point: "${painPoint}". Ángulo: "${angle}".
Preguntas ya hechas (${askedCount}):
${qaText || "(ninguna)"}

Haz UNA pregunta más para añadir contexto valioso al artículo. Máximo 5 preguntas en total.
Si ya tienes 3+ respuestas con buena info, marca done=true y devuelve question="" quick_replies=[].
Cuando aplique, ofrece 2-4 quick_replies tappeables. Para preguntas abiertas (anécdotas), deja quick_replies=[].`;
    } else {
      return json({ error: "invalid_stage" }, 400);
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        tools: [{ type: "function", function: { name: toolName, description: "Return structured suggestions.", parameters: toolParams } }],
        tool_choice: { type: "function", function: { name: toolName } },
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
    const args = JSON.parse(call.function.arguments);

    return json(args);
  } catch (e) {
    console.error("blog-studio-suggest", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
