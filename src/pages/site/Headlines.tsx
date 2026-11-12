import { SEOHead } from "@/components/SEOHead";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, LayoutGrid, List } from "lucide-react";
import { Link as RLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { AnimatedSection } from "@/components/site/AnimatedSection";
import { SkeletonCard } from "@/components/site/SkeletonCard";
import { BlogHero } from "@/components/blog/BlogHero";
import { BlogCard, type BlogCardPost } from "@/components/blog/BlogCard";
import { CategoryPills, type BlogCategory } from "@/components/blog/CategoryPills";
import { pickLocalized, pickSlug } from "@/lib/blog/i18n";

const PAGE_SIZE = 12;

const SELECT_FIELDS =
  "id, slug, slug_en, title, title_en, excerpt, excerpt_en, category, cover_icon, cover_icon_secondary, cover_bg_preset, author, author_avatar_url, author_role, author_role_es, author_role_en, read_time_minutes, published_at";

export default function Headlines() {
  const { language } = useTranslation();
  const [posts, setPosts] = useState<BlogCardPost[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("blog_categories")
      .select("slug, label_es, label_en")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setCategories((data as BlogCategory[]) || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    setVisible(PAGE_SIZE);
    const q = supabase
      .from("blog_posts")
      .select(SELECT_FIELDS)
      .eq("is_published", true)
      .order("published_at", { ascending: false });
    if (category !== "all") q.eq("category", category);
    q.then(({ data }) => {
      setPosts((data as unknown as BlogCardPost[]) || []);
      setLoading(false);
    });
  }, [category]);

  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => (map[c.slug] = language === "es" ? c.label_es : c.label_en));
    return map;
  }, [categories, language]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return posts;
    return posts.filter((p) => {
      const t = `${p.title || ""} ${p.title_en || ""} ${p.excerpt || ""} ${p.excerpt_en || ""}`.toLowerCase();
      return t.includes(q);
    });
  }, [posts, q]);

  const featured = !q && category === "all" ? filtered[0] : null;
  const rest = featured ? filtered.slice(1) : filtered;
  const shown = view === "list" ? rest : rest.slice(0, visible);

  const fmtDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const locale = language === "es" ? "es-PR" : "en-US";
    return d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="max-w-6xl mx-auto px-5 py-16 pb-28 md:pb-16">
      <SEOHead
        title={language === "es" ? "Titulares — Charlie's Barbershop" : "Headlines — Charlie's Barbershop"}
        description={
          language === "es"
            ? "Cultura, estilo y todo lo que pasa en la barbería."
            : "Culture, style, and everything happening at the shop."
        }
        path="/titulares" />
      <AnimatedSection>
        <h1
          className="font-black uppercase leading-[0.95] mb-3"
          style={{ fontSize: "clamp(40px, 7vw, 64px)", letterSpacing: "-2px", color: "var(--text-primary)" }}>
          {language === "es" ? "Titulares" : "Headlines"}
        </h1>
        <p className="text-base md:text-lg mb-10 max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          {language === "es"
            ? "Cultura, estilo y todo lo que pasa dentro y fuera de la silla."
            : "Culture, style, and everything happening on and off the chair."}
        </p>
      </AnimatedSection>

      <CategoryPills categories={categories} active={category} onChange={setCategory} />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <AnimatedSection>
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              {language === "es" ? "No hay titulares aún. ¡Pronto!" : "No headlines yet. Coming soon!"}
            </p>
          </div>
        </AnimatedSection>
      ) : (
        <>
          {featured && <BlogHero post={featured} categoryLabel={categoryLabels[featured.category || ""]} />}

          {/* Divider + toolbar */}
          <div className="my-8 h-px w-full" style={{ background: "var(--divider)" }} />
          <div className="flex items-center justify-between gap-3 mb-6">
            {!searchOpen && (
                <div
                  key="title"
                  
                  
                  className="text-xs font-bold uppercase tracking-widest truncate"
                  style={{ color: "var(--text-tertiary)" }}>
                  {q
                    ? (language === "es" ? `${rest.length} resultado${rest.length === 1 ? "" : "s"}` : `${rest.length} result${rest.length === 1 ? "" : "s"}`)
                    : (language === "es" ? "Todos los titulares" : "All posts")}
                </div>
              )}
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div
                
                className="flex items-center overflow-hidden"
                style={{
                  height: 40,
                  borderRadius: 12,
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--divider)",
                }}
                >
                <button
                  onClick={() => {
                    if (!searchOpen) {
                      setSearchOpen(true);
                      setTimeout(() => searchRef.current?.focus(), 60);
                    } else if (!query) {
                      setSearchOpen(false);
                    }
                  }}
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 40, height: 40, color: "var(--text-secondary)" }}
                  aria-label={language === "es" ? "Buscar" : "Search"}>
                  <Search size={18} strokeWidth={1.75} />
                </button>
                {searchOpen && (
                    <div
                      key="search-input"
                      
                      
                      className="flex-1 flex items-center">
                      <input
                        ref={searchRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={language === "es" ? "Buscar titulares" : "Search blog"}
                        className="flex-1 bg-transparent outline-none text-sm pr-2"
                        style={{ color: "var(--text-primary)" }} />
                      <button
                        onClick={() => { setQuery(""); setSearchOpen(false); }}
                        className="flex items-center justify-center shrink-0"
                        style={{ width: 40, height: 40, color: "var(--text-secondary)" }}
                        aria-label={language === "es" ? "Cerrar" : "Close"}>
                        <X size={18} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
              </div>
              <button
                onClick={() => setView((v) => (v === "grid" ? "list" : "grid"))}
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "var(--bg-surface-2)",
                  border: "1px solid var(--divider)",
                  color: "var(--text-secondary)",
                }}
                aria-label={view === "grid" ? (language === "es" ? "Vista lista" : "List view") : (language === "es" ? "Vista cuadrícula" : "Grid view")}>
                {view === "grid" ? <List size={18} strokeWidth={1.75} /> : <LayoutGrid size={18} strokeWidth={1.75} />}
              </button>
            </div>
          </div>

          {rest.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                {language === "es" ? "No se encontraron titulares." : "No headlines found."}
              </p>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {shown.map((post) => (
                <BlogCard key={post.id} post={post} categoryLabel={categoryLabels[post.category || ""]} />
              ))}
            </div>
          ) : (
            <ul className="flex flex-col">
              {shown.map((post) => (
                <li key={post.id}>
                  <RLink
                    to={`/titulares/${pickSlug(post, language)}`}
                    className="block py-4 group"
                    style={{ borderBottom: "1px solid var(--divider)" }}>
                    <h3 className="text-lg font-bold leading-snug mb-1 group-hover:underline" style={{ color: "var(--text-primary)" }}>
                      {pickLocalized(post, "title", language)}
                    </h3>
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {fmtDate(post.published_at)}
                    </p>
                  </RLink>
                </li>
              ))}
            </ul>
          )}

          {view === "grid" && visible < rest.length && (
            <div className="flex justify-center mt-10">
              <button
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-widest transition-transform active:scale-95"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1.5px solid var(--divider)" }}>
                {language === "es" ? "Cargar más" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "Charlie's Barbershop — Titulares",
            url: "https://charliesbarbershop.co/titulares",
            blogPost: posts.slice(0, 20).map((p) => ({
              "@type": "BlogPosting",
              headline: pickLocalized(p, "title", language),
              datePublished: p.published_at,
              author: { "@type": "Person", name: p.author || "Charlie Corchado" },
              url: `https://charliesbarbershop.co/titulares/${pickSlug(p, language)}`,
            })),
          }),
        }} />
    </div>
  );
}
