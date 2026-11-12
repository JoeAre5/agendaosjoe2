/**
 * Admin → Página Web (Website)
 *
 * Standalone CMS for editing public-site imagery section by section.
 * Edits are saved as drafts (draft_* columns). The public site only
 * changes when the owner clicks Publicar from this root screen.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Rocket, Undo2 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { WebsiteAssetsView } from "@/components/media/WebsiteAssetsView";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { supabase } from "@/integrations/supabase/client";
import { notifyBrandLogosUpdated } from "@/contexts/BrandLogosContext";
import { toast } from "sonner";

const SECTION_TITLES: Record<string, { es: string; en: string }> = {
  "header":           { es: "Header",                 en: "Header" },
  "sidebar-logo":     { es: "Panel lateral",          en: "Side panel" },
  "hero":             { es: "Hero",                   en: "Hero" },
  "reviews":          { es: "Reseñas",                en: "Reviews" },
  "services":         { es: "Servicios",              en: "Services" },
  "barber-profiles":  { es: "El Equipo",              en: "The Team" },
  "barber-galleries": { es: "Galerías de barberos",   en: "Barber galleries" },
  "install":          { es: "Añadir a inicio",        en: "Add to Home Screen" },
  "blog":             { es: "Titulares",              en: "Headlines" },
  "home-grid":        { es: "Galería del inicio",     en: "Homepage gallery" },
  "faq":              { es: "Preguntas frecuentes",   en: "FAQ" },
  "instagram":        { es: "Lo Último",              en: "The Latest" },
  "cta":              { es: "CTA final",              en: "Final CTA" },
  "contact":          { es: "Contacto",               en: "Contact" },
  "footer":           { es: "Footer",                 en: "Footer" },
};

export default function Website() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const es = language === "es";
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get("section");

  const [pending, setPending] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); // forces remount of view after publish/discard
  const bp = useBreakpoint();
  const maxWidth = section
    ? (bp === "desktop" ? 1200 : bp === "tablet" ? 860 : 430)
    : (bp === "desktop" ? 1200 : bp === "tablet" ? 860 : 430);


  const loadStatus = useCallback(async () => {
    const { data } = await supabase.rpc("website_draft_status" as any);
    setPending(Number((data as any)?.total ?? 0));
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, section, version]);

  const title = section
    ? SECTION_TITLES[section]?.[es ? "es" : "en"] || (es ? "Sección" : "Section")
    : (es ? "Página Web" : "Website");

  const handleBack = () => {
    if (section) {
      const next = new URLSearchParams(searchParams);
      next.delete("section");
      setSearchParams(next, { replace: true });
    } else {
      navigate("/admin?tab=menu");
    }
  };

  const publish = async () => {
    if (pending === 0) return;
    const ok = confirm(es
      ? `Publicar ${pending} cambio${pending === 1 ? "" : "s"} al sitio público?`
      : `Publish ${pending} change${pending === 1 ? "" : "s"} to the public site?`);
    if (!ok) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("publish_website_draft" as any);
      if (error) throw error;
      notifyBrandLogosUpdated();
      setVersion((v) => v + 1);
      toast.success(es ? "Cambios publicados" : "Changes published");
    } catch (e: any) {
      toast.error(e.message || "Publish failed");
    } finally { setBusy(false); }
  };

  const discard = async () => {
    if (pending === 0) return;
    const ok = confirm(es
      ? "Descartar todos los cambios pendientes?"
      : "Discard all pending changes?");
    if (!ok) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("discard_website_draft" as any);
      if (error) throw error;
      setVersion((v) => v + 1);
      toast.success(es ? "Cambios descartados" : "Changes discarded");
    } catch (e: any) {
      toast.error(e.message || "Discard failed");
    } finally { setBusy(false); }
  };

  return (
    <div
      className="min-h-screen mx-auto w-full pb-32"
      style={{ maxWidth, background: "var(--bg-base)" }}
    >
      <SubpageHeader sticky title={title} onBack={handleBack} />

      {/* Pending bar — only shown on the root list */}
      {!section && pending > 0 && (
        <div className="px-4 mb-3">
          <div className="rounded-xl p-3 flex items-center gap-2"
               style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-color)" }}>
            <span className="flex-1 text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {pending} {pending === 1
                ? (es ? "cambio sin publicar" : "unpublished change")
                : (es ? "cambios sin publicar" : "unpublished changes")}
            </span>
            <button
              onClick={discard}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
            >
              <Undo2 size={12} />
              {es ? "Descartar" : "Discard"}
            </button>
            <button
              onClick={publish}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
              {es ? "Publicar" : "Publish"}
            </button>
          </div>
        </div>
      )}

      <div className="px-4">
        <WebsiteAssetsView key={version} es={es} />
      </div>
    </div>
  );
}
