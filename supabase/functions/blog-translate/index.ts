/**
 * blog-translate — translate a blog post between es-PR and en-US.
 *
 * Input: { from: 'es'|'en', to: 'es'|'en', fields: { title, excerpt, body, seo_title, seo_description, snapshot } }
 * Output: same shape, translated. Each field optional.
 *
 * Uses Lovable AI Gateway (google/gemini-3-flash-preview) with tool-calling.
 * Owner-only.
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
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);
    const { data: isOwner } = await supabase.rpc("is_owner");
    if (!isOwner) return json({ error: "Forbidden" }, 403);

    const { from = "es", to = "en", fields = {} } = await req.json();
    if (from === to) return json({ error: "from_to_same" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const fromLabel = from === "es" ? "español de Puerto Rico" : "inglés americano";
    const toLabel = to === "es" ? "español de Puerto Rico (es-PR)" : "American English (en-US)";

    const sys = `Eres traductor profesional de contenido editorial para una barbería. Traduces de ${fromLabel} a ${toLabel} manteniendo voz, longitud y TODA la estructura/formato.

REGLAS CRÍTICAS DE FORMATO (body es HTML):
- Devuelve EXACTAMENTE los mismos tags HTML en el mismo orden y anidamiento que el original.
- Conserva <h1>, <h2>, <h3>, <p>, <blockquote>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <a href="...">, <br>, <hr>, <img src="..." alt="...">.
- Si el original tiene <strong>palabra</strong>, la traducción debe envolver la palabra equivalente con <strong>...</strong>. Lo mismo para <em>, <blockquote>, encabezados, listas y citas.
- NO añadas, quites ni reordenes tags. NO envuelvas la respuesta en \`\`\`html ni en otra cosa.
- NO traduzcas nombres propios (Charlie, Pito, Joseph, Camuy, Charlie's Barbershop).
- Mantén URLs y atributos (href, src, alt) sin cambios salvo el texto visible.
- Para snapshot (array de strings): traduce cada bullet manteniendo la longitud y el tono.

Traduce cada campo por separado y devuélvelos en el mismo formato HTML que el original.`;

    const userContent = JSON.stringify({
      title: fields.title || null,
      excerpt: fields.excerpt || null,
      body: fields.body || null,
      seo_title: fields.seo_title || null,
      seo_description: fields.seo_description || null,
      snapshot: Array.isArray(fields.snapshot) ? fields.snapshot : null,
    });

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Traduce los siguientes campos. Campos null o vacíos déjalos null.\n\n${userContent}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_translation",
            description: "Return translated fields.",
            parameters: {
              type: "object",
              properties: {
                title: { type: ["string", "null"] },
                excerpt: { type: ["string", "null"] },
                body: { type: ["string", "null"] },
                seo_title: { type: ["string", "null"] },
                seo_description: { type: ["string", "null"] },
                snapshot: { type: ["array", "null"], items: { type: "string" } },
              },
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_translation" } },
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
    const args = call ? JSON.parse(call.function.arguments) : {};

    return json({ translated: args });
  } catch (e) {
    console.error("blog-translate", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
