/**
 * blog-seo-generate — generate SEO title + description for a blog post.
 *
 * Input: { language: 'es' | 'en', title: string, excerpt: string, body: string }
 * Output: { seo_title: string, seo_description: string }
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

    const { language = "es", title = "", excerpt = "", body = "" } = await req.json();
    const plain = String(body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sys = language === "es"
      ? "Eres experto en SEO local para Charlie's Barbershop en Camuy, Puerto Rico. Genera SEO title (≤60 caracteres) y meta description (≤155 caracteres) optimizados para búsqueda local. Incluye palabras clave naturales como 'barbería Camuy', 'corte de cabello PR' cuando sea apropiado. Sin clickbait."
      : "You are a local SEO expert for Charlie's Barbershop in Camuy, Puerto Rico. Generate SEO title (≤60 chars) and meta description (≤155 chars) optimized for local search. Include natural keywords. No clickbait.";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Título: ${title}\nResumen: ${excerpt}\n\nContenido:\n${plain}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_seo",
            description: "Return SEO title and description.",
            parameters: {
              type: "object",
              properties: {
                seo_title: { type: "string", maxLength: 60 },
                seo_description: { type: "string", maxLength: 155 },
              },
              required: ["seo_title", "seo_description"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_seo" } },
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

    return json({
      seo_title: String(args.seo_title || "").slice(0, 60),
      seo_description: String(args.seo_description || "").slice(0, 155),
    });
  } catch (e) {
    console.error("blog-seo-generate", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
