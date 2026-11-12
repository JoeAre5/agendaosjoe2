/**
 * blog-studio-generate — final article generation from collected studio context.
 *
 * Input: { audience, painPoint, angle, qa: [{q,a}], language: 'es'|'en' }
 * Output: { post: { ...full bilingual post + faq_es + faq_en } }
 *
 * Owner-only. Uses google/gemini-2.5-pro with tool-calling.
 * Builds on blog-wizard-generate but adds: explicit pain/angle/QA context,
 * FAQ block (3-4 Q&A per language) for FAQPage JSON-LD on the public post.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ICONS = [
  "newspaper", "scissors", "sparkles", "star", "flame", "crown",
  "calendar", "clock", "trophy", "heart", "zap", "trending-up",
  "droplet", "droplets", "cloud", "cloud-rain", "cloud-sun", "sun", "moon",
  "wind", "umbrella", "thermometer", "leaf", "palm-tree", "music",
  "armchair", "store", "landmark", "palette", "coffee", "award",
  "gift", "map-pin", "shield", "spray-can", "comb", "wrench",
];
const BGS = ["primary-gradient", "accent-solid", "dark-gradient", "warm-gradient", "cool-gradient"];

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
      audience = "clients",
      painPoint = "",
      angle = "",
      qa = [],
      category = null,
      language = "es",
    } = await req.json();

    if (!painPoint.trim() || !angle.trim()) return json({ error: "context_required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const qaBlock = qa.map((x: any, i: number) => `Q${i + 1}: ${x.q}\nA${i + 1}: ${x.a}`).join("\n\n");

    const sys = `Eres editor en jefe del boletín de Charlie's Barbershop (Camuy, PR). Generas artículos bilingües (español PR + inglés americano) optimizados para Google SEO Y para que LLMs (ChatGPT, Perplexity, Gemini, Claude) los citen como fuente.

REGLAS DE FORMATO (críticas):
- Cuerpo en Markdown PURO. NUNCA bloques de código (no \`\`\`).
- NO uses # (H1). Usa ## para subtítulos.
- **negrita** solo para 1-2 frases clave por sección.
- Listas con guiones (- ítem). > para citas reales.
- Párrafos cortos (2-4 líneas). Cuerpo 500-800 palabras por idioma.

REGLAS DE SEO + GEO (críticas):
1. **Title**: refleja la consulta long-tail real que la audiencia escribiría. ≤60 chars.
2. **Primer párrafo**: responde la pregunta central en 2-3 oraciones (sweet spot featured snippet + cita LLM).
3. **3-5 H2 en forma de pregunta** (mimic "People Also Ask"): "¿Por qué...?", "¿Cuánto...?", "¿Cómo...?"
4. **FAQ final**: 3-4 preguntas frecuentes con respuestas de 1-3 oraciones (se renderizan como FAQPage JSON-LD).
5. **Anclajes locales**: "Camuy", "Puerto Rico", "Charlie's Barbershop" naturalmente.
6. **Señales de confianza GEO**: menciona la experiencia de Charlie (20+ años), nombres reales (Pito, Joseph) cuando aplique. LLMs favorecen contenido específico, fuentes nombradas.
7. NO traduzcas nombres propios (Charlie, Pito, Joseph, Camuy, Puerto Rico).

REGLAS DE CONTENIDO:
- Audiencia: ${audience === "barbers" ? "BARBEROS y dueños de barbería que quieren escalar su negocio (mencionar AgendaOS/Charlie's plataforma cuando aplique con naturalidad)" : "CLIENTES (hombres en PR buscando grooming)"}.
- Voz: cercana, profesional, auténtica de PR. Sin clichés.
- USA el contexto que el editor te dio (pain point, ángulo, respuestas) — no inventes ejemplos genéricos.

CONFIGURACIÓN VISUAL:
- Cover icon (primary): UNO de la lista que represente el tema.
- Cover icon (secondary): opcional, segundo ícono SOLO si añade contexto. Sino null.
- Cover bg preset: UNO de [${BGS.join(", ")}].
- Íconos permitidos: [${ICONS.join(", ")}].
- Idioma autor: ${language === "es" ? "español primero" : "inglés primero"}, luego traducción nativa.`;

    const userMsg = `CONTEXTO DEL EDITOR:
Audiencia: ${audience}
Pain point: "${painPoint}"
Ángulo narrativo: "${angle}"
Categoría: ${category || "general"}

Respuestas del editor:
${qaBlock || "(sin respuestas adicionales)"}

Genera el artículo completo bilingüe optimizado para SEO + GEO, incluyendo el FAQ final.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_post",
            description: "Return the full bilingual SEO+GEO optimized post.",
            parameters: {
              type: "object",
              properties: {
                title_es: { type: "string" },
                excerpt_es: { type: "string" },
                body_es: { type: "string" },
                title_en: { type: "string" },
                excerpt_en: { type: "string" },
                body_en: { type: "string" },
                snapshot_es: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
                snapshot_en: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
                seo_title_es: { type: "string", maxLength: 60 },
                seo_description_es: { type: "string", maxLength: 155 },
                seo_title_en: { type: "string", maxLength: 60 },
                seo_description_en: { type: "string", maxLength: 155 },
                faq_es: {
                  type: "array", minItems: 3, maxItems: 4,
                  items: {
                    type: "object",
                    properties: { q: { type: "string" }, a: { type: "string" } },
                    required: ["q", "a"], additionalProperties: false,
                  },
                },
                faq_en: {
                  type: "array", minItems: 3, maxItems: 4,
                  items: {
                    type: "object",
                    properties: { q: { type: "string" }, a: { type: "string" } },
                    required: ["q", "a"], additionalProperties: false,
                  },
                },
                cover_icon: { type: "string", enum: ICONS },
                cover_icon_secondary: { type: ["string", "null"], enum: [...ICONS, null] },
                cover_bg_preset: { type: "string", enum: BGS },
              },
              required: [
                "title_es", "excerpt_es", "body_es",
                "title_en", "excerpt_en", "body_en",
                "snapshot_es", "snapshot_en",
                "seo_title_es", "seo_description_es",
                "seo_title_en", "seo_description_en",
                "faq_es", "faq_en",
                "cover_icon", "cover_icon_secondary", "cover_bg_preset",
              ],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_post" } },
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

    // Append FAQ to body markdown so it's editable in the editor too.
    const appendFaq = (body: string, faq: any[], heading: string) => {
      if (!faq?.length) return body;
      const block = `\n\n## ${heading}\n\n` + faq.map((f) => `**${f.q}**\n\n${f.a}`).join("\n\n");
      return body + block;
    };
    args.body_es = appendFaq(args.body_es, args.faq_es, "Preguntas Frecuentes");
    args.body_en = appendFaq(args.body_en, args.faq_en, "Frequently Asked Questions");

    return json({ post: args });
  } catch (e) {
    console.error("blog-studio-generate", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
