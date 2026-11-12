/**
 * Send a published headline to all opt-in newsletter subscribers.
 *
 * Each subscriber gets the email in their preferred language
 * (clients.newsletter_language). Sends one transactional email per recipient
 * via the existing `send-transactional-email` function — which handles the
 * suppression list, unsubscribe tokens, and the durable email queue.
 *
 * Auth: requires the caller to be the shop owner (validated via JWT).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = "https://charliesbarbershop.co";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // ── Auth: shop owner OR service role (cron worker) ──────────────────
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const isServiceRole = bearer && bearer === SERVICE_KEY;
  let callerEmail: string | null = null;
  let callerFirstName: string | null = null;

  if (!isServiceRole) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    callerEmail = userData.user.email?.toLowerCase() ?? null;
    const meta = (userData.user.user_metadata || {}) as Record<string, unknown>;
    callerFirstName = String(meta.first_name || meta.full_name || meta.name || "Admin").split(" ")[0] || null;
    const { data: isOwnerData } = await userClient.rpc("is_owner");
    if (!isOwnerData) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // ── Parse body ───────────────────────────────────────────────────────
  let postId: string | null = null;
  let testOnly = false;
  try {
    const body = await req.json();
    postId = typeof body?.postId === "string" ? body.postId : null;
    testOnly = body?.testOnly === true;
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!postId) {
    return new Response(JSON.stringify({ error: "postId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Load post ────────────────────────────────────────────────────────
  const { data: post, error: postErr } = await admin
    .from("blog_posts")
    .select(
      "id, slug, slug_en, title, title_en, excerpt, excerpt_en, category, " +
        "author, author_role_es, author_role_en, reading_time_minutes, " +
        "snapshot_es, snapshot_en, body_blocks_es, body_blocks_en, " +
        "is_published, status",
    )
    .eq("id", postId)
    .maybeSingle();

  // Pull social links + slugify helper for snapshot deep-links
  const { data: pubRows } = await admin.rpc("get_publication_settings_public");
  const pub = Array.isArray(pubRows) ? pubRows[0] : pubRows;
  const socials = {
    whatsapp: pub?.social_whatsapp || null,
    facebook: pub?.social_facebook || null,
    instagram: pub?.social_instagram || null,
    youtube: pub?.social_youtube || null,
  };

  const slugifyHeading = (text: string): string =>
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80);

  const collectHeadingIds = (doc: any): string[] => {
    const ids: string[] = [];
    const readText = (n: any): string => {
      if (!n) return "";
      if (n.type === "text") return n.text || "";
      return (n.content || []).map(readText).join("");
    };
    const visit = (n: any) => {
      if (!n) return;
      if (n.type === "heading") {
        const t = readText(n);
        const id = t ? slugifyHeading(t) : "";
        if (id) ids.push(id);
      }
      (n.content || []).forEach(visit);
    };
    visit(doc);
    return ids;
  };

  if (postErr || !post) {
    return new Response(JSON.stringify({ error: "post_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!testOnly && !post.is_published && post.status !== "published") {
    return new Response(JSON.stringify({ error: "post_not_published" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve human-readable category labels (es/en)
  const { data: cat } = await admin
    .from("blog_categories")
    .select("label_es, label_en")
    .eq("slug", post.category)
    .maybeSingle();

  // ── Load recipients ─────────────────────────────────────────────────
  const { data: subs, error: subsErr } = testOnly
    ? { data: callerEmail ? [{ first_name: callerFirstName, email: callerEmail, newsletter_language: "es" }] : [], error: null }
    : await admin
        .from("clients")
        .select("first_name, email, newsletter_language")
        .eq("newsletter_opt_in", true)
        .not("email", "is", null);

  if (subsErr) {
    console.error("[headline-broadcast] subs load error", subsErr);
    return new Response(JSON.stringify({ error: subsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const recipients = (subs || []).filter((s) =>
    typeof s.email === "string" && /\S+@\S+\.\S+/.test(s.email)
  );

  // ── Fan out: one transactional email per recipient ──────────────────
  let queued = 0;
  let failed = 0;
  for (const r of recipients) {
    const lang: "es" | "en" = r.newsletter_language === "en" ? "en" : "es";
    const title = lang === "en" ? (post.title_en || post.title) : (post.title || post.title_en);
    const excerpt = lang === "en" ? (post.excerpt_en || post.excerpt) : (post.excerpt || post.excerpt_en);
    const slug = lang === "en" ? (post.slug_en || post.slug) : (post.slug || post.slug_en);
    const authorRole = lang === "en" ? post.author_role_en : post.author_role_es;
    const category = lang === "en" ? cat?.label_en : cat?.label_es;
    const rawSnap = lang === "en" ? post.snapshot_en : post.snapshot_es;
    const bulletTexts: string[] = Array.isArray(rawSnap)
      ? rawSnap
          .map((b: unknown) => {
            if (typeof b === "string") return b;
            if (b && typeof b === "object" && "text" in (b as Record<string, unknown>)) {
              return String((b as Record<string, unknown>).text || "");
            }
            return "";
          })
          .filter((s: string) => s.trim().length > 0)
          .slice(0, 5)
      : [];
    const headingIds = collectHeadingIds(
      lang === "en" ? post.body_blocks_en : post.body_blocks_es,
    );
    const snapshot = bulletTexts.map((t, i) => ({ text: t, anchor: headingIds[i] || null }));
    const postUrl = `${SITE_URL}/${lang === "en" ? "headlines" : "titulares"}/${slug}`;

    // Direct fetch (not admin.functions.invoke) so we can set BOTH the
    // Authorization bearer AND the apikey header — the SDK overrides
    // Authorization with the client key, causing UNAUTHORIZED_INVALID_JWT_FORMAT.
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
          "apikey": SERVICE_KEY,
        },
        body: JSON.stringify({
          templateName: "headline-broadcast",
          recipientEmail: r.email,
          idempotencyKey: `${testOnly ? "headline-test" : "headline"}-${post.id}-${r.email!.toLowerCase()}`,
          templateData: {
            recipientName: r.first_name || null,
            language: lang,
            title: testOnly ? `[TEST] ${title}` : title,
            excerpt: excerpt || null,
            category: category || null,
            authorName: post.author || "Charlie Corchado",
            authorRole: authorRole || null,
            readingTime: post.reading_time_minutes || null,
            postUrl,
            snapshot,
            socials,
          },
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        console.error("[headline-broadcast] send error", resp.status, txt.slice(0, 300));
        failed++;
      } else {
        queued++;
      }
    } catch (err) {
      console.error("[headline-broadcast] fetch threw", (err as Error)?.message);
      failed++;
    }
  }

  if (!testOnly) {
    await admin
      .from("blog_posts")
      .update({
        sent_to_subscribers_at: new Date().toISOString(),
        sent_to_subscribers_count: queued,
      })
      .eq("id", post.id);
  }

  return new Response(
    JSON.stringify({ success: true, queued, failed, total: recipients.length, testOnly }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
