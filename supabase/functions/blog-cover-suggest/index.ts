/**
 * blog-cover-suggest — given a post's title/excerpt/body, suggest 1-2 lucide
 * icons + a bg preset that visually represent the article. Owner-only.
 *
 * Input:  { title: string, excerpt?: string, body?: string, language?: 'es'|'en' }
 * Output: { icon: string, icon_secondary: string | null, bg_preset: string }
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

    const { title = "", excerpt = "", body = "", language = "es" } = await req.json();
    if (!title.trim()) return json({ error: "title_required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sys = `You pick lucide-react icons that visually represent a blog article for Charlie's Barbershop in Puerto Rico.

Rules:
- Pick a PRIMARY icon: the most central concept (subject of the article).
- Pick a SECONDARY icon ONLY if it adds meaningful context (e.g. an article about beard care in humid climate → primary "scissors", secondary "droplet"). Set secondary to null if a single icon already says it all.
- Both must be from the allowed list. Prefer concrete, simple icons.
- Pick a background preset that matches the mood (warm-gradient for tropical/beach, cool-gradient for water/rain/cold, dark-gradient for premium/luxury, primary-gradient default, accent-solid for bold/energy).`;

    const userMsg = `Title: ${title}\nExcerpt: ${excerpt}\nBody (truncated): ${String(body).slice(0, 1500)}\nLanguage: ${language}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_cover",
            description: "Return primary icon, optional secondary icon, and bg preset.",
            parameters: {
              type: "object",
              properties: {
                icon: { type: "string", enum: ICONS },
                icon_secondary: { type: ["string", "null"], enum: [...ICONS, null] },
                bg_preset: { type: "string", enum: BGS },
              },
              required: ["icon", "icon_secondary", "bg_preset"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_cover" } },
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
    return json({
      icon: args.icon,
      icon_secondary: args.icon_secondary || null,
      bg_preset: args.bg_preset,
    });
  } catch (e) {
    console.error("blog-cover-suggest", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
