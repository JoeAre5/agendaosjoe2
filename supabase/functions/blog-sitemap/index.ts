/**
 * blog-sitemap — dynamic sitemap.xml including all published headline posts.
 * Public, no auth. Cached at the edge for 1h.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://charliesbarbershop.co";

const STATIC_URLS: { loc: string; changefreq: string; priority: string }[] = [
  { loc: "/", changefreq: "weekly", priority: "1.0" },
  { loc: "/citas", changefreq: "weekly", priority: "0.9" },
  { loc: "/titulares", changefreq: "daily", priority: "0.8" },
  { loc: "/unete", changefreq: "monthly", priority: "0.6" },
  { loc: "/contacto", changefreq: "monthly", priority: "0.7" },
  { loc: "/servicios/cortes", changefreq: "monthly", priority: "0.8" },
  { loc: "/servicios/barba", changefreq: "monthly", priority: "0.8" },
  { loc: "/servicios/experiencias", changefreq: "monthly", priority: "0.8" },
  { loc: "/lista-exclusiva", changefreq: "weekly", priority: "0.7" },
  { loc: "/privacidad", changefreq: "yearly", priority: "0.3" },
  { loc: "/terminos", changefreq: "yearly", priority: "0.3" },
];

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: posts } = await supabase
      .from("blog_posts")
      .select("slug, slug_en, updated_at, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(1000);

    const today = new Date().toISOString().slice(0, 10);

    const staticEntries = STATIC_URLS.map((u) => `
  <url>
    <loc>${BASE}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("");

    const postEntries = (posts || []).map((p) => {
      const lastmod = (p.updated_at || p.published_at || today).slice(0, 10);
      const slug = p.slug;
      const slugEn = p.slug_en;
      const altEs = `${BASE}/titulares/${escapeXml(slug)}`;
      const altEn = slugEn ? `${BASE}/en/headlines/${escapeXml(slugEn)}` : null;
      return `
  <url>
    <loc>${altEs}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
    <xhtml:link rel="alternate" hreflang="es-PR" href="${altEs}"/>${altEn ? `
    <xhtml:link rel="alternate" hreflang="en-US" href="${altEn}"/>` : ""}
  </url>`;
    }).join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${staticEntries}${postEntries}
</urlset>`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (e) {
    console.error("blog-sitemap", e);
    return new Response("error", { status: 500, headers: corsHeaders });
  }
});
