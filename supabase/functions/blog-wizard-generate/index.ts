/**
 * blog-wizard-generate — one-shot bilingual draft generator.
 *
 * Input: { topic: string, category?: string, language?: 'es'|'en' }
 * Output: {
 *   title_es, excerpt_es, body_es (markdown),
 *   title_en, excerpt_en, body_en (markdown),
 *   snapshot_es: string[], snapshot_en: string[],
 *   seo_title_es, seo_description_es, seo_title_en, seo_description_en,
 *   cover_icon, cover_bg_preset
 * }
 *
 * Uses Lovable AI Gateway with tool-calling for structured output. Owner-only.
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
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);
    const { data: isOwner } = await supabase.rpc("is_owner");
    if (!isOwner) return json({ error: "Forbidden" }, 403);

    const { topic = "", category = null, language = "es" } = await req.json();
    if (!topic.trim()) return json({ error: "topic_required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sys = `Eres editor en jefe del boletín de Charlie's Barbershop en Camuy, Puerto Rico. Generas artículos completos bilingües (español de Puerto Rico e inglés americano) sobre cuidado masculino, cortes, barba y cultura local.

REGLAS DE FORMATO (críticas):
- Cuerpo en Markdown PURO. NUNCA envuelvas el cuerpo en bloques de código (no \`\`\`, no '''). Empieza directamente con el primer párrafo o subtítulo.
- NO uses # (H1) — el título ya se renderiza aparte. Usa ## para subtítulos de sección.
- Usa **negrita** SOLO para 1-2 frases clave por sección, no decorativo.
- Listas con guiones (- ítem). Blockquote con > para citas reales.
- Párrafos cortos (2-4 líneas).
- Cuerpo de 400-700 palabras por idioma.

REGLAS DE CONTENIDO:
- Voz cercana, profesional, auténtica de PR. Sin clichés.
- NO traduzcas nombres propios (Charlie, Pito, Joseph, Camuy, Puerto Rico).
- SEO title ≤60 chars, SEO description ≤155 chars.
- Snapshot: 3-5 viñetas cortas (≤14 palabras c/u) por idioma.
- Cover icon (primary): elige UNO de la lista que represente el tema central.
- Cover icon (secondary): opcional. Elige un segundo ícono de la lista SOLO si añade contexto valioso (ej: barba+humedad → primary "scissors", secondary "droplet"). Si no aplica, devuelve null.
- Cover bg preset: elige UNO de [${BGS.join(", ")}].
- Lista de íconos permitidos: [${ICONS.join(", ")}].
- Idioma de origen del autor: ${language === "es" ? "español" : "inglés"} — escribe ese primero, luego traduce con calidad nativa.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Tema: ${topic}\nCategoría: ${category || "general"}\n\nGenera el artículo completo bilingüe.` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_post",
            description: "Return the full bilingual post.",
            parameters: {
              type: "object",
              properties: {
                title_es: { type: "string" },
                excerpt_es: { type: "string" },
                body_es: { type: "string", description: "Markdown body in Spanish" },
                title_en: { type: "string" },
                excerpt_en: { type: "string" },
                body_en: { type: "string", description: "Markdown body in English" },
                snapshot_es: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
                snapshot_en: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
                seo_title_es: { type: "string", maxLength: 60 },
                seo_description_es: { type: "string", maxLength: 155 },
                seo_title_en: { type: "string", maxLength: 60 },
                seo_description_en: { type: "string", maxLength: 155 },
                cover_icon: { type: "string", enum: ICONS },
                cover_icon_secondary: { type: ["string", "null"], enum: [...ICONS, null], description: "Optional second icon for context (e.g. droplet for humidity). Null if a single icon suffices." },
                cover_bg_preset: { type: "string", enum: BGS },
              },
              required: [
                "title_es", "excerpt_es", "body_es",
                "title_en", "excerpt_en", "body_en",
                "snapshot_es", "snapshot_en",
                "seo_title_es", "seo_description_es",
                "seo_title_en", "seo_description_en",
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

    return json({ post: args });
  } catch (e) {
    console.error("blog-wizard-generate", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
