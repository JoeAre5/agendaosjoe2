/**
 * blog-rss — RSS 2.0 feed for /titulares. Returns up to 50 most-recent published posts.
 * Public, no auth, cached 1h.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://charliesbarbershop.co";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const lang = url.searchParams.get("lang") === "en" ? "en" : "es";

    const supabase = createClient(
      Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: posts } = await supabase
      .from("blog_posts")
      .select("slug, slug_en, title, title_en, excerpt, excerpt_en, author, published_at, category")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(50);

    const items = (posts || []).map((p) => {
      const title = lang === "en" ? (p.title_en || p.title) : p.title;
      const excerpt = lang === "en" ? (p.excerpt_en || p.excerpt || "") : (p.excerpt || "");
      const slug = lang === "en" ? (p.slug_en || p.slug) : p.slug;
      const link = lang === "en" ? `${BASE}/en/headlines/${slug}` : `${BASE}/titulares/${slug}`;
      const pubDate = p.published_at ? new Date(p.published_at).toUTCString() : new Date().toUTCString();
      return `
    <item>
      <title>${escapeXml(title || "")}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <description>${escapeXml(excerpt || "")}</description>
      <author>${escapeXml(p.author || "Charlie Corchado")}</author>
      ${p.category ? `<category>${escapeXml(p.category)}</category>` : ""}
      <pubDate>${pubDate}</pubDate>
    </item>`;
    }).join("");

    const channelTitle = lang === "en" ? "Charlie's Barbershop — Headlines" : "Charlie's Barbershop — Titulares";
    const channelDesc = lang === "en"
      ? "Culture, style, and everything happening at the shop."
      : "Cultura, estilo y todo lo que pasa en la barbería.";
    const channelLink = lang === "en" ? `${BASE}/en/headlines` : `${BASE}/titulares`;
    const lastBuild = new Date().toUTCString();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${channelTitle}</title>
    <link>${channelLink}</link>
    <description>${channelDesc}</description>
    <language>${lang === "en" ? "en-US" : "es-PR"}</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${BASE}/headlines/rss.xml${lang === "en" ? "?lang=en" : ""}" rel="self" type="application/rss+xml"/>${items}
  </channel>
</rss>`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (e) {
    console.error("blog-rss", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
