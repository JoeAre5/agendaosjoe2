/**
 * Admin → Newsletter → Titulares → Editor
 *
 * Phase 3, commit 2: editor SHELL.
 *
 * - Routes: /admin/titulares/nuevo (create) and /admin/titulares/:id (edit)
 * - 3-step stepper: Compose → SEO → Review
 * - Language toggle (ES/EN) — author in one, the other auto-translates later
 * - Compose step: title, slug, category, excerpt, body (textarea for now)
 * - SEO step: meta title, meta description, cover icon + bg preset
 * - Review step: read-only summary + bilingual completeness check + save/publish
 *
 * Body is a plain textarea in this commit; commit 3 swaps it for the
 * Beehiiv-style block editor. AI buttons (Snapshot, SEO meta, auto-translate)
 * land in commit 4.
 *
 * The "suggested vs override" pattern lives in the auto-translate flags on
 * the row: editing a field clears its `*_is_auto` flag, marking it as a
 * manual override. SEO/cover suggestions follow the same shape (the DB
 * trigger fills cover_icon/bg from the category if blank).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import { toast } from "sonner";
import {
  Check, Loader2, Globe, FileText, Search as SearchIcon,
  Bot, Wand2, AlertCircle, Eye, Mail, Calendar as CalendarIcon, X,
} from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { CoverIcon } from "@/components/blog/CoverIcon";
import { BlockComposer } from "@/components/admin/blog/BlockComposer";
import { IconPicker } from "@/components/admin/blog/IconPicker";
import { tiptapToHtml } from "@/lib/blog/tiptapToHtml";
import { htmlToTiptap, emptyTiptapDoc } from "@/lib/blog/htmlToTiptap";
import { generateSnapshot, generateSeo, translatePost, suggestCover } from "@/lib/blog/aiClient";

type Lang = "es" | "en";
type Step = "compose" | "seo" | "review";

interface Category {
  slug: string;
  label_es: string;
  label_en: string;
  default_icon: string | null;
  default_bg_preset: string | null;
}

interface PostDraft {
  id?: string;
  authoring_language: Lang;
  status: "draft" | "scheduled" | "published" | "archived";
  category: string | null;

  // ES
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  seo_title_es: string;
  seo_description_es: string;

  // EN
  title_en: string;
  slug_en: string;
  excerpt_en: string;
  body_en: string;
  seo_title_en: string;
  seo_description_en: string;

  // Auto flags
  title_es_is_auto: boolean;
  title_en_is_auto: boolean;
  body_es_is_auto: boolean;
  body_en_is_auto: boolean;
  excerpt_es_is_auto: boolean;
  excerpt_en_is_auto: boolean;

  // Cover
  cover_icon: string | null;
  cover_icon_secondary: string | null;
  cover_bg_preset: string | null;
  cover_icon_auto_suggested: boolean;

  // Block editor docs (Tiptap JSON)
  body_blocks_es: any | null;
  body_blocks_en: any | null;

  // Snapshot bullets (editable via separate UI; tracked here so translate covers them)
  snapshot_es: string[];
  snapshot_en: string[];

  // Broadcast tracking
  sent_to_subscribers_at: string | null;

  // Scheduling (UTC ISO, populated when status='scheduled')
  scheduled_for: string | null;
}

const EMPTY_DRAFT: PostDraft = {
  authoring_language: "es",
  status: "draft",
  category: null,
  title: "", slug: "", excerpt: "", body: "", seo_title_es: "", seo_description_es: "",
  title_en: "", slug_en: "", excerpt_en: "", body_en: "", seo_title_en: "", seo_description_en: "",
  title_es_is_auto: false, title_en_is_auto: false,
  body_es_is_auto: false, body_en_is_auto: false,
  excerpt_es_is_auto: false, excerpt_en_is_auto: false,
  cover_icon: null, cover_icon_secondary: null, cover_bg_preset: null, cover_icon_auto_suggested: true,
  body_blocks_es: null, body_blocks_en: null,
  snapshot_es: [], snapshot_en: [],
  sent_to_subscribers_at: null,
  scheduled_for: null,
};

const BG_PRESETS = [
  { id: "primary-gradient", label: "Primary" },
  { id: "accent-solid", label: "Accent" },
  { id: "dark-gradient", label: "Dark" },
  { id: "warm-gradient", label: "Warm" },
  { id: "cool-gradient", label: "Cool" },
];

const ICON_OPTIONS = [
  "newspaper", "scissors", "sparkles", "star", "flame", "crown",
  "calendar", "clock", "trophy", "heart", "zap", "trending-up",
];

export default function TitularesEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { language } = usePreferences();
  const es = language === "es";
  const isNew = !id || id === "nuevo";

  const [step, setStep] = useState<Step>("compose");
  const [editLang, setEditLang] = useState<Lang>("es");
  const [draft, setDraft] = useState<PostDraft>(EMPTY_DRAFT);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [publishedModal, setPublishedModal] = useState(false);
  const [scheduleSheetOpen, setScheduleSheetOpen] = useState(false);

  async function sendToSubscribers() {
    if (!draft.id) {
      toast.error(es ? "Guarda el artículo primero" : "Save the article first");
      return;
    }
    if (draft.status !== "published") {
      toast.error(es ? "Publica el artículo primero" : "Publish the article first");
      return;
    }
    const ok = window.confirm(
      es
        ? "¿Enviar este titular por email a todos los suscriptores?"
        : "Send this headline to all subscribers via email?",
    );
    if (!ok) return;
    setSendingBroadcast(true);
    const { data, error } = await supabase.functions.invoke("send-headline-broadcast", {
      body: { postId: draft.id },
    });
    setSendingBroadcast(false);
    if (error) {
      toast.error(error.message || (es ? "No se pudo enviar" : "Send failed"));
      return;
    }
    const queued = (data as any)?.queued ?? 0;
    toast.success(
      es
        ? `Enviado a ${queued} suscriptor${queued === 1 ? "" : "es"}`
        : `Sent to ${queued} subscriber${queued === 1 ? "" : "s"}`,
    );
  }

  async function sendTestEmail() {
    if (!draft.id) {
      toast.error(es ? "Guarda el artículo primero" : "Save the article first");
      return;
    }
    setSendingTestEmail(true);
    const { data, error } = await supabase.functions.invoke("send-headline-broadcast", {
      body: { postId: draft.id, testOnly: true },
    });
    setSendingTestEmail(false);
    if (error) {
      toast.error(error.message || (es ? "No se pudo enviar la prueba" : "Test send failed"));
      return;
    }
    const queued = (data as any)?.queued ?? 0;
    toast.success(
      queued > 0
        ? (es ? "Prueba enviada a tu email admin" : "Test sent to your admin email")
        : (es ? "No encontramos email en tu cuenta admin" : "No email found on your admin account"),
    );
  }

  // Load categories + post (if editing)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cats }, postRes] = await Promise.all([
        supabase
          .from("blog_categories")
          .select("slug, label_es, label_en, default_icon, default_bg_preset")
          .eq("is_active", true)
          .order("sort_order"),
        isNew
          ? Promise.resolve({ data: null, error: null })
          : supabase.from("blog_posts").select("*").eq("id", id!).maybeSingle(),
      ]);
      if (cancelled) return;
      if (cats) setCategories(cats as Category[]);
      if (postRes.data) {
        const p = postRes.data as Record<string, unknown>;
        setDraft({
          id: p.id as string,
          authoring_language: (p.authoring_language as Lang) || "es",
          status: (p.status as PostDraft["status"]) || "draft",
          category: (p.category as string | null) || null,
          title: (p.title as string) || "",
          slug: (p.slug as string) || "",
          excerpt: (p.excerpt as string) || "",
          body: (p.body as string) || "",
          seo_title_es: (p.seo_title_es as string) || "",
          seo_description_es: (p.seo_description_es as string) || "",
          title_en: (p.title_en as string) || "",
          slug_en: (p.slug_en as string) || "",
          excerpt_en: (p.excerpt_en as string) || "",
          body_en: (p.body_en as string) || "",
          seo_title_en: (p.seo_title_en as string) || "",
          seo_description_en: (p.seo_description_en as string) || "",
          title_es_is_auto: !!p.title_es_is_auto,
          title_en_is_auto: !!p.title_en_is_auto,
          body_es_is_auto: !!p.body_es_is_auto,
          body_en_is_auto: !!p.body_en_is_auto,
          excerpt_es_is_auto: !!p.excerpt_es_is_auto,
          excerpt_en_is_auto: !!p.excerpt_en_is_auto,
          cover_icon: (p.cover_icon as string | null) || null,
          cover_icon_secondary: (p.cover_icon_secondary as string | null) || null,
          cover_bg_preset: (p.cover_bg_preset as string | null) || null,
          cover_icon_auto_suggested: p.cover_icon_auto_suggested !== false,
          body_blocks_es: (p.body_blocks_es as any) || (p.body ? htmlToTiptap(p.body as string) : null),
          body_blocks_en: (p.body_blocks_en as any) || (p.body_en ? htmlToTiptap(p.body_en as string) : null),
          snapshot_es: Array.isArray(p.snapshot_es) ? (p.snapshot_es as string[]) : [],
          snapshot_en: Array.isArray(p.snapshot_en) ? (p.snapshot_en as string[]) : [],
          sent_to_subscribers_at: (p.sent_to_subscribers_at as string | null) || null,
          scheduled_for: (p.scheduled_for as string | null) || null,
        });
        setEditLang(((p.authoring_language as Lang) || "es"));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, isNew]);

  // Auto-derive default cover from category preview (visual only — DB trigger does this on save too)
  const previewCover = useMemo(() => {
    const cat = categories.find((c) => c.slug === draft.category);
    return {
      icon: draft.cover_icon || cat?.default_icon || "newspaper",
      iconSecondary: draft.cover_icon_secondary || null,
      bg: draft.cover_bg_preset || cat?.default_bg_preset || "primary-gradient",
    };
  }, [draft.cover_icon, draft.cover_icon_secondary, draft.cover_bg_preset, draft.category, categories]);

  // Validation for publish (mirrors the DB trigger rule)
  const validation = useMemo(() => {
    const esBody = draft.body_blocks_es ? tiptapToHtml(draft.body_blocks_es).replace(/<[^>]+>/g, "").trim() : draft.body.trim();
    const enBody = draft.body_blocks_en ? tiptapToHtml(draft.body_blocks_en).replace(/<[^>]+>/g, "").trim() : draft.body_en.trim();
    const esComplete = !!(draft.title.trim() && esBody && draft.slug.trim());
    const enComplete = !!(draft.title_en.trim() && enBody && draft.slug_en.trim());
    const esPresent = !!(draft.title.trim() && esBody);
    const enPresent = !!(draft.title_en.trim() && enBody);
    const canPublish = (esComplete && enPresent) || (enComplete && esPresent);
    return { esComplete, enComplete, esPresent, enPresent, canPublish };
  }, [draft]);

  // Patch helper that clears the "is_auto" flag for the language being edited
  function patch<K extends keyof PostDraft>(key: K, value: PostDraft[K]) {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      // Mark manually-edited fields as no longer auto-translated
      if (key === "title") next.title_es_is_auto = false;
      if (key === "title_en") next.title_en_is_auto = false;
      if (key === "body") next.body_es_is_auto = false;
      if (key === "body_en") next.body_en_is_auto = false;
      if (key === "excerpt") next.excerpt_es_is_auto = false;
      if (key === "excerpt_en") next.excerpt_en_is_auto = false;
      if (key === "cover_icon" || key === "cover_bg_preset" || key === "cover_icon_secondary") {
        next.cover_icon_auto_suggested = false;
      }
      return next;
    });
  }

  const slugify = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
     .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");

  // Auto-fill slug from title for the same language if slug is empty or also auto
  useEffect(() => {
    if (editLang === "es" && draft.title && !draft.slug) {
      setDraft((d) => ({ ...d, slug: slugify(d.title) }));
    }
    if (editLang === "en" && draft.title_en && !draft.slug_en) {
      setDraft((d) => ({ ...d, slug_en: slugify(d.title_en) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.title, draft.title_en, editLang]);

  async function save(mode: "draft" | "publish" | "schedule", scheduledAtIso?: string) {
    const publish = mode === "publish";
    const schedule = mode === "schedule";
    if ((publish || schedule) && !validation.canPublish) {
      toast.error(es ? "Completa al menos un idioma para publicar" : "Complete at least one language to publish");
      return;
    }
    if (schedule && !scheduledAtIso) {
      toast.error(es ? "Elige fecha y hora" : "Pick a date and time");
      return;
    }
    setSaving(true);
    // Serialize Tiptap docs → HTML for the public reader cache.
    const htmlEs = draft.body_blocks_es ? tiptapToHtml(draft.body_blocks_es) : (draft.body || "");
    const htmlEn = draft.body_blocks_en ? tiptapToHtml(draft.body_blocks_en) : (draft.body_en || "");

    // Always sync author defaults from publication settings on save so the
    // post mirrors the centralized author profile (avatar, name, role).
    const { data: pub } = await supabase
      .from("blog_publication_settings")
      .select("author_first_name, author_last_name, author_avatar_url, author_role_es, author_role_en")
      .limit(1)
      .maybeSingle();
    const authorName = [pub?.author_first_name, pub?.author_last_name].filter(Boolean).join(" ") || "Charlie Corchado";

    // Auto-generate Snapshot bullets on publish when missing — guarantees the
    // signature end-of-post template (Snapshot → Prev/Next → CTA → Share)
    // always renders. Owner can still edit them later.
    let snapshotEs = draft.snapshot_es;
    let snapshotEn = draft.snapshot_en;
    if (publish || schedule) {
      const esBodyText = htmlEs.replace(/<[^>]+>/g, " ").trim();
      const enBodyText = htmlEn.replace(/<[^>]+>/g, " ").trim();
      if ((!snapshotEs || snapshotEs.length === 0) && draft.title && esBodyText) {
        const bullets = await generateSnapshot({ language: "es", title: draft.title, body: htmlEs });
        if (bullets && bullets.length) snapshotEs = bullets;
      }
      if ((!snapshotEn || snapshotEn.length === 0) && draft.title_en && enBodyText) {
        const bullets = await generateSnapshot({ language: "en", title: draft.title_en, body: htmlEn });
        if (bullets && bullets.length) snapshotEn = bullets;
      }
    }

    const nextStatus: "draft" | "scheduled" | "published" =
      publish ? "published"
      : schedule ? "scheduled"
      : draft.status === "published" ? "published"
      : draft.status === "scheduled" ? "scheduled"
      : "draft";

    const payload = {
      authoring_language: draft.authoring_language,
      category: draft.category,
      status: nextStatus,
      is_published: publish || (draft.status === "published" && !schedule),
      scheduled_for: schedule ? scheduledAtIso! : (publish ? null : draft.scheduled_for),
      title: draft.title || null,
      slug: draft.slug || null,
      excerpt: draft.excerpt || null,
      body: htmlEs || null,
      body_blocks_es: draft.body_blocks_es,
      seo_title_es: draft.seo_title_es || null,
      seo_description_es: draft.seo_description_es || null,
      title_en: draft.title_en || null,
      slug_en: draft.slug_en || null,
      excerpt_en: draft.excerpt_en || null,
      body_en: htmlEn || null,
      body_blocks_en: draft.body_blocks_en,
      seo_title_en: draft.seo_title_en || null,
      seo_description_en: draft.seo_description_en || null,
      title_es_is_auto: draft.title_es_is_auto,
      title_en_is_auto: draft.title_en_is_auto,
      body_es_is_auto: draft.body_es_is_auto,
      body_en_is_auto: draft.body_en_is_auto,
      excerpt_es_is_auto: draft.excerpt_es_is_auto,
      excerpt_en_is_auto: draft.excerpt_en_is_auto,
      cover_icon: draft.cover_icon,
      cover_icon_secondary: draft.cover_icon_secondary,
      cover_bg_preset: draft.cover_bg_preset,
      cover_icon_auto_suggested: draft.cover_icon_auto_suggested,
      // Author defaults pulled from publication settings (single source of truth).
      author: authorName,
      author_avatar_url: pub?.author_avatar_url || null,
      author_role: pub?.author_role_es || null,
      author_role_es: pub?.author_role_es || null,
      author_role_en: pub?.author_role_en || null,
      snapshot_es: snapshotEs,
      snapshot_en: snapshotEn,
      ...(publish ? { published_at: new Date().toISOString() } : {}),
    };

    const op = isNew
      ? supabase.from("blog_posts").insert(payload).select("id").maybeSingle()
      : supabase.from("blog_posts").update(payload).eq("id", id!).select("id").maybeSingle();

    const { data, error } = await op;
    setSaving(false);

    if (error) {
      console.error("[Titulares] save error", error);
      toast.error(error.message);
      return;
    }
    if (publish) {
      setPublishedModal(true);
      const newId = (data?.id as string | undefined) || draft.id || id || undefined;
      // Auto-broadcast to opted-in subscribers on first publish only.
      // Re-publishes never re-send; admin can use the explicit "Resend" button.
      if (newId && !draft.sent_to_subscribers_at) {
        supabase.functions
          .invoke("send-headline-broadcast", { body: { postId: newId } })
          .then(({ data: r, error: bErr }) => {
            if (bErr) {
              console.error("[Titulares] auto-broadcast failed", bErr);
              return;
            }
            const queued = (r as { queued?: number } | null)?.queued ?? 0;
            if (queued > 0) {
              toast.success(
                es
                  ? `Enviado a ${queued} suscriptor${queued === 1 ? "" : "es"}`
                  : `Sent to ${queued} subscriber${queued === 1 ? "" : "s"}`,
              );
            }
          });
      }
      if (isNew && data?.id) navigate(`/admin/titulares/${data.id}`, { replace: true });
    } else if (schedule) {
      const when = new Date(scheduledAtIso!);
      toast.success(
        es
          ? `Programado para ${when.toLocaleString("es-PR", { timeZone: "America/Puerto_Rico", dateStyle: "medium", timeStyle: "short" })}`
          : `Scheduled for ${when.toLocaleString("en-US", { timeZone: "America/Puerto_Rico", dateStyle: "medium", timeStyle: "short" })}`,
      );
      setDraft((d) => ({ ...d, status: "scheduled", scheduled_for: scheduledAtIso! }));
      if (isNew && data?.id) navigate(`/admin/titulares/${data.id}`, { replace: true });
    } else {
      toast.success(es ? "Guardado" : "Saved");
      if (isNew && data?.id) navigate(`/admin/titulares/${data.id}`, { replace: true });
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  const steps: { id: Step; label: string }[] = [
    { id: "compose", label: es ? "Escribir" : "Compose" },
    { id: "seo", label: "SEO" },
    { id: "review", label: es ? "Revisar" : "Review" },
  ];
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="min-h-screen mx-auto w-full pb-32" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      {/* Header */}
      <SubpageHeader
        title={isNew ? (es ? "Nuevo titular" : "New headline") : (draft.title || draft.title_en || (es ? "Sin título" : "Untitled"))}
        subtitle={es
          ? `Editando en ${editLang === "es" ? "Español" : "Inglés"} · ${draft.status}`
          : `Editing in ${editLang === "es" ? "Spanish" : "English"} · ${draft.status}`}
        onBack={() => navigate("/admin/titulares")}
        actions={
          <button
            onClick={() => setEditLang(editLang === "es" ? "en" : "es")}
            className="p-1.5 rounded-full text-xs font-bold"
            style={{ color: "var(--text-secondary)" }}
            aria-label={es ? "Cambiar idioma" : "Switch language"}
          >
            {editLang === "es" ? "EN" : "ES"}
          </button>
        }
      />
      <div className="px-4 pb-3">

        {/* Stepper */}
        <div className="flex items-center gap-1.5">
          {steps.map((s, i) => {
            const isActive = s.id === step;
            const isDone = i < stepIndex;
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: isActive ? "var(--accent-color)" : "var(--bg-surface-2)",
                  color: isActive ? "var(--cta-fg)" : isDone ? "var(--text-secondary)" : "var(--text-tertiary)",
                  border: isActive ? "none" : "1px solid var(--divider)",
                }}
              >
                {isDone && <Check size={12} className="icon-bold" />}
                <span>{i + 1}. {s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI action bar */}
      <AiActionBar
        es={es}
        draft={draft}
        editLang={editLang}
        onTranslated={(translated, toLang) => {
          setDraft((d) => {
            const html = translated.body || "";
            const blocks = html ? htmlToTiptap(html) : null;
            const snap = Array.isArray(translated.snapshot) ? translated.snapshot.filter(Boolean) : null;
            if (toLang === "es") {
              return {
                ...d,
                title: translated.title ?? d.title,
                excerpt: translated.excerpt ?? d.excerpt,
                body: html || d.body,
                body_blocks_es: blocks || d.body_blocks_es,
                seo_title_es: translated.seo_title ?? d.seo_title_es,
                seo_description_es: translated.seo_description ?? d.seo_description_es,
                snapshot_es: snap && snap.length ? snap : d.snapshot_es,
                title_es_is_auto: translated.title != null,
                excerpt_es_is_auto: translated.excerpt != null,
                body_es_is_auto: html ? true : d.body_es_is_auto,
              };
            }
            return {
              ...d,
              title_en: translated.title ?? d.title_en,
              excerpt_en: translated.excerpt ?? d.excerpt_en,
              body_en: html || d.body_en,
              body_blocks_en: blocks || d.body_blocks_en,
              seo_title_en: translated.seo_title ?? d.seo_title_en,
              seo_description_en: translated.seo_description ?? d.seo_description_en,
              snapshot_en: snap && snap.length ? snap : d.snapshot_en,
              title_en_is_auto: translated.title != null,
              excerpt_en_is_auto: translated.excerpt != null,
              body_en_is_auto: html ? true : d.body_en_is_auto,
            };
          });
        }}
        onSeo={(seo) => {
          setDraft((d) => editLang === "es"
            ? { ...d, seo_title_es: seo.seo_title, seo_description_es: seo.seo_description }
            : { ...d, seo_title_en: seo.seo_title, seo_description_en: seo.seo_description });
        }}
      />

      <div className="px-4">
        {step === "compose" && (
          <ComposeStep
            draft={draft}
            editLang={editLang}
            categories={categories}
            es={es}
            patch={patch}
            setBlocks={(lang, doc) =>
              setDraft((d) => ({
                ...d,
                ...(lang === "es"
                  ? { body_blocks_es: doc, body_es_is_auto: false }
                  : { body_blocks_en: doc, body_en_is_auto: false }),
              }))
            }
          />
        )}
        {step === "seo" && (
          <SeoStep
            draft={draft}
            editLang={editLang}
            es={es}
            previewCover={previewCover}
            patch={patch}
          />
        )}
        {step === "review" && (
          <ReviewStep draft={draft} validation={validation} es={es} categories={categories} />
        )}
      </div>

      {/* Sticky bottom bar — solid background like the public site's StickyBookingBar */}
      <div
        className="fixed bottom-0 left-0 right-0 mx-auto px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"
        style={{
          maxWidth: 430,
          background: "var(--nav-bg)",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
        }}
      >
        {/* Secondary actions — float ABOVE the primary CTA, separate container */}
        {step === "review" && (() => {
          const previewSlug = es ? (draft.slug || draft.slug_en) : (draft.slug_en || draft.slug);
          const previewDisabled = !previewSlug;
          const previewHref = previewSlug ? `/titulares/${previewSlug}?preview=1` : undefined;
          const showResend = draft.status === "published";
          const secondaryBtn =
            "flex-1 min-w-0 h-9 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50";
          const secondaryStyle = {
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--divider)",
          } as const;
          return (
            <div className="flex items-center gap-1.5 mb-2">
              <a
                href={previewHref}
                target={previewDisabled ? undefined : "_blank"}
                rel={previewDisabled ? undefined : "noopener noreferrer"}
                aria-disabled={previewDisabled}
                onClick={(e) => { if (previewDisabled) e.preventDefault(); }}
                className={`${secondaryBtn} ${previewDisabled ? "opacity-50 pointer-events-none" : ""}`}
                style={secondaryStyle}
              >
                <Eye size={13} />
                <span className="truncate">{es ? "Vista previa" : "Preview"}</span>
              </a>
              <button
                onClick={() => save("draft")}
                disabled={saving}
                className={secondaryBtn}
                style={secondaryStyle}
              >
                {saving
                  ? <Loader2 size={13} className="animate-spin" />
                  : <span className="truncate">{es ? "Guardar borrador" : "Save draft"}</span>}
              </button>
              <button
                onClick={sendTestEmail}
                disabled={sendingTestEmail || !draft.id}
                className={secondaryBtn}
                style={secondaryStyle}
              >
                {sendingTestEmail
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Mail size={13} />}
                <span className="truncate">{es ? "Prueba" : "Test"}</span>
              </button>
              {showResend && (
                <button
                  onClick={sendToSubscribers}
                  disabled={sendingBroadcast}
                  className={secondaryBtn}
                  style={secondaryStyle}
                >
                  {sendingBroadcast
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Mail size={13} />}
                  <span className="truncate">
                    {draft.sent_to_subscribers_at
                      ? (es ? "Reenviar" : "Resend")
                      : (es ? "Enviar" : "Send")}
                  </span>
                </button>
              )}
            </div>
          );
        })()}

        {/* Scheduled banner */}
        {step === "review" && draft.status === "scheduled" && draft.scheduled_for && (
          <div
            className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg text-[12px] font-semibold"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)", border: "1px solid var(--divider)" }}
          >
            <CalendarIcon size={14} />
            <span className="flex-1 truncate">
              {es ? "Programado para " : "Scheduled for "}
              {new Date(draft.scheduled_for).toLocaleString(es ? "es-PR" : "en-US", {
                timeZone: "America/Puerto_Rico", dateStyle: "medium", timeStyle: "short",
              })}
            </span>
          </div>
        )}

        {/* Primary CTA — alone in its own container */}
        {step === "review" ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScheduleSheetOpen(true)}
              disabled={saving || !validation.canPublish}
              className="h-12 px-4 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
              aria-label={es ? "Programar" : "Schedule"}
            >
              <CalendarIcon size={16} />
              <span>{es ? "Programar" : "Schedule"}</span>
            </button>
            <button
              onClick={() => save("publish")}
              disabled={saving || !validation.canPublish}
              className="flex-1 h-12 rounded-xl text-sm font-bold disabled:opacity-40 transition-transform active:scale-[0.99]"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              {saving
                ? <Loader2 size={16} className="animate-spin mx-auto" />
                : (draft.status === "scheduled" ? (es ? "Publicar ahora" : "Publish now") : (es ? "Publicar" : "Publish"))}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => save("draft")}
              disabled={saving}
              className="flex-1 h-12 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
            >
              {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : (es ? "Guardar borrador" : "Save draft")}
            </button>
            <button
              onClick={async () => {
                const next = steps[Math.min(stepIndex + 1, steps.length - 1)].id;
                if (step === "compose" && next === "seo" && draft.cover_icon_auto_suggested) {
                  const titleSrc = editLang === "es" ? draft.title : draft.title_en;
                  const excerptSrc = editLang === "es" ? draft.excerpt : draft.excerpt_en;
                  const blocks = editLang === "es" ? draft.body_blocks_es : draft.body_blocks_en;
                  const bodyText = blocks ? tiptapToHtml(blocks).replace(/<[^>]+>/g, " ").trim() : "";
                  if (titleSrc.trim().length > 5) {
                    const sug = await suggestCover({
                      language: editLang,
                      title: titleSrc,
                      excerpt: excerptSrc,
                      body: bodyText,
                    });
                    if (sug) {
                      setDraft((d) => ({
                        ...d,
                        cover_icon: sug.icon,
                        cover_icon_secondary: sug.icon_secondary,
                        cover_bg_preset: sug.bg_preset,
                        cover_icon_auto_suggested: true,
                      }));
                      toast.success(es ? "Sugerimos íconos según el contenido" : "We suggested icons based on your content");
                    }
                  }
                }
                setStep(next);
              }}
              className="flex-1 h-12 rounded-xl text-sm font-semibold"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
            >
              {es ? "Continuar" : "Continue"}
            </button>
          </div>
        )}
      </div>

      {/* Published confirmation modal */}
      {publishedModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => navigate("/admin/titulares")}
        >
          <div
            className="w-full sm:max-w-sm mx-auto rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)", maxWidth: 430 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                <Check size={24} style={{ color: "#22c55e" }} />
              </div>
            </div>
            <h3 className="text-lg font-bold text-center mb-1" style={{ color: "var(--text-primary)" }}>
              {es ? "¡Publicado!" : "Published!"}
            </h3>
            <p className="text-sm text-center mb-5" style={{ color: "var(--text-secondary)" }}>
              {es ? "Tu titular ya está en vivo." : "Your headline is now live."}
            </p>
            <button
              onClick={() => navigate("/admin/titulares")}
              className="w-full py-3 rounded-xl text-sm font-semibold"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
            >
              {es ? "Ir a Titulares" : "Go to Headlines"}
            </button>
          </div>
        </div>
      )}

      {/* Schedule sheet — pick AST date+time, save sets status='scheduled' */}
      {scheduleSheetOpen && (
        <ScheduleSheet
          es={es}
          initial={draft.scheduled_for}
          saving={saving}
          onClose={() => setScheduleSheetOpen(false)}
          onConfirm={async (iso) => {
            await save("schedule", iso);
            setScheduleSheetOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Schedule Sheet ───────────────────────── */

function ScheduleSheet({
  es, initial, saving, onClose, onConfirm,
}: {
  es: boolean;
  initial: string | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (iso: string) => void | Promise<void>;
}) {
  // Build a default value 1 hour from now in the local input format YYYY-MM-DDTHH:mm.
  // The <input type="datetime-local"> represents wall-clock time without TZ;
  // we treat it as Puerto Rico time (UTC-4, no DST) and convert to a UTC ISO.
  const defaultLocal = (() => {
    if (initial) {
      const d = new Date(initial);
      // shift to AST (-04:00) for display
      const astMs = d.getTime() - 4 * 60 * 60 * 1000;
      return new Date(astMs).toISOString().slice(0, 16);
    }
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const astMs = d.getTime() - 4 * 60 * 60 * 1000;
    return new Date(astMs).toISOString().slice(0, 16);
  })();
  const [value, setValue] = useState(defaultLocal);

  function localToUtcIso(local: string): string | null {
    if (!local) return null;
    // Append PR offset so JS parses as the intended AST wall time.
    const d = new Date(`${local}:00-04:00`);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  const utcIso = localToUtcIso(value);
  const inFuture = utcIso ? new Date(utcIso).getTime() > Date.now() + 30_000 : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm mx-auto rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)]"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)", maxWidth: 430 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {es ? "Programar publicación" : "Schedule publish"}
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-tertiary)" }}>
            <X size={18} />
          </button>
        </div>

        <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
          {es
            ? "Hora de Puerto Rico (AST). El titular se publicará y se enviará a los suscriptores automáticamente."
            : "Puerto Rico time (AST). The headline will publish and broadcast to subscribers automatically."}
        </p>

        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-3.5 py-3 rounded-xl text-sm outline-none mb-2"
          style={{
            background: "var(--bg-surface-2)", color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        />

        {!inFuture && value && (
          <p className="text-xs mb-2" style={{ color: "#ef4444" }}>
            {es ? "Elige una hora futura." : "Pick a future time."}
          </p>
        )}

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-11 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--divider)" }}
          >
            {es ? "Cancelar" : "Cancel"}
          </button>
          <button
            onClick={() => utcIso && inFuture && onConfirm(utcIso)}
            disabled={saving || !inFuture || !utcIso}
            className="flex-1 h-11 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
          >
            {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : (es ? "Programar" : "Schedule")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Compose Step ───────────────────────── */

function ComposeStep({
  draft, editLang, categories, es, patch, setBlocks,
}: {
  draft: PostDraft; editLang: Lang; categories: Category[]; es: boolean;
  patch: <K extends keyof PostDraft>(k: K, v: PostDraft[K]) => void;
  setBlocks: (lang: Lang, doc: any) => void;
}) {
  const titleField = editLang === "es" ? "title" : "title_en";
  const slugField = editLang === "es" ? "slug" : "slug_en";
  const excerptField = editLang === "es" ? "excerpt" : "excerpt_en";
  const isAutoTitle = editLang === "es" ? draft.title_es_is_auto : draft.title_en_is_auto;
  const isAutoBody = editLang === "es" ? draft.body_es_is_auto : draft.body_en_is_auto;
  const isAutoExcerpt = editLang === "es" ? draft.excerpt_es_is_auto : draft.excerpt_en_is_auto;
  const blocksValue = editLang === "es" ? draft.body_blocks_es : draft.body_blocks_en;

  return (
    <div className="space-y-4 pt-4">
      <Field label={es ? "Categoría" : "Category"}>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const active = draft.category === c.slug;
            return (
              <button
                key={c.slug}
                onClick={() => patch("category", c.slug)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
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
      </Field>

      <Field label={es ? "Título" : "Title"} autoBadge={isAutoTitle} es={es}>
        <input
          value={draft[titleField] as string}
          onChange={(e) => patch(titleField, e.target.value as never)}
          placeholder={es ? "Un titular memorable..." : "A memorable headline..."}
          className="w-full px-3.5 py-3 rounded-xl text-base font-semibold outline-none"
          style={{
            background: "var(--bg-surface-2)", color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        />
      </Field>

      <Field label="Slug" hint={es ? "URL del artículo" : "Article URL"}>
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>/titulares/</span>
          <input
            value={draft[slugField] as string}
            onChange={(e) => patch(slugField, e.target.value as never)}
            placeholder={es ? "titulo-en-url" : "title-in-url"}
            className="flex-1 bg-transparent text-sm outline-none font-mono"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
      </Field>

      <Field label={es ? "Resumen" : "Excerpt"} autoBadge={isAutoExcerpt} es={es} hint={es ? "Aparece en la lista pública" : "Shows on the public list"}>
        <textarea
          value={draft[excerptField] as string}
          onChange={(e) => patch(excerptField, e.target.value as never)}
          rows={3}
          placeholder={es ? "1-2 oraciones que enganchen..." : "1-2 hooking sentences..."}
          className="w-full px-3.5 py-3 rounded-xl text-sm outline-none resize-none"
          style={{
            background: "var(--bg-surface-2)", color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        />
      </Field>

      <Field label={es ? "Contenido" : "Body"} autoBadge={isAutoBody} es={es}>
        <BlockComposer
          value={blocksValue || emptyTiptapDoc()}
          onChange={(doc) => setBlocks(editLang, doc)}
          language={editLang}
          placeholder={es
            ? "Cuenta tu historia. Usa la barra superior o '/' para añadir bloques."
            : "Tell your story. Use the toolbar or '/' to add blocks."}
        />
      </Field>
    </div>
  );
}

/* ───────────────────────── SEO Step ───────────────────────── */

function SeoStep({
  draft, editLang, es, previewCover, patch,
}: {
  draft: PostDraft; editLang: Lang; es: boolean;
  previewCover: { icon: string; iconSecondary: string | null; bg: string };
  patch: <K extends keyof PostDraft>(k: K, v: PostDraft[K]) => void;
}) {
  const metaTitleField = editLang === "es" ? "seo_title_es" : "seo_title_en";
  const metaDescField = editLang === "es" ? "seo_description_es" : "seo_description_en";
  const metaTitle = (draft[metaTitleField] as string) ||
    (editLang === "es" ? draft.title : draft.title_en);
  const metaDesc = (draft[metaDescField] as string) ||
    (editLang === "es" ? draft.excerpt : draft.excerpt_en);

  return (
    <div className="space-y-4 pt-4">
      {/* Cover */}
      <Field label={es ? "Portada" : "Cover"} hint={draft.cover_icon_auto_suggested ? (es ? "Sugerida por IA" : "AI-suggested") : (es ? "Personalizada" : "Customized")}>
        <div className="rounded-xl overflow-hidden mb-3" style={{ aspectRatio: "16/9" }}>
          <CoverIcon icon={previewCover.icon} iconSecondary={previewCover.iconSecondary} bgPreset={previewCover.bg} size="lg" />
        </div>

        <IconPicker
          value={draft.cover_icon}
          valueSecondary={draft.cover_icon_secondary}
          fallback={previewCover.icon}
          es={es}
          onChange={(icon) => patch("cover_icon", icon)}
          onChangeSecondary={(icon) => patch("cover_icon_secondary", icon)}
        />

        <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Fondo" : "Background"}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BG_PRESETS.map((p) => {
            const active = (draft.cover_bg_preset || previewCover.bg) === p.id;
            return (
              <button
                key={p.id}
                onClick={() => patch("cover_bg_preset", p.id)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: active ? "var(--accent-color)" : "var(--bg-surface-2)",
                  color: active ? "var(--cta-fg)" : "var(--text-secondary)",
                  border: active ? "none" : "1px solid var(--divider)",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={es ? "Título SEO" : "SEO title"} hint={`${(metaTitle || "").length}/60`}>
        <input
          value={(draft[metaTitleField] as string)}
          onChange={(e) => patch(metaTitleField, e.target.value as never)}
          placeholder={editLang === "es" ? draft.title || "Hereda del título" : draft.title_en || "Inherits from title"}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
        />
      </Field>

      <Field label={es ? "Descripción SEO" : "SEO description"} hint={`${(metaDesc || "").length}/160`}>
        <textarea
          value={(draft[metaDescField] as string)}
          onChange={(e) => patch(metaDescField, e.target.value as never)}
          rows={3}
          placeholder={editLang === "es" ? draft.excerpt || "Hereda del resumen" : draft.excerpt_en || "Inherits from excerpt"}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none resize-none"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
        />
      </Field>

      {/* Google preview */}
      <div className="rounded-xl p-3.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}>
        <p className="text-[10px] uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
          <SearchIcon size={11} className="icon-bold" /> {es ? "Vista previa Google" : "Google preview"}
        </p>
        <p className="text-xs mb-1" style={{ color: "#9aa0a6" }}>charliesbarbershop.co › titulares</p>
        <p className="text-base font-medium leading-tight mb-1" style={{ color: "#8ab4f8" }}>
          {metaTitle || (es ? "Tu título aparecerá aquí" : "Your title will appear here")}
        </p>
        <p className="text-xs leading-snug" style={{ color: "var(--text-secondary)" }}>
          {metaDesc || (es ? "Tu descripción aparecerá aquí." : "Your description will appear here.")}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────── Review Step ───────────────────────── */

function ReviewStep({
  draft, validation, es, categories,
}: {
  draft: PostDraft;
  validation: { esComplete: boolean; enComplete: boolean; esPresent: boolean; enPresent: boolean; canPublish: boolean };
  es: boolean;
  categories: Category[];
}) {
  const cat = categories.find((c) => c.slug === draft.category);
  const Row = ({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) => (
    <div className="flex items-start gap-2.5 py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
      <div className="mt-0.5">
        {ok
          ? <Check size={16} className="icon-bold" style={{ color: "#22c55e" }} />
          : <AlertCircle size={16} className="icon-bold" style={{ color: "#fbbf24" }} />}
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</p>
        {detail && <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{detail}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pt-4">
      <div
        className="rounded-xl p-4"
        style={{
          background: validation.canPublish ? "rgba(34,197,94,0.08)" : "rgba(251,191,36,0.08)",
          border: `1px solid ${validation.canPublish ? "rgba(34,197,94,0.3)" : "rgba(251,191,36,0.3)"}`,
        }}
      >
        <p className="text-sm font-bold mb-1" style={{ color: validation.canPublish ? "#22c55e" : "#fbbf24" }}>
          {validation.canPublish
            ? es ? "Listo para publicar" : "Ready to publish"
            : es ? "Aún no se puede publicar" : "Not ready yet"}
        </p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {validation.canPublish
            ? es
              ? "Un idioma está completo y el otro tiene al menos título y cuerpo (o se autocompletará)."
              : "One language is complete and the other has at least title + body (or will auto-translate)."
            : es
              ? "Necesitas un idioma completo (título + cuerpo + slug) y el otro con al menos título + cuerpo."
              : "You need one language complete (title + body + slug) and the other with at least title + body."}
        </p>
      </div>

      <Field label={es ? "Resumen del artículo" : "Article summary"}>
        <div className="rounded-xl p-3.5" style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}>
          <Row
            label={es ? "Categoría" : "Category"}
            ok={!!draft.category}
            detail={cat ? (es ? cat.label_es : cat.label_en) : (es ? "Sin categoría" : "No category")}
          />
          <Row
            label={es ? "Español" : "Spanish"}
            ok={validation.esComplete || validation.esPresent}
            detail={
              validation.esComplete
                ? es ? "Completo (título + cuerpo + slug)" : "Complete (title + body + slug)"
                : validation.esPresent
                  ? es ? "Parcial (falta slug)" : "Partial (missing slug)"
                  : es ? "Vacío" : "Empty"
            }
          />
          <Row
            label={es ? "Inglés" : "English"}
            ok={validation.enComplete || validation.enPresent}
            detail={
              validation.enComplete
                ? es ? "Completo" : "Complete"
                : validation.enPresent
                  ? es ? "Parcial (falta slug)" : "Partial (missing slug)"
                  : es ? "Vacío — se autotraducirá si publicas" : "Empty — will auto-translate on publish"
            }
          />
          <Row
            label={es ? "Portada" : "Cover"}
            ok={!!draft.cover_icon || !!draft.category}
            detail={draft.cover_icon_auto_suggested ? (es ? "Sugerida desde categoría" : "Suggested from category") : (es ? "Personalizada" : "Customized")}
          />
        </div>
      </Field>

      {/* Public preview moved to bottom action bar */}
    </div>
  );
}

/* ───────────────────────── Helpers ───────────────────────── */

function Field({
  label, children, hint, autoBadge, es,
}: {
  label: string; children: React.ReactNode; hint?: string;
  autoBadge?: boolean; es?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          {autoBadge && (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
              style={{ background: "rgba(168,85,247,0.15)", color: "#a855f7" }}>
              <Bot size={9} className="icon-bold" />
              {es ? "Auto" : "Auto"}
            </span>
          )}
          {hint && <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{hint}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ───────────────────────── AI Action Bar ───────────────────────── */

function AiActionBar({
  es, draft, editLang, onTranslated, onSeo,
}: {
  es: boolean;
  draft: PostDraft;
  editLang: Lang;
  onTranslated: (t: { title?: string|null; excerpt?: string|null; body?: string|null; seo_title?: string|null; seo_description?: string|null; snapshot?: string[]|null }, toLang: Lang) => void;
  onSeo: (seo: { seo_title: string; seo_description: string }) => void;
}) {
  const [busy, setBusy] = useState<"translate" | "seo" | null>(null);
  const otherLang: Lang = editLang === "es" ? "en" : "es";

  async function handleTranslate() {
    setBusy("translate");
    const fromHtml = editLang === "es"
      ? (draft.body_blocks_es ? tiptapToHtml(draft.body_blocks_es) : draft.body)
      : (draft.body_blocks_en ? tiptapToHtml(draft.body_blocks_en) : draft.body_en);
    const fromSnap = (editLang === "es" ? draft.snapshot_es : draft.snapshot_en) || [];
    const result = await translatePost({
      from: editLang,
      to: otherLang,
      fields: {
        title: editLang === "es" ? draft.title : draft.title_en,
        excerpt: editLang === "es" ? draft.excerpt : draft.excerpt_en,
        body: fromHtml,
        seo_title: editLang === "es" ? draft.seo_title_es : draft.seo_title_en,
        seo_description: editLang === "es" ? draft.seo_description_es : draft.seo_description_en,
        snapshot: fromSnap.length ? fromSnap : null,
      },
    });
    if (result) {
      onTranslated(result, otherLang);
      toast.success(es ? `Traducido a ${otherLang.toUpperCase()}` : `Translated to ${otherLang.toUpperCase()}`);
    }
    setBusy(null);
  }

  async function handleSeo() {
    setBusy("seo");
    const bodyHtml = editLang === "es"
      ? (draft.body_blocks_es ? tiptapToHtml(draft.body_blocks_es) : draft.body)
      : (draft.body_blocks_en ? tiptapToHtml(draft.body_blocks_en) : draft.body_en);
    const result = await generateSeo({
      language: editLang,
      title: editLang === "es" ? draft.title : draft.title_en,
      excerpt: editLang === "es" ? draft.excerpt : draft.excerpt_en,
      body: bodyHtml,
    });
    if (result) {
      onSeo(result);
      toast.success(es ? "SEO generado" : "SEO generated");
    }
    setBusy(null);
  }

  const hasSourceContent = editLang === "es"
    ? !!(draft.title.trim() && (draft.body_blocks_es || draft.body.trim()))
    : !!(draft.title_en.trim() && (draft.body_blocks_en || draft.body_en.trim()));

  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-2">
        <button
          onClick={handleTranslate}
          disabled={!hasSourceContent || busy !== null}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
          style={{
            background: "var(--bg-surface-2)",
            color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        >
          {busy === "translate"
            ? <Loader2 size={12} className="animate-spin" />
            : <Globe size={12} className="icon-bold" style={{ color: "var(--accent-color)" }} />}
          {es
            ? `Traducir a ${otherLang.toUpperCase()}`
            : `Translate to ${otherLang.toUpperCase()}`}
        </button>
        <button
          onClick={handleSeo}
          disabled={!hasSourceContent || busy !== null}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
          style={{
            background: "var(--bg-surface-2)",
            color: "var(--text-primary)",
            border: "1px solid var(--divider)",
          }}
        >
          {busy === "seo"
            ? <Loader2 size={12} className="animate-spin" />
            : <Wand2 size={12} className="icon-bold" style={{ color: "var(--accent-color)" }} />}
          {es ? "Generar SEO" : "Generate SEO"}
        </button>
      </div>
    </div>
  );
}
