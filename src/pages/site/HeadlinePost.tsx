import { SEOHead } from "@/components/SEOHead";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AuthorChip } from "@/components/blog/AuthorChip";
import { ShareRow } from "@/components/blog/ShareRow";
import { PrevNextPosts } from "@/components/blog/PrevNextPosts";
import { BlogCtaStrip } from "@/components/blog/BlogCtaStrip";
import { CoverIcon } from "@/components/blog/CoverIcon";
import { ReadingProgress } from "@/components/blog/ReadingProgress";

import { PostSnapshot } from "@/components/blog/PostSnapshot";
import { PostBlocks, slugifyHeading, type TiptapNode } from "@/components/blog/PostBlocks";
import { tweenScrollToTop } from "@/lib/blog/scrollUtils";
import { pickLocalized, pickSlug } from "@/lib/blog/i18n";
import { usePublicationSettings } from "@/hooks/usePublicationSettings";
import { trackBlogEvent } from "@/lib/blog/analytics";
import DOMPurify from "dompurify";

interface Post {
  id: string;
  slug: string;
  slug_en: string | null;
  title: string;
  title_en: string | null;
  excerpt: string | null;
  excerpt_en: string | null;
  body: string;
  body_en: string | null;
  subtitle: string | null;
  subtitle_es: string | null;
  subtitle_en: string | null;
  category: string | null;
  cover_icon: string | null;
  cover_icon_secondary?: string | null;
  cover_bg_preset: string | null;
  og_image_url: string | null;
  seo_title: string | null;
  seo_title_es: string | null;
  seo_title_en: string | null;
  seo_description: string | null;
  seo_description_es: string | null;
  seo_description_en: string | null;
  author: string | null;
  author_avatar_url: string | null;
  author_role: string | null;
  author_role_es: string | null;
  author_role_en: string | null;
  read_time_minutes: number | null;
  published_at: string | null;
  tags: string[] | null;
  snapshot_es: unknown;
  snapshot_en: unknown;
  body_blocks_es: TiptapNode | null;
  body_blocks_en: TiptapNode | null;
}

interface NavPost {
  slug: string;
  slug_en: string | null;
  title: string;
  title_en: string | null;
  cover_icon: string | null;
  cover_bg_preset: string | null;
  category: string | null;
}

const POST_FIELDS =
  "id, slug, slug_en, title, title_en, excerpt, excerpt_en, body, body_en, subtitle, subtitle_es, subtitle_en, category, cover_icon, cover_icon_secondary, cover_bg_preset, og_image_url, seo_title, seo_title_es, seo_title_en, seo_description, seo_description_es, seo_description_en, author, author_avatar_url, author_role, author_role_es, author_role_en, read_time_minutes, published_at, tags, snapshot_es, snapshot_en, body_blocks_es, body_blocks_en";

const NAV_FIELDS = "slug, slug_en, title, title_en, cover_icon, cover_icon_secondary, cover_bg_preset, category";

function toBullets(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((b) => String(b)).filter((s) => s.trim().length > 0);
  return [];
}

/**
 * Extract FAQ Q&A pairs from a markdown body that ends with a
 * "## Preguntas Frecuentes" or "## Frequently Asked Questions" section.
 * Pattern emitted by blog-studio-generate: **Question?**\n\nAnswer text.
 * Returns [] when no FAQ section is detected.
 */
function extractFaqFromBody(body: string | null | undefined): { q: string; a: string }[] {
  if (!body) return [];
  const re = /##\s+(?:Preguntas Frecuentes|Frequently Asked Questions)\s*\n+([\s\S]*?)$/i;
  const m = body.match(re);
  if (!m) return [];
  const section = m[1];
  const pairs: { q: string; a: string }[] = [];
  // Split on blank-line followed by **...** at start of next block.
  const blocks = section.split(/\n{2,}(?=\*\*)/);
  for (const block of blocks) {
    const qm = block.match(/^\*\*(.+?)\*\*\s*\n+([\s\S]+)$/);
    if (qm) pairs.push({ q: qm[1].trim(), a: qm[2].trim() });
  }
  return pairs;
}

export default function HeadlinePost() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  // Allow draft preview when `?preview=1` is present (linked from admin editor).
  const allowDrafts = new URLSearchParams(location.search).get("preview") === "1";
  const { language } = useTranslation();
  const { data: pub } = usePublicationSettings();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [prev, setPrev] = useState<NavPost | null>(null);
  const [next, setNext] = useState<NavPost | null>(null);

  useLayoutEffect(() => {
    if (!slug) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    setPost(null);
    setPrev(null);
    setNext(null);
    setLoading(true);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    // Try ES slug first, then EN slug as fallback
    (async () => {
      let q = supabase.from("blog_posts").select(POST_FIELDS).eq("slug", slug);
      if (!allowDrafts) q = q.eq("is_published", true);
      let { data } = await q.maybeSingle();
      if (!data) {
        let q2 = supabase.from("blog_posts").select(POST_FIELDS).eq("slug_en", slug);
        if (!allowDrafts) q2 = q2.eq("is_published", true);
        const { data: byEn } = await q2.maybeSingle();
        data = byEn;
      }
      const p = data as Post | null;
      if (cancelled) return;
      setPost(p);
      setLoading(false);
      if (p?.id) {
        // Fire-and-forget view counter (RPC, idempotent enough for v1)
        supabase.rpc("increment_blog_view", { _post_id: p.id }).then(() => {});
        // Detailed analytics event (with source, session, lang)
        trackBlogEvent("view", { postId: p.id, language });
      }
      if (p?.published_at) {
        const [{ data: prevData }, { data: nextData }] = await Promise.all([
          supabase
            .from("blog_posts")
            .select(NAV_FIELDS)
            .eq("is_published", true)
            .lt("published_at", p.published_at)
            .order("published_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("blog_posts")
            .select(NAV_FIELDS)
            .eq("is_published", true)
            .gt("published_at", p.published_at)
            .order("published_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        setPrev((prevData as NavPost) || null);
        setNext((nextData as NavPost) || null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, allowDrafts]);

  // Walk the active-language Tiptap doc, collecting heading IDs in order so
  // each snapshot bullet can deep-link to its matching section.
  // MUST be declared before any early return to keep hook count stable.
  const headingIds = useMemo(() => {
    const doc = (language === "en" ? post?.body_blocks_en : post?.body_blocks_es) as TiptapNode | null;
    if (!doc) return [];
    const ids: string[] = [];
    const visit = (n: TiptapNode | undefined) => {
      if (!n) return;
      if (n.type === "heading") {
        const text = (function readText(node: TiptapNode): string {
          if (node.type === "text") return node.text || "";
          return (node.content || []).map(readText).join("");
        })(n);
        const id = text ? slugifyHeading(text) : "";
        if (id) ids.push(id);
      }
      (n.content || []).forEach(visit);
    };
    visit(doc);
    return ids;
  }, [post?.body_blocks_es, post?.body_blocks_en, language]);

  // Scroll-depth + read-complete + exit tracking
  useEffect(() => {
    if (!post?.id) return;
    const startTs = performance.now();
    const fired = new Set<string>();
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
      const pct = Math.min(100, Math.round((window.scrollY / scrollable) * 100));
      const milestones: Array<[number, "scroll_25" | "scroll_50" | "scroll_75" | "read_complete"]> = [
        [25, "scroll_25"], [50, "scroll_50"], [75, "scroll_75"], [95, "read_complete"],
      ];
      for (const [threshold, ev] of milestones) {
        if (pct >= threshold && !fired.has(ev)) {
          fired.add(ev);
          trackBlogEvent(ev, { postId: post.id, language, scrollDepth: pct });
        }
      }
    };
    const onExit = () => {
      trackBlogEvent("exit", {
        postId: post.id,
        language,
        timeOnPageMs: Math.round(performance.now() - startTs),
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onExit);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onExit);
      onExit();
    };
  }, [post?.id, language]);

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-20 text-center">
        <h2 className="text-xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
          {language === "es" ? "Artículo no encontrado" : "Article not found"}
        </h2>
        <Link to="/titulares" className="text-sm font-semibold" style={{ color: "var(--accent-color)" }}>
          ← {language === "es" ? "Volver a Titulares" : "Back to Headlines"}
        </Link>
      </div>
    );
  }

  const title = pickLocalized(post, "title", language);
  const excerpt = pickLocalized(post, "excerpt", language);
  const body = pickLocalized(post, "body", language);
  const subtitle = pickLocalized(post, "subtitle", language) || post.subtitle || "";
  const authorRole = pickLocalized(post, "author_role", language) || post.author_role || "";
  const seoTitle =
    pickLocalized(post, "seo_title", language) || post.seo_title || `${title} — Charlie's Barbershop`;
  const seoDesc =
    pickLocalized(post, "seo_description", language) || post.seo_description || excerpt || title;
  const ogImage = post.og_image_url || undefined;
  const canonSlug = pickSlug(post, language);
  const url = `https://charliesbarbershop.co/titulares/${canonSlug}`;
  const minutes = post.read_time_minutes;
  const snapshotBullets = toBullets(language === "en" ? post.snapshot_en : post.snapshot_es);

  return (
    <article className="max-w-3xl mx-auto px-5 py-16 pb-28 md:pb-16">
      <ReadingProgress />
      <SEOHead title={seoTitle} description={seoDesc} path={`/titulares/${canonSlug}`} image={ogImage} type="article" keywords={post.tags || undefined} />

      <Link
        to="/titulares"
        className="inline-flex items-center gap-1 text-sm font-semibold mb-10"
        style={{ color: "var(--accent-color)" }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} /> {language === "es" ? "Titulares" : "Headlines"}
      </Link>

      {(subtitle || post.category) && (
        <span
          className="text-[11px] font-bold uppercase tracking-[0.2em] block mb-4"
          style={{ color: "var(--accent-color)" }}
        >
          {subtitle || post.category?.replace(/-/g, " ")}
        </span>
      )}

      <h1
        className="font-black leading-[1.05] mb-6"
        style={{
          color: "var(--text-primary)",
          fontSize: "clamp(32px, 5.5vw, 56px)",
          letterSpacing: "-1.5px",
        }}
      >
        {title}
      </h1>

      {excerpt && (
        <p className="text-lg md:text-xl mb-8 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {excerpt}
        </p>
      )}

      {/* Author chip row — falls back to publication settings so the latest
          avatar/role/name applies to every post automatically. */}
      <div className="mb-10">
        <AuthorChip
          author={post.author || [pub?.author_first_name, pub?.author_last_name].filter(Boolean).join(" ") || "Charlie Corchado"}
          authorAvatarUrl={post.author_avatar_url || pub?.author_avatar_url || null}
          authorRole={authorRole || (language === "en" ? pub?.author_role_en : pub?.author_role_es) || null}
          publishedAt={post.published_at}
          readingTime={minutes}
          size="md"
        />
      </div>

      {/* Icon-on-color cover */}
      <div
        className="w-full rounded-2xl mb-12 aspect-video overflow-hidden"
        aria-label={title}
      >
        <CoverIcon icon={post.cover_icon} iconSecondary={post.cover_icon_secondary} bgPreset={post.cover_bg_preset} size="lg" />
      </div>

      {/* Body — native block renderer when Tiptap doc exists, else HTML cache */}
      {(() => {
        const blocks = language === "en" ? post.body_blocks_en : post.body_blocks_es;
        if (blocks && typeof blocks === "object") {
          return <PostBlocks doc={blocks} />;
        }
        return (
          <div
            className="blog-prose"
            style={{ color: "var(--text-primary)" }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(body) }}
          />
        );
      })()}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-10">
          {post.tags.map((t) => (
            <span
              key={t}
              className="px-3 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)", border: "1px solid var(--divider)" }}
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* SIGNATURE END-OF-POST TEMPLATE — DO NOT REORDER.
          Order: Share (native ✈) → Snapshot → Prev/Next → "Book your next cut" CTA.
          PostTOC is intentionally rendered ABOVE the body, never at the end. */}
      <ShareRow url={url} title={title} postId={post.id} />
      <PostSnapshot bullets={snapshotBullets} headingIds={headingIds} postId={post.id} />
      <PrevNextPosts prev={prev as never} next={next as never} postId={post.id} />
      <BlogCtaStrip />

      {/* JSON-LD BlogPosting */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            headline: title,
            description: seoDesc,
            image: ogImage,
            datePublished: post.published_at,
            inLanguage: language === "en" ? "en-US" : "es-PR",
            author: { "@type": "Person", name: post.author || "Charlie Corchado" },
            publisher: {
              "@type": "Organization",
              name: "Charlie's Barbershop",
              logo: { "@type": "ImageObject", url: "https://charliesbarbershop.co/logo.png" },
            },
            mainEntityOfPage: url,
          }),
        }}
      />

      {/* JSON-LD FAQPage — emitted only when the body has a FAQ section
          (auto-generated by AI Studio). Boosts AI Overviews + LLM citations. */}
      {(() => {
        const faq = extractFaqFromBody(body);
        if (faq.length === 0) return null;
        return (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faq.map((f) => ({
                  "@type": "Question",
                  name: f.q,
                  acceptedAnswer: { "@type": "Answer", text: f.a },
                })),
              }),
            }}
          />
        );
      })()}
    </article>
  );
}
