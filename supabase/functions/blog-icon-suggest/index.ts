/**
 * blog-icon-suggest — given a free-text prompt (e.g. "water drop"), return
 * a single lucide-react icon name (kebab-case) that best represents it.
 *
 * Input: { prompt: string }
 * Output: { icon: string }
 *
 * Owner-only. Uses Lovable AI Gateway with tool calling for structured output.
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

    const { prompt = "" } = await req.json();
    if (!prompt.trim()) return json({ error: "prompt_required" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sys = `You map a short concept to ONE lucide-react icon name (kebab-case, e.g. "droplet", "music", "scissors", "store", "armchair", "landmark").
Return ONLY the kebab-case name of an icon that exists in lucide-react. Do not invent names. Prefer simple, common icons.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Concept: ${prompt}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_icon",
            description: "Return one lucide-react icon name (kebab-case).",
            parameters: {
              type: "object",
              properties: { icon: { type: "string", description: "kebab-case lucide icon name" } },
              required: ["icon"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_icon" } },
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
    const icon = String(args.icon || "").toLowerCase().trim()
      .replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!icon) return json({ error: "invalid_icon" }, 500);

    return json({ icon });
  } catch (e) {
    console.error("blog-icon-suggest", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
