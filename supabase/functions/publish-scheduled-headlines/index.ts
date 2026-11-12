/**
 * publish-scheduled-headlines
 *
 * Cron-triggered worker that publishes blog_posts whose status='scheduled'
 * and scheduled_for <= now(). For each one:
 *   1. Flip is_published=true, status='published', published_at=now()
 *   2. Fire send-headline-broadcast (only if not already sent)
 *
 * Runs every 5 minutes via pg_cron.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { isInternalCaller, unauthorizedResponse } from "../_shared/internalAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await isInternalCaller(req, admin))) return unauthorizedResponse(corsHeaders);

  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("blog_posts")
    .select("id, sent_to_subscribers_at")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso);

  if (error) {
    console.error("[publish-scheduled-headlines] query error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; published: boolean; broadcast?: number; error?: string }> = [];

  for (const post of due || []) {
    const { error: updErr } = await admin
      .from("blog_posts")
      .update({
        status: "published",
        is_published: true,
        published_at: nowIso,
      })
      .eq("id", post.id);

    if (updErr) {
      console.error("[publish-scheduled-headlines] update error", post.id, updErr);
      results.push({ id: post.id, published: false, error: updErr.message });
      continue;
    }

    let queued = 0;
    if (!post.sent_to_subscribers_at) {
      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-headline-broadcast`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "apikey": SERVICE_KEY,
          },
          body: JSON.stringify({ postId: post.id }),
        });
        if (resp.ok) {
          const body = await resp.json().catch(() => ({}));
          queued = body?.queued || 0;
        } else {
          const txt = await resp.text().catch(() => "");
          console.error("[publish-scheduled-headlines] broadcast failed", post.id, resp.status, txt);
        }
      } catch (err) {
        console.error("[publish-scheduled-headlines] broadcast threw", post.id, err);
      }
    }

    results.push({ id: post.id, published: true, broadcast: queued });
  }

  return new Response(
    JSON.stringify({ success: true, processed: results.length, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
