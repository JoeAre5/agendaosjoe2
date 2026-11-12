/**
 * Admin → Newsletter → Titulares (Headlines) — Posts list
 *
 * Phase 3, commit 1: list shell only.
 * Subsequent commits will add: editor route, AI buttons, publish flow.
 *
 * Layout matches Beehiiv's posts list (page title + subtitle + actions on top,
 * then a card list below) but uses our branding (AdminHeader, dark cards,
 * tokenized colors, Lucide icons at stroke 1.5).
 */
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import { Plus, Search, FileText, Globe, Clock, CheckCircle2, Users, Trash2 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { toast } from "sonner";
import { AiStudioModal } from "@/components/admin/blog/AiStudioModal";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";

type Post = {
  id: string;
  title: string | null;
  title_en: string | null;
  slug: string | null;
  status: "draft" | "scheduled" | "published" | "archived";
  is_published: boolean;
  category: string | null;
  authoring_language: "es" | "en";
  updated_at: string;
  published_at: string | null;
};

type FilterTab = "all" | "draft" | "scheduled" | "published";

export default function Titulares() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";

  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [categories, setCategories] = useState<{ slug: string; label_es: string; label_en: string }[]>([]);

  useEffect(() => {
    supabase
      .from("blog_categories")
      .select("slug, label_es, label_en")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => { if (data) setCategories(data as any); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("blog_posts")
        .select("id, title, title_en, slug, status, is_published, category, authoring_language, updated_at, published_at")
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (!error && data) setPosts(data as Post[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = posts;
    if (filter !== "all") list = list.filter((p) => p.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.title || "").toLowerCase().includes(q) ||
          (p.title_en || "").toLowerCase().includes(q) ||
          (p.slug || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [posts, filter, search]);

  const counts = useMemo(() => ({
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
  }), [posts]);

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: es ? "Todos" : "All" },
    { id: "draft", label: es ? "Borradores" : "Drafts" },
    { id: "scheduled", label: es ? "Programados" : "Scheduled" },
    { id: "published", label: es ? "Publicados" : "Published" },
  ];

  const startWriting = () => {
    // Phase 3 commit 2 will create this route + editor page.
    navigate("/admin/titulares/nuevo");
  };

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Titulares" : "Headlines"}
        subtitle={es ? "Crea, edita y publica artículos del boletín." : "Create, edit, and publish newsletter articles."}
        onBack={() => navigate("/admin/titulares")}
        actions={
          <>
            <button
              onClick={() => navigate("/admin/titulares/suscriptores")}
              aria-label={es ? "Suscriptores" : "Subscribers"}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform"
              style={{
                background: "var(--bg-surface-2)",
                border: "1px solid var(--divider)",
                color: "var(--text-primary)",
              }}
            >
              <Users size={16} className="icon-bold" />
            </button>
            <button
              onClick={() => setWizardOpen(true)}
              aria-label={es ? "Generar con Filho" : "Generate with Filho"}
              className="filo-cta w-9 h-9 rounded-full flex items-center justify-center shrink-0 active:scale-95 transition-transform p-0"
            >
              <AnimatedOrbNavIcon size={18} />
            </button>
            <button
              onClick={startWriting}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
            >
              <Plus size={14} className="icon-bold" />
              {es ? "Escribir" : "Write"}
            </button>
          </>
        }
      />

      <div className="px-4 pb-6">
        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4"
          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}
        >
          <Search size={16} style={{ color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={es ? "Buscar artículo..." : "Search article..."}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto -mx-4 px-4 pb-1 no-scrollbar">
          {tabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors"
                style={{
                  background: active ? "var(--accent-color)" : "var(--bg-surface-2)",
                  color: active ? "var(--cta-fg)" : "var(--text-secondary)",
                  border: active ? "none" : "1px solid var(--divider)",
                }}
              >
                {tab.label}
                <span
                  className="text-[10px] font-bold px-1.5 rounded-full"
                  style={{
                    background: active ? "rgba(255,255,255,0.2)" : "var(--bg-base)",
                    color: active ? "var(--cta-fg)" : "var(--text-tertiary)",
                  }}
                >
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-xl animate-pulse"
                style={{ background: "var(--bg-surface-2)" }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState es={es} onCreate={startWriting} hasFilter={filter !== "all" || search.length > 0} />
        ) : (
          <div className="space-y-2">
            {filtered.map((post) => (
              <PostRow
                key={post.id}
                post={post}
                es={es}
                onClick={() => navigate(`/admin/titulares/${post.id}`)}
                onDelete={async () => {
                  const label = (es ? post.title : post.title_en) || post.title || "(sin título)";
                  if (!window.confirm(es ? `¿Eliminar "${label}"? Esta acción no se puede deshacer.` : `Delete "${label}"? This cannot be undone.`)) return;
                  const { error } = await supabase.from("blog_posts").delete().eq("id", post.id);
                  if (error) { toast.error(error.message); return; }
                  setPosts((prev) => prev.filter((p) => p.id !== post.id));
                  toast.success(es ? "Artículo eliminado" : "Article deleted");
                }}
              />
            ))}
          </div>
        )}
      </div>

      <AiStudioModal
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        categories={categories}
        es={es}
      />
    </div>
  );
}

function PostRow({ post, es, onClick, onDelete }: { post: Post; es: boolean; onClick: () => void; onDelete: () => void }) {
  const displayTitle = (es ? post.title : post.title_en) || post.title || post.title_en || (es ? "(Sin título)" : "(Untitled)");

  const StatusBadge = () => {
    const map: Record<Post["status"], { label: string; bg: string; fg: string; icon: typeof Clock }> = {
      draft: { label: es ? "Borrador" : "Draft", bg: "rgba(148,163,184,0.15)", fg: "#94a3b8", icon: FileText },
      scheduled: { label: es ? "Programado" : "Scheduled", bg: "rgba(251,191,36,0.15)", fg: "#fbbf24", icon: Clock },
      published: { label: es ? "Publicado" : "Published", bg: "rgba(34,197,94,0.15)", fg: "#22c55e", icon: CheckCircle2 },
      archived: { label: es ? "Archivado" : "Archived", bg: "rgba(148,163,184,0.1)", fg: "#64748b", icon: FileText },
    };
    const cfg = map[post.status];
    const Icon = cfg.icon;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: cfg.bg, color: cfg.fg }}>
        <Icon size={10} className="icon-bold" />
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="relative w-full rounded-xl card-elevated">
      <button onClick={onClick} className="w-full text-left p-3.5 active:scale-[0.99] transition-transform">
        <div className="flex items-start justify-between gap-3 mb-1.5 pr-8">
          <h3 className="text-sm font-semibold leading-tight line-clamp-2" style={{ color: "var(--text-primary)" }}>
            {displayTitle}
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge />
          {post.category && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: "var(--text-tertiary)", background: "var(--bg-surface-2)" }}>
              {post.category}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            <Globe size={10} className="icon-bold" />
            {post.authoring_language?.toUpperCase() || "ES"}
          </span>
          <span className="text-[10px] ml-auto" style={{ color: "var(--text-tertiary)" }}>
            {formatDate(post.updated_at, es)}
          </span>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-lg active:scale-90 transition-transform"
        style={{ color: "#ef4444" }}
        aria-label={es ? "Eliminar" : "Delete"}
      >
        <Trash2 size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function EmptyState({ es, onCreate, hasFilter }: { es: boolean; onCreate: () => void; hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
        style={{ background: "var(--bg-surface-2)" }}
      >
        <FileText size={22} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {hasFilter
          ? es ? "No hay resultados" : "No results"
          : es ? "Sin titulares aún" : "No headlines yet"}
      </p>
      <p className="text-xs mb-5 max-w-[260px]" style={{ color: "var(--text-tertiary)" }}>
        {hasFilter
          ? es ? "Intenta cambiar el filtro o la búsqueda." : "Try changing the filter or search."
          : es
            ? "Crea tu primer artículo. La IA te sugiere la portada, resumen y SEO."
            : "Create your first article. The AI suggests cover, snapshot, and SEO."}
      </p>
      {!hasFilter && (
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
          style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
        >
          <Plus size={16} className="icon-bold" />
          {es ? "Escribir el primero" : "Write the first one"}
        </button>
      )}
    </div>
  );
}

function formatDate(iso: string, es: boolean): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffMin < 1) return es ? "ahora" : "now";
  if (diffMin < 60) return es ? `hace ${diffMin}m` : `${diffMin}m ago`;
  if (diffH < 24) return es ? `hace ${diffH}h` : `${diffH}h ago`;
  if (diffD < 7) return es ? `hace ${diffD}d` : `${diffD}d ago`;
  return d.toLocaleDateString(es ? "es-PR" : "en-US", { month: "short", day: "numeric" });
}
