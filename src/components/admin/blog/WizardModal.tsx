/**
 * WizardModal — one-click "AI generate full post" flow.
 *
 * Asks for a topic + category + authoring language, calls
 * blog-wizard-generate, inserts a draft into blog_posts (with body
 * markdown converted to Tiptap blocks for the editor), then navigates
 * to the editor on success.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, X, Loader2, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateWizardPost } from "@/lib/blog/aiClient";
import { htmlToTiptap } from "@/lib/blog/htmlToTiptap";

type Category = { slug: string; label_es: string; label_en: string };
type Lang = "es" | "en";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  es: boolean;
}

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
   .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80);

export function WizardModal({ open, onClose, categories, es }: Props) {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [language, setLanguage] = useState<Lang>("es");
  const [generating, setGenerating] = useState(false);

  if (!open) return null;

  async function generate() {
    if (!topic.trim()) {
      toast.error(es ? "Escribe un tema" : "Enter a topic");
      return;
    }
    setGenerating(true);
    const post = await generateWizardPost({ topic, category, language });
    if (!post) { setGenerating(false); return; }

    const blocksEs = htmlToTiptap(post.body_es);
    const blocksEn = htmlToTiptap(post.body_en);

    const { data, error } = await supabase
      .from("blog_posts")
      .insert({
        authoring_language: language,
        category,
        status: "draft",
        is_published: false,
        title: post.title_es,
        slug: slugify(post.title_es),
        excerpt: post.excerpt_es,
        body: post.body_es,
        body_blocks_es: blocksEs as any,
        seo_title_es: post.seo_title_es,
        seo_description_es: post.seo_description_es,
        title_en: post.title_en,
        slug_en: slugify(post.title_en),
        excerpt_en: post.excerpt_en,
        body_en: post.body_en,
        body_blocks_en: blocksEn as any,
        seo_title_en: post.seo_title_en,
        seo_description_en: post.seo_description_en,
        // Mark the non-authoring language as auto-translated
        title_es_is_auto: language === "en",
        title_en_is_auto: language === "es",
        excerpt_es_is_auto: language === "en",
        excerpt_en_is_auto: language === "es",
        body_es_is_auto: language === "en",
        body_en_is_auto: language === "es",
        cover_icon: post.cover_icon,
        cover_icon_secondary: (post as any).cover_icon_secondary ?? null,
        cover_bg_preset: post.cover_bg_preset,
        cover_icon_auto_suggested: true,
      })
      .select("id")
      .maybeSingle();

    setGenerating(false);

    if (error || !data) {
      console.error("[Wizard] insert error", error);
      toast.error(error?.message || (es ? "No se pudo crear el borrador" : "Could not create draft"));
      return;
    }
    toast.success(es ? "Borrador generado" : "Draft generated");
    onClose();
    navigate(`/admin/titulares/${data.id}`);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full mx-auto rounded-t-2xl sm:rounded-2xl p-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]"
        style={{ maxWidth: 430, background: "var(--bg-surface)", border: "1px solid var(--divider)" }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
            >
              <Wand2 size={18} className="icon-bold" />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                {es ? "Generar con IA" : "Generate with AI"}
              </h2>
              <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {es ? "Artículo bilingüe completo en segundos" : "Full bilingual article in seconds"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 -m-1" disabled={generating}>
            <X size={20} style={{ color: "var(--text-tertiary)" }} />
          </button>
        </div>

        {/* Topic */}
        <label className="block text-[11px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Tema" : "Topic"}
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={3}
          disabled={generating}
          placeholder={es
            ? "Ej: cómo cuidar la barba en clima tropical de PR"
            : "Ex: how to care for your beard in PR's tropical climate"}
          className="w-full px-3.5 py-3 rounded-xl text-sm outline-none resize-none mb-4"
          style={{
            background: "var(--bg-surface-2)", color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        />

        {/* Category */}
        {categories.length > 0 && (
          <>
            <label className="block text-[11px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--text-tertiary)" }}>
              {es ? "Categoría" : "Category"}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {categories.map((c) => {
                const active = category === c.slug;
                return (
                  <button
                    key={c.slug}
                    onClick={() => setCategory(active ? null : c.slug)}
                    disabled={generating}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{
                      background: active ? "var(--accent-color)" : "var(--bg-surface-2)",
                      color: active ? "var(--cta-fg)" : "var(--text-secondary)",
                      border: active ? "none" : "1px solid var(--divider)",
                    }}
                  >
                    {es ? c.label_es : c.label_en}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Authoring language — single 2-letter pill, click to flip */}
        <div className="flex items-center justify-between mb-5">
          <label className="block text-[11px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-tertiary)" }}>
            {es ? "Idioma principal" : "Authoring language"}
          </label>
          <button
            type="button"
            onClick={() => setLanguage(language === "es" ? "en" : "es")}
            disabled={generating}
            className="p-1.5 rounded-full text-xs font-bold disabled:opacity-50"
            style={{ color: "var(--text-secondary)" }}
            aria-label={es ? "Cambiar idioma" : "Switch language"}
          >
            {language === "es" ? "EN" : "ES"}
          </button>
        </div>

        <button
          onClick={generate}
          disabled={generating || !topic.trim()}
          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
        >
          {generating
            ? <><Loader2 size={16} className="animate-spin" /> {es ? "Generando..." : "Generating..."}</>
            : <><Bot size={16} className="icon-bold" /> {es ? "Generar artículo" : "Generate article"}</>}
        </button>
        <p className="text-[10px] mt-2 text-center" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Tarda 10-30 segundos. Podrás editar todo después." : "Takes 10-30 seconds. You can edit everything after."}
        </p>
      </div>
    </div>
  );
}
