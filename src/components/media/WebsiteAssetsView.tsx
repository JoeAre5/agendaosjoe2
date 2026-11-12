/**
 * Website Assets — section-by-section CMS for the public site.
 *
 * Hierarchy mirrors the public Home page:
 *   1. Header / Brand
 *   2. Sidebar / Panel
 *   3. Hero
 *   4. Reviews          (view-only)
 *   5. Services         (view-only)
 *   6. The Team         (barber avatars)
 *   7. Barber Galleries (barber ig_photos)
 *   8. Headlines        (view-only · edit on /admin/blog)
 *   9. Home Gallery     (3×3)
 *  10. Instagram / The Latest (view-only)
 *  11. Contact / FAQ    (view-only)
 *
 * Edits write to `draft_*` columns. Nothing changes on the public site
 * until the owner clicks **Publicar** on the root /admin/website screen
 * (handled by Website.tsx via the publish_website_draft RPC).
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronRight, Image as ImageIcon, Layout, Users, PanelLeft, Star,
  Upload, Trash2, Loader2, Plus, X, ChevronLeft, ChevronRight as Chev,
  Camera, MessageSquare, Scissors, Newspaper, Instagram, MapPin, Eye,
  Type, Smartphone, Megaphone, AlignLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrandLogos, notifyBrandLogosUpdated } from "@/contexts/BrandLogosContext";
import { SiteContentProvider, useSiteContent } from "@/contexts/SiteContentContext";
import { optimizeToWebP } from "@/lib/imageOptimize";
import { loadWebsiteDraftAssets } from "@/lib/websiteDraftAssets";
import { toast } from "sonner";
import { TextSectionEditor, SECTION_SCHEMAS } from "./website/TextSectionEditor";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { StandardToggle } from "@/components/ui/StandardToggle";
import type { SiteContent } from "@/lib/siteContent";
import heroFallback from "@/assets/hero-shop.jpg";
import ig1 from "@/assets/ig-1.jpg";
import ig3 from "@/assets/ig-3.jpg";
import ig4 from "@/assets/ig-4.jpg";
const ig2 = "/assets/ig-2.webp";

/** Cross-component signal: tell previews to refetch when an editor saves an image draft. */
const ASSET_CHANGED_EVENT = "website-asset-changed";
function notifyAssetChanged() {
  window.dispatchEvent(new CustomEvent(ASSET_CHANGED_EVENT));
}
function useAssetChangeTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onChange = () => setTick((t) => t + 1);
    window.addEventListener(ASSET_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ASSET_CHANGED_EVENT, onChange);
  }, []);
  return tick;
}

type SectionKey =
  | "header"
  | "sidebar-logo"
  | "hero"
  | "reviews"
  | "services"
  | "barber-profiles"
  | "barber-galleries"
  | "install"
  | "blog"
  | "home-grid"
  | "faq"
  | "instagram"
  | "cta"
  | "contact"
  | "footer";

type Section = {
  key: SectionKey;
  title_es: string;
  title_en: string;
  icon: any;
  viewOnly?: boolean;
  /** Site content JSONB key, if this section has editable text. */
  contentKey?: keyof SiteContent;
  hint_es?: string;
  hint_en?: string;
};

const SECTIONS: Section[] = [
  { key: "header",           title_es: "Header",                 title_en: "Header",            icon: Layout,        contentKey: "header" },
  { key: "sidebar-logo",     title_es: "Panel lateral",          title_en: "Side panel",        icon: PanelLeft },
  { key: "hero",             title_es: "Hero",                   title_en: "Hero",              icon: Star,          contentKey: "hero" },
  { key: "reviews",          title_es: "Reseñas",                title_en: "Reviews",           icon: MessageSquare, contentKey: "reviews",
    hint_es: "Datos desde Google · solo texto",   hint_en: "Data from Google · text only" },
  { key: "services",         title_es: "Servicios",              title_en: "Services",          icon: Scissors,      contentKey: "services",
    hint_es: "Precios desde Acuity · solo texto", hint_en: "Pricing from Acuity · text only" },
  { key: "barber-profiles",  title_es: "El Equipo",              title_en: "The Team",          icon: Users,         contentKey: "team" },
  { key: "barber-galleries", title_es: "Galerías de barberos",   title_en: "Barber galleries",  icon: Camera },
  { key: "install",          title_es: "Añadir a inicio",        title_en: "Add to Home Screen",icon: Smartphone,    contentKey: "install" },
  { key: "blog",             title_es: "Titulares",              title_en: "Headlines",         icon: Newspaper,     contentKey: "blog",
    hint_es: "Posts se editan en Blog",           hint_en: "Posts edit in Blog" },
  { key: "home-grid",        title_es: "Galería del inicio",     title_en: "Homepage gallery",  icon: ImageIcon,     contentKey: "grid" },
  { key: "faq",              title_es: "Preguntas frecuentes",   title_en: "FAQ",               icon: AlignLeft,     contentKey: "faq" },
  { key: "instagram",        title_es: "Lo Último (IG)",         title_en: "The Latest (IG)",   icon: Instagram,     contentKey: "instagram" },
  { key: "cta",              title_es: "CTA final",              title_en: "Final CTA",         icon: Megaphone,     contentKey: "cta" },
  { key: "contact",          title_es: "Contacto",               title_en: "Contact",           icon: MapPin,        viewOnly: true },
  { key: "footer",           title_es: "Footer",                 title_en: "Footer",            icon: Type,          contentKey: "footer" },
];

type DraftStatus = {
  header_logo: number; sidebar_logo: number; hero: number; home_grid: number;
  barber_profiles: number; barber_galleries: number; total: number;
};

export function WebsiteAssetsView({ es }: { es: boolean }) {
  const [params] = useSearchParams();
  const section = params.get("section") as SectionKey | null;
  if (section) return <SectionPage section={section} es={es} />;
  return <SectionList es={es} />;
}

/* ───────────────────────── List of sections ───────────────────────── */

function SectionList({ es }: { es: boolean }) {
  const [, setParams] = useSearchParams();
  const [status, setStatus] = useState<DraftStatus | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const bp = useBreakpoint();
  const twoCol = bp !== "mobile";


  const refresh = useCallback(async () => {
    const [{ data: st }, data] = await Promise.all([
      supabase.rpc("website_draft_status" as any),
      loadWebsiteDraftAssets(),
    ]);
    if (st) setStatus(st as DraftStatus);
    setSettingsId(data?.id ?? null);
    const live  = (data?.site_content as any)?.visibility || {};
    const draft = (data?.draft_site_content as any)?.visibility || {};
    setVisibility({ ...live, ...draft });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const draftBadge = (key: SectionKey): boolean => {
    if (!status) return false;
    if (key === "header")           return status.header_logo > 0;
    if (key === "sidebar-logo")     return status.sidebar_logo > 0;
    if (key === "hero")             return status.hero > 0;
    if (key === "home-grid")        return status.home_grid > 0;
    if (key === "barber-profiles")  return status.barber_profiles > 0;
    if (key === "barber-galleries") return status.barber_galleries > 0;
    return false;
  };

  const open = (key: SectionKey) => {
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("section", key);
      return n;
    }, { replace: true });
  };

  const setSectionVisible = async (key: SectionKey, next: boolean) => {
    // Optimistic update
    setVisibility((v) => ({ ...v, [key]: next }));
    try {
      const data = await loadWebsiteDraftAssets();
      const id = data?.id ?? settingsId;
      if (!id) throw new Error("settings_missing");
      const base = (data?.draft_site_content as any) || (data?.site_content as any) || {};
      const newDraft = {
        ...base,
        visibility: { ...(base.visibility || {}), [key]: next },
      };
      const { error } = await supabase.from("shop_settings")
        .update({ draft_site_content: newDraft } as any).eq("id", id);
      if (error) throw error;
      notifyAssetChanged();
      void refresh();
      toast.success(es ? "Borrador guardado" : "Draft saved");
    } catch (e: any) {
      // revert
      setVisibility((v) => ({ ...v, [key]: !next }));
      toast.error(e.message || "Save failed");
    }
  };

  const sectionList = (
    <div className="space-y-2">
      <p className="text-[11px] mb-1" style={{ color: "var(--text-tertiary)" }}>
        {es
          ? "Activa o desactiva la visibilidad pública de cada sección. Los cambios se guardan como borrador y se publican desde la pantalla principal."
          : "Toggle each section's public visibility. Changes save as drafts and publish from the root screen."}
      </p>

      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isDraft = draftBadge(s.key);
        const hint = s.hint_es && (es ? s.hint_es : s.hint_en);
        const isVisible = visibility[s.key] !== false;
        return (
          <div
            key={s.key}
            className="w-full flex items-center gap-3 p-3 rounded-xl card-elevated"
          >
            <button
              onClick={() => open(s.key)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--bg-surface-2)" }}
              >
                <Icon size={18} style={{ color: "var(--accent-color)" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-bold truncate"
                    style={{
                      color: isVisible ? "var(--text-primary)" : "var(--text-tertiary)",
                    }}
                  >
                    {es ? s.title_es : s.title_en}
                  </span>
                  {isDraft && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
                    >
                      {es ? "Borrador" : "Draft"}
                    </span>
                  )}
                  {!isVisible && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: "var(--bg-surface-2)", color: "var(--text-tertiary)" }}
                    >
                      {es ? "Oculta" : "Hidden"}
                    </span>
                  )}
                  {s.viewOnly && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-1"
                      style={{ background: "var(--bg-surface-2)", color: "var(--text-tertiary)" }}
                    >
                      <Eye size={9} />
                      {es ? "Solo vista" : "View only"}
                    </span>
                  )}
                </div>
                {hint && (
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{hint}</div>
                )}
              </div>
              <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
            </button>
            <StandardToggle
              checked={isVisible}
              onChange={(next) => setSectionVisible(s.key, next)}
              ariaLabel={`${es ? s.title_es : s.title_en} · ${es ? "Visibilidad" : "Visibility"}`}
            />
          </div>
        );
      })}
    </div>
  );

  if (twoCol) {
    return (
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="md:sticky md:top-4 min-w-0">
          <GlobalLivePreview es={es} visibility={visibility} />
        </div>
        <div className="min-w-0">{sectionList}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <GlobalLivePreview es={es} visibility={visibility} />
      {sectionList}
    </div>
  );
}


/* ───────────────────────── Section page ───────────────────────── */

function SectionPage({ section, es }: { section: SectionKey; es: boolean }) {
  const meta = SECTIONS.find((s) => s.key === section);
  const contentKey = meta?.contentKey;
  const schema = contentKey ? SECTION_SCHEMAS[contentKey] : null;
  // Lifted local draft for the section being edited — drives the live preview
  // in real-time as the admin types (before "Guardar" persists to draft_*).
  const [localDraft, setLocalDraft] = useState<any>(null);
  const overrideValue = contentKey && localDraft
    ? ({ [contentKey]: localDraft } as Partial<SiteContent>)
    : undefined;

  return (
    <div className="grid gap-4 md:grid-cols-2 md:items-start">
      <div className="md:sticky md:top-4">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-2"
             style={{ color: "var(--text-tertiary)" }}>
          {es ? "Vista en vivo" : "Live preview"}
          <span className="text-[9px] font-normal" style={{ color: "var(--text-tertiary)" }}>
            ({es ? "con cambios sin guardar" : "with unsaved changes"})
          </span>
        </div>
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--divider)", background: "var(--bg-base)" }}>
          <SiteContentProvider value={overrideValue}>
            <LivePreview section={section} />
          </SiteContentProvider>
        </div>
      </div>

      <div className="space-y-4 min-w-0">
        {/* Image editor (if applicable) */}
        {!meta?.viewOnly && (
          <SectionEditor section={section} es={es} />
        )}

        {/* Text editor (if applicable) */}
        {schema && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                 style={{ color: "var(--text-tertiary)" }}>
              {es ? "Editar texto" : "Edit text"}
            </div>
            <TextSectionEditor schema={schema} es={es} onDraftChange={setLocalDraft} />
          </div>
        )}

        {section === "blog" && <HeadlinesHint es={es} />}
      </div>
    </div>
  );
}

function HeadlinesHint({ es }: { es: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/admin/titulares")}
      className="w-full flex items-center justify-between p-3 rounded-xl card-elevated text-left"
    >
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {es ? "Abrir editor de Titulares" : "Open Headlines editor"}
      </span>
      <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
    </button>
  );
}

/* ───────────────────────── Section image editors ───────────────────────── */

function SectionEditor({ section, es }: { section: SectionKey; es: boolean }) {
  if (section === "header" || section === "sidebar-logo") {
    return <LogoEditor which={section} es={es} />;
  }
  if (section === "hero") return <HeroEditor es={es} />;
  if (section === "home-grid") return <HomeGridEditor es={es} />;
  if (section === "barber-profiles") return <BarberProfilesEditor es={es} />;
  if (section === "barber-galleries") return <BarberGalleriesEditor es={es} />;
  return null;
}

/* ── Logos (header / sidebar) → shop_settings.draft_{header|sidebar}_logo_url */
function LogoEditor({ which, es }: { which: "header" | "sidebar-logo"; es: boolean }) {
  const draftCol = which === "header" ? "draft_header_logo_url" : "draft_sidebar_logo_url";
  const liveCol  = which === "header" ? "header_logo_url"       : "sidebar_logo_url";
  const folder   = which === "header" ? "brand/header"          : "brand/sidebar";

  const { headerLogoUrl, sidebarLogoUrl, refresh } = useBrandLogos();
  const liveUrl = which === "header" ? headerLogoUrl : sidebarLogoUrl;
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await loadWebsiteDraftAssets();
    setDraftUrl(data?.[draftCol] ?? null);
  }, [draftCol]);
  useEffect(() => { load(); }, [load]);

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("email-assets").upload(path, file, {
        contentType: file.type, upsert: false, cacheControl: "3600",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("email-assets").getPublicUrl(path);
      const ss = await loadWebsiteDraftAssets();
      if (ss?.id) {
        const { error } = await supabase.from("shop_settings")
          .update({ [draftCol]: pub.publicUrl } as any).eq("id", ss.id);
        if (error) throw error;
      }
      setDraftUrl(pub.publicUrl);
      await load();
      notifyAssetChanged();
      toast.success(es ? "Borrador guardado" : "Draft saved");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!confirm(es ? "¿Eliminar logo? (se aplica al publicar)" : "Delete logo? (applies on publish)")) return;
    setBusy(true);
    try {
      const ss = await loadWebsiteDraftAssets();
      if (ss?.id) {
        // Empty string in draft means "remove on publish"; differentiate from no-draft (null).
        await supabase.from("shop_settings").update({ [draftCol]: "" } as any).eq("id", ss.id);
      }
      await load();
      notifyAssetChanged();
      toast.success(es ? "Borrador guardado" : "Draft saved");
    } finally { setBusy(false); }
  };

  const onRevert = async () => {
    setBusy(true);
    try {
      const ss = await loadWebsiteDraftAssets();
      if (ss?.id) {
        await supabase.from("shop_settings").update({ [draftCol]: null } as any).eq("id", ss.id);
      }
      await load();
      notifyBrandLogosUpdated();
      notifyAssetChanged();
      await refresh();
    } finally { setBusy(false); }
  };

  const effective = effectiveUrl(liveUrl, draftUrl);
  return (
    <div className="space-y-2">
      <SingleAssetTile
        url={effective}
        es={es}
        onUpload={onUpload}
        onDelete={onDelete}
        busy={busy}
        objectFit="contain"
        aspect="aspect-[3/1]"
      />
      {draftUrl !== null && (
        <DraftActions es={es} onRevert={onRevert} />
      )}
    </div>
  );
}

/* ── Hero → shop_settings.draft_hero_image_url */
function HeroEditor({ es }: { es: boolean }) {
  const [live, setLive] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await loadWebsiteDraftAssets();
    setLive(data?.hero_image_url || null);
    setDraft(data?.draft_hero_image_url ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const blob = await optimizeToWebP(file, { maxWidth: 1600, quality: 0.85 });
      const path = `brand/hero/${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage.from("email-assets").upload(path, blob, {
        contentType: "image/webp", upsert: false, cacheControl: "3600",
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("email-assets").getPublicUrl(path);
      const ss = await loadWebsiteDraftAssets();
      if (ss?.id) {
        const { error } = await supabase.from("shop_settings").update({ draft_hero_image_url: pub.publicUrl } as any).eq("id", ss.id);
        if (error) throw error;
      }
      setDraft(pub.publicUrl);
      await load();
      notifyAssetChanged();
      toast.success(es ? "Borrador guardado" : "Draft saved");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!confirm(es ? "¿Eliminar hero? (se aplica al publicar)" : "Delete hero? (applies on publish)")) return;
    setBusy(true);
    try {
      const ss = await loadWebsiteDraftAssets();
      if (ss?.id) {
        await supabase.from("shop_settings").update({ draft_hero_image_url: "" } as any).eq("id", ss.id);
      }
      await load();
      notifyAssetChanged();
    } finally { setBusy(false); }
  };

  const onRevert = async () => {
    setBusy(true);
    try {
      const ss = await loadWebsiteDraftAssets();
      if (ss?.id) {
        await supabase.from("shop_settings").update({ draft_hero_image_url: null } as any).eq("id", ss.id);
      }
      await load();
      notifyAssetChanged();
    } finally { setBusy(false); }
  };

  if (loading) return <Spinner />;
  const effective = effectiveUrl(live, draft);
  return (
    <div className="space-y-2">
      <SingleAssetTile url={effective} es={es} onUpload={onUpload} onDelete={onDelete} busy={busy} aspect="aspect-[4/5]" />
      {draft !== null && <DraftActions es={es} onRevert={onRevert} />}
    </div>
  );
}

/* ── Home grid → shop_settings.draft_home_grid_photos */
function HomeGridEditor({ es }: { es: boolean }) {
  return <PhotoArrayEditor table="home" es={es} />;
}

function PhotoArrayEditor({ table, barberId, es }: { table: "home" | "barber"; barberId?: string; es: boolean }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    if (table === "home") {
      const d = await loadWebsiteDraftAssets();
      const draft = d?.draft_home_grid_photos;
      setHasDraft(draft !== null && draft !== undefined);
      setPhotos((draft ?? d?.home_grid_photos) || []);
    } else if (barberId) {
      const { data } = await supabase.from("barbers")
        .select("ig_photos,draft_ig_photos" as any).eq("id", barberId).maybeSingle();
      const d = data as any;
      const draft = d?.draft_ig_photos;
      setHasDraft(draft !== null && draft !== undefined);
      setPhotos((draft ?? d?.ig_photos) || []);
    }
    setLoading(false);
  }, [table, barberId]);
  useEffect(() => { load(); }, [load]);

  const persist = async (next: string[]) => {
    if (table === "home") {
      const ss = await loadWebsiteDraftAssets();
      if (ss?.id) {
        await supabase.from("shop_settings").update({ draft_home_grid_photos: next } as any).eq("id", ss.id);
      }
    } else if (barberId) {
      await supabase.from("barbers").update({ draft_ig_photos: next } as any).eq("id", barberId);
    }
    setHasDraft(true);
    notifyAssetChanged();
  };
  const update = (next: string[]) => { setPhotos(next); void persist(next); };

  const onRevert = async () => {
    if (table === "home") {
      const ss = await loadWebsiteDraftAssets();
      if (ss?.id) {
        await supabase.from("shop_settings").update({ draft_home_grid_photos: null } as any).eq("id", ss.id);
      }
    } else if (barberId) {
      await supabase.from("barbers").update({ draft_ig_photos: null } as any).eq("id", barberId);
    }
    await load();
    notifyAssetChanged();
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[idx], next[j]] = [next[j], next[idx]];
    update(next);
  };
  const remove = (idx: number) => update(photos.filter((_, i) => i !== idx));

  const upload = async (file: File) => {
    setUploadingIdx(photos.length);
    try {
      const blob = await optimizeToWebP(file, { maxWidth: 1080, quality: 0.82 });
      const folder = table === "home" ? "home" : `barber/${barberId}`;
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
      const { error } = await supabase.storage.from("barber-gallery").upload(path, blob, {
        contentType: "image/webp", upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("barber-gallery").getPublicUrl(path);
      update([...photos, data.publicUrl]);
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingIdx(null);
    }
  };
  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) await upload(f);
  };

  if (loading) return <Spinner />;
  const slots = Math.max(9, photos.length + 1);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: slots }).map((_, idx) => {
          const url = photos[idx];
          if (!url) {
            const isUp = uploadingIdx === idx;
            return (
              <label
                key={`e-${idx}`}
                className="aspect-square flex flex-col items-center justify-center cursor-pointer relative rounded-md"
                style={{ background: "var(--bg-surface-2)", border: "1px dashed var(--divider)" }}
              >
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => onFiles(e.target.files)} disabled={isUp} />
                {isUp ? <Loader2 className="animate-spin" size={18} style={{ color: "var(--text-tertiary)" }} />
                      : <><Plus size={20} style={{ color: "var(--text-tertiary)" }} />
                          <span className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>{idx + 1}</span></>}
              </label>
            );
          }
          return (
            <div key={url + idx} className="relative aspect-square overflow-hidden rounded-md" style={{ background: "var(--bg-surface-2)" }}>
              <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
              <button onClick={() => remove(idx)} className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.65)" }} aria-label="Remove"><X size={14} color="#fff" /></button>
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
                <button onClick={() => move(idx, -1)} disabled={idx === 0}
                  className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.65)" }}><ChevronLeft size={14} color="#fff" /></button>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}>{idx + 1}</span>
                <button onClick={() => move(idx, 1)} disabled={idx === photos.length - 1}
                  className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                  style={{ background: "rgba(0,0,0,0.65)" }}><Chev size={14} color="#fff" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {hasDraft && <DraftActions es={es} onRevert={onRevert} />}
    </div>
  );
}

/* ── Barber profiles (avatars) — draft_avatar_url per barber */
function BarberProfilesEditor({ es }: { es: boolean }) {
  const [barbers, setBarbers] = useState<Array<{
    id: string; name: string; avatar_url: string | null; draft_avatar_url: string | null;
  }>>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("barbers")
      .select("id,name,avatar_url,draft_avatar_url" as any)
      .eq("is_active", true).eq("is_bookable", true).order("name");
    setBarbers((data as any[]) || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const upload = async (barber: { id: string; name: string }, file: File) => {
    setBusyId(barber.id);
    try {
      const blob = await optimizeToWebP(file, { maxWidth: 600, quality: 0.85 });
      const path = `${barber.id}/avatar-${Date.now()}.webp`;
      const { error: upErr } = await supabase.storage.from("barber-avatars").upload(path, blob, {
        contentType: "image/webp", upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("barber-avatars").getPublicUrl(path);
      const { error } = await supabase.from("barbers")
        .update({ draft_avatar_url: pub.publicUrl } as any).eq("id", barber.id);
      if (error) throw error;
      await load();
      notifyAssetChanged();
      toast.success(es ? "Borrador guardado" : "Draft saved");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally { setBusyId(null); }
  };

  const remove = async (id: string) => {
    if (!confirm(es ? "¿Eliminar avatar? (se aplica al publicar)" : "Delete avatar? (applies on publish)")) return;
    setBusyId(id);
    try {
      await supabase.from("barbers").update({ draft_avatar_url: "" } as any).eq("id", id);
      await load();
      notifyAssetChanged();
    } finally { setBusyId(null); }
  };

  const revert = async (id: string) => {
    setBusyId(id);
    try {
      await supabase.from("barbers").update({ draft_avatar_url: null } as any).eq("id", id);
      await load();
      notifyAssetChanged();
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-2">
      {barbers.map((b) => {
        const effective = effectiveUrl(b.avatar_url, b.draft_avatar_url);
        const hasDraft = b.draft_avatar_url !== null;
        const busy = busyId === b.id;
        return (
          <div key={b.id} className="flex items-center gap-3 p-3 rounded-xl card-elevated">
            <div className="w-14 h-14 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
                 style={{ background: "var(--bg-surface-2)" }}>
              {effective
                ? <img src={effective} alt={b.name} className="w-full h-full object-cover" />
                : <Users size={18} style={{ color: "var(--text-tertiary)" }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{b.name}</span>
                {hasDraft && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}>
                    {es ? "Borrador" : "Draft"}
                  </span>
                )}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {effective ? (es ? "Avatar establecido" : "Avatar set") : (es ? "Sin avatar" : "No avatar")}
              </div>
            </div>
            <label className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                   style={{ background: "var(--accent-color)", color: "var(--cta-fg)", opacity: busy ? 0.6 : 1 }}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : (es ? "Reemplazar" : "Replace")}
              <input type="file" accept="image/*" className="hidden" disabled={busy}
                     onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(b, f); e.currentTarget.value = ""; }} />
            </label>
            {effective && (
              <button onClick={() => remove(b.id)} disabled={busy}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                style={{ background: "var(--bg-surface-2)", color: "#ef4444" }}>
                <Trash2 size={12} />
              </button>
            )}
            {hasDraft && (
              <button onClick={() => revert(b.id)} disabled={busy}
                className="px-2 py-1.5 rounded-lg text-[10px] font-bold"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
                {es ? "Revertir" : "Revert"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Barber galleries → draft_ig_photos per barber */
function BarberGalleriesEditor({ es }: { es: boolean }) {
  const [barbers, setBarbers] = useState<Array<{ id: string; name: string; ig_photos: string[] | null; draft_ig_photos: string[] | null }>>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("barbers")
        .select("id,name,ig_photos,draft_ig_photos" as any)
        .eq("is_active", true).eq("is_bookable", true).order("name");
      setBarbers((data as any[]) || []);
    })();
  }, []);

  return (
    <div className="space-y-2">
      {barbers.map((b) => {
        const photos = (b.draft_ig_photos ?? b.ig_photos) || [];
        const count = photos.filter(Boolean).length;
        const hasDraft = b.draft_ig_photos !== null;
        const isOpen = open === b.id;
        return (
          <div key={b.id} className="rounded-xl card-elevated overflow-hidden">
            <button
              onClick={() => setOpen(isOpen ? null : b.id)}
              className="w-full flex items-center justify-between p-3 text-left"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{b.name}</span>
                  {hasDraft && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}>
                      {es ? "Borrador" : "Draft"}
                    </span>
                  )}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {count} {count === 1 ? (es ? "foto" : "photo") : (es ? "fotos" : "photos")}
                </div>
              </div>
              <ChevronRight size={16}
                style={{ color: "var(--text-tertiary)", transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform .15s" }} />
            </button>
            {isOpen && (
              <div className="p-3 pt-0">
                <PhotoArrayEditor table="barber" barberId={b.id} es={es} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Shared bits ───────────────────────── */

/** Treat "" (empty string draft) as "explicitly removed", null draft as "no change". */
function effectiveUrl(live: string | null, draft: string | null): string | null {
  if (draft === null) return live || null;
  if (draft === "") return null;
  return draft;
}

function DraftActions({ es, onRevert }: { es: boolean; onRevert: () => void | Promise<void> }) {
  return (
    <button
      onClick={onRevert}
      className="w-full py-2 rounded-lg text-[11px] font-bold"
      style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
    >
      {es ? "Revertir cambios de esta sección" : "Revert changes in this section"}
    </button>
  );
}

function SingleAssetTile({
  url, es, onUpload, onDelete, busy, objectFit = "cover", aspect = "aspect-[4/3]",
}: {
  url: string | null; es: boolean;
  onUpload: (f: File) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  busy: boolean;
  objectFit?: "cover" | "contain";
  aspect?: string;
}) {
  return (
    <div className="space-y-2">
      <div className={`${aspect} rounded-xl overflow-hidden flex items-center justify-center relative`} style={{ background: "var(--bg-surface-2)" }}>
        {url ? (
          <img src={url} alt="" className={`w-full h-full ${objectFit === "contain" ? "object-contain p-4" : "object-cover"}`} />
        ) : (
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{es ? "Sin imagen" : "No image"}</span>
        )}
      </div>
      <div className="flex gap-2">
        <label className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
               style={{ background: "var(--accent-color)", color: "var(--cta-fg)", opacity: busy ? 0.6 : 1 }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} className="icon-bold" />}
          {url ? (es ? "Reemplazar" : "Replace") : (es ? "Subir" : "Upload")}
          <input type="file" accept="image/*" className="hidden" disabled={busy}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ""; }} />
        </label>
        {url && (
          <button onClick={onDelete} disabled={busy}
            className="px-3 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: "var(--bg-surface-2)", color: "#ef4444" }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>;
}

/* ───────────────────────── Live previews ───────────────────────── */
/**
 * Lightweight visual mirrors of each public-site section. Each preview
 * fetches the effective (draft ?? live) data and renders a stylized
 * snapshot that reads like the real Home, without needing to mount the
 * full public layout.
 */

/**
 * Stacked preview of every Home section with all pending drafts applied.
 * Lives at the top of the section list so the owner can scan the entire
 * site before publishing. Updates in real time as any editor saves
 * (via the ASSET_CHANGED_EVENT signal).
 */
function GlobalLivePreview({ es, visibility }: { es: boolean; visibility: Record<string, boolean> }) {
  const [content, setContent] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(false);
  const tick = useAssetChangeTick();
  useEffect(() => {
    loadWebsiteDraftAssets().then((d) => {
      const live  = (d?.site_content as any) || {};
      const draft = (d?.draft_site_content as any) || {};
      setContent({ ...live, ...draft });
    }).catch(() => setContent(null));
  }, [tick]);

  const order: SectionKey[] = [
    "header", "hero", "reviews", "services", "barber-profiles",
    "install", "blog", "home-grid", "faq", "instagram",
    "cta", "contact", "footer",
  ];
  const visibleOrder = order.filter((k) => visibility[k] !== false);

  return (
    <div>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between mb-1.5"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2"
              style={{ color: "var(--text-tertiary)" }}>
          {es ? "Vista global en vivo" : "Global live preview"}
          <span className="text-[9px] font-normal" style={{ color: "var(--text-tertiary)" }}>
            ({es ? "con borradores aplicados" : "with drafts applied"})
          </span>
        </span>
        <ChevronRight
          size={14}
          style={{
            color: "var(--text-tertiary)",
            transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
            transition: "transform 200ms",
          }}
        />
      </button>
      {!collapsed && (
        <div className="rounded-xl overflow-hidden border"
             style={{ borderColor: "var(--divider)", background: "var(--bg-base)" }}>
          <SiteContentProvider value={content}>
            {visibleOrder.map((key) => (
              <div key={key} className="border-b last:border-b-0"
                   style={{ borderColor: "var(--divider)" }}>
                <LivePreview section={key} />
              </div>
            ))}
            {visibleOrder.length === 0 && (
              <div className="px-4 py-8 text-center text-[11px]"
                   style={{ color: "var(--text-tertiary)" }}>
                {es ? "Todas las secciones están ocultas." : "All sections are hidden."}
              </div>
            )}
          </SiteContentProvider>
        </div>
      )}
    </div>
  );
}



function LivePreview({ section }: { section: SectionKey }) {
  if (section === "header")           return <HeaderPreview />;
  if (section === "sidebar-logo")     return <SidebarPreview />;
  if (section === "hero")             return <HeroPreview />;
  if (section === "reviews")          return <ReviewsPreview />;
  if (section === "services")         return <ServicesPreview />;
  if (section === "barber-profiles")  return <TeamPreview />;
  if (section === "barber-galleries") return <BarberGalleryPreview />;
  if (section === "blog")             return <HeadlinesPreview />;
  if (section === "home-grid")        return <HomeGridPreview />;
  if (section === "install")          return <InstallPreview />;
  if (section === "faq")              return <FAQPreview />;
  if (section === "instagram")        return <InstagramPreview />;
  if (section === "cta")              return <CtaPreview />;
  if (section === "contact")          return <ContactPreview />;
  if (section === "footer")           return <FooterPreview />;
  return null;
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-5" style={{ background: "var(--bg-base)" }}>{children}</div>;
}

function HeaderPreview() {
  const { headerLogoUrl } = useBrandLogos();
  const c = useSiteContent().header;
  const [draft, setDraft] = useState<string | null>(null);
  const tick = useAssetChangeTick();
  useEffect(() => {
    loadWebsiteDraftAssets().then((data) => setDraft(data?.draft_header_logo_url ?? null)).catch(() => setDraft(null));
  }, [tick]);
  const url = effectiveUrl(headerLogoUrl, draft);
  return (
    <PreviewFrame>
      <div className="flex items-center justify-between py-2 px-3 rounded-lg"
           style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="h-7 flex items-center gap-1">
          {url
            ? <img src={url} alt="" className="h-6 object-contain" />
            : <>
                <span className="text-xs font-black" style={{ color: "var(--text-primary)" }}>{c.brand_top}</span>
                <span className="text-xs font-light" style={{ color: "var(--text-secondary)" }}>{c.brand_bottom}</span>
              </>}
        </div>
        <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
              style={{ background: "var(--text-primary)", color: "var(--bg-base)" }}>
          {c.sign_in.es}
        </span>
      </div>
    </PreviewFrame>
  );
}

function SidebarPreview() {
  const { sidebarLogoUrl } = useBrandLogos();
  const [draft, setDraft] = useState<string | null>(null);
  const tick = useAssetChangeTick();
  useEffect(() => {
    loadWebsiteDraftAssets().then((data) => setDraft(data?.draft_sidebar_logo_url ?? null)).catch(() => setDraft(null));
  }, [tick]);
  const url = effectiveUrl(sidebarLogoUrl, draft);
  return (
    <PreviewFrame>
      <div className="flex gap-2 h-40">
        <div className="w-2/5 rounded-lg p-3 flex flex-col gap-2" style={{ background: "var(--bg-surface)" }}>
          <div className="h-7 flex items-center">
            {url ? <img src={url} alt="" className="h-6 object-contain" />
                 : <span className="text-[10px] font-bold" style={{ color: "var(--accent-color)" }}>CHARLIE'S</span>}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-2 rounded" style={{ background: "var(--bg-surface-2)" }} />
          ))}
        </div>
        <div className="flex-1 rounded-lg p-3 space-y-2" style={{ background: "var(--bg-surface-2)" }}>
          <div className="h-3 w-2/3 rounded" style={{ background: "var(--text-tertiary)", opacity: 0.4 }} />
          <div className="h-2 w-1/2 rounded" style={{ background: "var(--text-tertiary)", opacity: 0.3 }} />
        </div>
      </div>
    </PreviewFrame>
  );
}

function HeroPreview() {
  const c = useSiteContent().hero;
  const [live, setLive] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const tick = useAssetChangeTick();
  useEffect(() => {
    loadWebsiteDraftAssets().then((data) => {
      setLive(data?.hero_image_url || null);
      setDraft(data?.draft_hero_image_url ?? null);
    }).catch(() => {
      setLive(null);
      setDraft(null);
    });
  }, [tick]);
  const url = effectiveUrl(live, draft) || heroFallback;
  const bp = useBreakpoint();
  const stacked = bp === "mobile";
  const image = (
    <div className="aspect-[4/5] rounded-xl overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
      <img src={url} alt="" className="w-full h-full object-cover" />
    </div>
  );
  const text = (
    <div>
      <div className="text-[14px] font-black uppercase leading-tight" style={{ color: "var(--text-primary)" }}>
        {c.title.es}
      </div>
      <div className="text-[9px] mt-2" style={{ color: "var(--text-secondary)" }}>
        {c.subtitle.es}
      </div>
      <div className="mt-3 flex items-center gap-1">
        {[...Array(5)].map((_, i) => <Star key={i} size={8} fill="var(--accent-color)" strokeWidth={0} />)}
        <span className="text-[8px] ml-1 font-semibold" style={{ color: "var(--text-primary)" }}>{c.rating_value}</span>
        <span className="text-[8px] ml-1" style={{ color: "var(--text-tertiary)" }}>{c.rating_label.es}</span>
      </div>
      <div className="mt-3 inline-block px-3 py-1.5 rounded-full text-[9px] font-bold uppercase"
           style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
        {c.primary_cta.es}
      </div>
    </div>
  );
  return (
    <PreviewFrame>
      {stacked ? (
        <div className="flex flex-col gap-3">
          {image}
          {text}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 items-center">
          {text}
          {image}
        </div>
      )}
    </PreviewFrame>
  );
}

function ReviewsPreview() {
  const c = useSiteContent().reviews;
  const items = [
    { name: "John Caban", text: "Gran servicio, excelentes empleados y ambiente de trabajo." },
    { name: "Keyla Ortega", text: "Excelente servicio. A mi hijo le encanta cortarse el pelo con Charlie." },
  ];
  return (
    <PreviewFrame>
      <SectionTitle>{c.eyebrow.es}</SectionTitle>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {items.map((r, i) => (
          <div key={i} className="shrink-0 w-48 p-3 rounded-xl"
               style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="flex gap-0.5 mb-2">
              {[...Array(5)].map((_, j) => <Star key={j} size={8} fill="var(--accent-color)" strokeWidth={0} />)}
            </div>
            <p className="text-[10px] leading-relaxed mb-2" style={{ color: "var(--text-primary)" }}>"{r.text}"</p>
            <span className="text-[9px] font-semibold" style={{ color: "var(--text-secondary)" }}>{r.name}</span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

function ServicesPreview() {
  const c = useSiteContent().services;
  const items = [
    { name: "Corte", price: "$25+", dur: "30 min" },
    { name: "Corte + Facial", price: "$50+", dur: "60 min" },
    { name: "La Experiencia", price: "$90+", dur: "90 min" },
  ];
  return (
    <PreviewFrame>
      <SectionTitle>{c.eyebrow.es}</SectionTitle>
      <p className="text-[9px] -mt-2 mb-2" style={{ color: "var(--text-tertiary)" }}>{c.disclaimer.es}</p>
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {c.tabs.map((cat, i) => (
          <span key={i} className="px-2.5 py-1 rounded-full text-[9px] font-semibold"
                style={{ background: i === 0 ? "var(--cta-bg)" : "var(--bg-surface-2)",
                         color:      i === 0 ? "var(--cta-fg)" : "var(--text-secondary)" }}>
            {cat.es}
          </span>
        ))}
      </div>
      <div className="space-y-1.5">
        {items.map((s) => (
          <div key={s.name} className="flex items-center justify-between px-3 py-2 rounded-lg"
               style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div>
              <div className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>{s.name}</div>
              <div className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>{s.dur}</div>
            </div>
            <span className="text-[11px] font-bold" style={{ color: "var(--accent-color)" }}>{s.price}</span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

function TeamPreview() {
  const c = useSiteContent().team;
  const [rows, setRows] = useState<Array<{ id: string; name: string; avatar_url: string | null; draft_avatar_url: string | null }>>([]);
  const tick = useAssetChangeTick();
  useEffect(() => {
    supabase.from("barbers").select("id,name,avatar_url,draft_avatar_url" as any)
      .eq("is_active", true).eq("is_bookable", true).order("name")
      .then(({ data }) => setRows((data as any[]) || []));
  }, [tick]);
  return (
    <PreviewFrame>
      <SectionTitle>{c.eyebrow.es}</SectionTitle>
      <div className="flex justify-center gap-6">
        {rows.map((b) => {
          const u = effectiveUrl(b.avatar_url, b.draft_avatar_url);
          return (
            <div key={b.id} className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
                   style={{ background: "var(--bg-surface-2)", border: "2px solid var(--border)" }}>
                {u
                  ? <img src={u} alt={b.name} className="w-full h-full object-cover" />
                  : <Users size={16} style={{ color: "var(--text-tertiary)" }} />}
              </div>
              <span className="text-[10px] font-bold mt-1.5" style={{ color: "var(--text-primary)" }}>{b.name}</span>
              <span className="text-[8px] font-bold uppercase mt-0.5" style={{ color: "var(--accent-color)" }}>{c.book_label.es} →</span>
            </div>
          );
        })}
      </div>
    </PreviewFrame>
  );
}

function BarberGalleryPreview() {
  const [rows, setRows] = useState<Array<{ id: string; name: string; ig_photos: string[] | null; draft_ig_photos: string[] | null; avatar_url: string | null; draft_avatar_url: string | null }>>([]);
  const tick = useAssetChangeTick();
  useEffect(() => {
    supabase.from("barbers").select("id,name,ig_photos,draft_ig_photos,avatar_url,draft_avatar_url" as any)
      .eq("is_active", true).eq("is_bookable", true).order("name")
      .then(({ data }) => setRows((data as any[]) || []));
  }, [tick]);
  return (
    <PreviewFrame>
      <SectionTitle>Galerías de barberos</SectionTitle>
      <div className="space-y-3">
        {rows.map((b) => {
          const photos = ((b.draft_ig_photos ?? b.ig_photos) || []).filter(Boolean).slice(0, 4);
          const av = effectiveUrl(b.avatar_url, b.draft_avatar_url);
          return (
            <div key={b.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-full overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
                  {av && <img src={av} alt="" className="w-full h-full object-cover" />}
                </div>
                <span className="text-[10px] font-bold" style={{ color: "var(--text-primary)" }}>{b.name}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
                    {photos[i] && <img src={photos[i]} alt="" className="w-full h-full object-cover" />}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </PreviewFrame>
  );
}

function HeadlinesPreview() {
  const c = useSiteContent().blog;
  const [posts, setPosts] = useState<Array<{ id: string; title: string; excerpt: string | null }>>([]);
  useEffect(() => {
    supabase.from("blog_posts").select("id,title,excerpt").eq("is_published", true)
      .order("published_at", { ascending: false }).limit(3)
      .then(({ data }) => setPosts((data as any[]) || []));
  }, []);
  return (
    <PreviewFrame>
      <SectionTitle>{c.eyebrow.es}</SectionTitle>
      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
        {posts.map((p) => (
          <div key={p.id} className="shrink-0 w-44 rounded-xl overflow-hidden"
               style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <div className="h-16" style={{ background: "var(--bg-surface-2)" }} />
            <div className="p-2">
              <div className="text-[10px] font-bold line-clamp-2" style={{ color: "var(--text-primary)" }}>{p.title}</div>
              {p.excerpt && (
                <div className="text-[9px] mt-1 line-clamp-2" style={{ color: "var(--text-tertiary)" }}>{p.excerpt}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="text-center mt-2">
        <span className="text-[9px] font-bold uppercase" style={{ color: "var(--accent-color)" }}>{c.view_all_label.es}</span>
      </div>
    </PreviewFrame>
  );
}

function HomeGridPreview() {
  const c = useSiteContent().grid;
  const [live, setLive] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[] | null>(null);
  const tick = useAssetChangeTick();
  useEffect(() => {
    loadWebsiteDraftAssets().then((data) => {
      setLive(data?.home_grid_photos || []);
      setDraft(data?.draft_home_grid_photos ?? null);
    }).catch(() => {
      setLive([]);
      setDraft(null);
    });
  }, [tick]);
  const photos = (draft ?? live).slice(0, 9);
  return (
    <PreviewFrame>
      <SectionTitle>{c.eyebrow.es}</SectionTitle>
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-square rounded overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
            {photos[i] && <img src={photos[i]} alt="" className="w-full h-full object-cover" />}
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

function InstallPreview() {
  const c = useSiteContent().install;
  return (
    <PreviewFrame>
      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <span className="inline-block px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-[0.18em] mb-2"
              style={{ background: "var(--bg-surface-2)", color: "var(--accent-color)" }}>
          {c.eyebrow.es}
        </span>
        <div className="text-[14px] font-black" style={{ color: "var(--text-primary)" }}>{c.title.es}</div>
        <div className="text-[10px] font-bold mt-1" style={{ color: "var(--text-primary)" }}>{c.subtitle.es}</div>
        <div className="text-[9px] mt-1.5" style={{ color: "var(--text-secondary)" }}>{c.paragraph.es}</div>
        <div className="mt-3 inline-block px-4 py-2 rounded-full text-[10px] font-bold"
             style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>{c.cta.es}</div>
        <div className="text-[8px] mt-2" style={{ color: "var(--text-tertiary)" }}>{c.helper.es}</div>
      </div>
    </PreviewFrame>
  );
}

function FAQPreview() {
  const c = useSiteContent().faq;
  return (
    <PreviewFrame>
      <SectionTitle>{c.eyebrow.es}</SectionTitle>
      <div className="space-y-1">
        {c.items.slice(0, 5).map((f, i) => (
          <div key={i} className="text-[10px] px-2 py-1.5 rounded flex items-center justify-between"
               style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <span className="font-semibold truncate">{f.q.es || "—"}</span>
            <span className="text-[9px] ml-2" style={{ color: "var(--text-tertiary)" }}>+</span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

function InstagramPreview() {
  const c = useSiteContent().instagram;
  const photos = [ig1, ig2, ig3, ig4];
  return (
    <PreviewFrame>
      <SectionTitle>{c.eyebrow.es}</SectionTitle>
      <div className="grid grid-cols-4 gap-1.5">
        {photos.map((p, i) => (
          <div key={i} className="aspect-square rounded overflow-hidden"
               style={{ background: "var(--bg-surface-2)" }}>
            <img src={p} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
      <p className="text-[9px] mt-2 text-center" style={{ color: "var(--text-tertiary)" }}>
        Contenido en vivo desde Instagram.
      </p>
    </PreviewFrame>
  );
}

function CtaPreview() {
  const c = useSiteContent().cta;
  return (
    <PreviewFrame>
      <div className="rounded-xl p-4 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="text-[14px] font-black" style={{ color: "var(--text-primary)" }}>{c.title.es}</div>
        <div className="text-[10px] mt-1 mb-3" style={{ color: "var(--text-secondary)" }}>{c.subtitle.es}</div>
        <div className="flex gap-1.5 justify-center">
          <span className="px-3 py-1.5 rounded-full text-[9px] font-bold"
                style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>{c.primary_label.es}</span>
          <span className="px-3 py-1.5 rounded-full text-[9px] font-bold"
                style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>{c.secondary_label.es}</span>
        </div>
      </div>
    </PreviewFrame>
  );
}

function ContactPreview() {
  return (
    <PreviewFrame>
      <SectionTitle>Contacto</SectionTitle>
      <div className="rounded-lg p-3 space-y-1.5"
           style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <MapPin size={11} style={{ color: "var(--accent-color)" }} />
          <span className="text-[10px]" style={{ color: "var(--text-primary)" }}>PR-2 Km 93.3 Camuy, PR</span>
        </div>
        <div className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>Mar–Sáb · 9am–5pm</div>
        <div className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>Formulario · WhatsApp · Mapa</div>
      </div>
    </PreviewFrame>
  );
}

function FooterPreview() {
  const f = useSiteContent().footer;
  return (
    <PreviewFrame>
      <div className="rounded-lg p-3 space-y-2"
           style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)" }}>
        <div className="text-[12px] font-black" style={{ color: "var(--text-primary)" }}>{f.brand}</div>
        <div className="text-[9px]" style={{ color: "var(--text-secondary)" }}>{f.tagline.es}</div>
        <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: "var(--divider)" }}>
          <div>
            <div className="text-[8px] font-bold uppercase mb-1" style={{ color: "var(--accent-color)" }}>{f.links_heading.es}</div>
            <div className="text-[9px] space-y-0.5" style={{ color: "var(--text-secondary)" }}>
              <div>Citas</div><div>Titulares</div>
            </div>
          </div>
          <div>
            <div className="text-[8px] font-bold uppercase mb-1" style={{ color: "var(--accent-color)" }}>{f.contact_heading.es}</div>
            <div className="text-[9px] space-y-0.5" style={{ color: "var(--text-secondary)" }}>
              <div>{f.address_line1}</div>
              <div>{f.phone}</div>
              <div>{f.hours.es}</div>
            </div>
          </div>
        </div>
        <div className="text-[8px] text-center pt-2 border-t" style={{ borderColor: "var(--divider)", color: "var(--text-tertiary)" }}>
          © {new Date().getFullYear()} {f.copyright_entity}. {f.rights.es}
        </div>
      </div>
    </PreviewFrame>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2 mb-3 ${className || ""}`}>
      <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--accent-color)" }}>
        {children}
      </span>
      <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
    </div>
  );
}
