// Broadcast Asset Studio (v2)
// ============================================================================
// Two asset modes, both fixed at Instagram Story 9:16 (1080×1920):
//
//   1) "Card"  → Transparent PNG. Just the popup card with an editable soft
//      drop-shadow. Designed to be dropped on top of any IG Story photo.
//      Background of the canvas itself stays fully transparent.
//
//   2) "Story" → Full 9:16 canvas with editable background:
//        • Solid color (color picker) + opacity + blur
//        • OR uploaded image as background, with fit/scale/position
//        • Optional dark overlay slider so the card pops
//
// UX flow mirrors the Reports module: a top toggle for the mode, page 1 is
// the editor, page 2 is the export preview with a single big "Download"
// button. Everything is mobile-first, fifth-grade-friendly: emoji-labeled
// sections, sliders with live numeric readouts, large tap targets.
//
// Export quality: render node is the real 1080×1920 logical canvas (scaled
// down visually with CSS transform). modern-screenshot captures at scale=2
// → 2160×3840 PNG. Hero/background images are preloaded with crossOrigin +
// .decode() before capture so they actually render in the PNG (this fixes
// the previous "image inside the card is missing on export" bug).
// ============================================================================
import { useEffect, useMemo, useRef, useState, forwardRef, type CSSProperties } from "react";
import { domToBlob, domToPng, type Options as ScreenshotOptions } from "modern-screenshot";
import {
  Download, Loader2, X, ArrowLeft, ArrowRight, Image as ImageIcon, Trash2,
  Layers, Instagram, Sun, Move, Type, Palette, Languages, Tag, ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";

export interface BroadcastAssetPayload {
  pillEs?: string | null;
  pillEn?: string | null;
  titleEs: string;
  titleEn: string;
  bodyEs: string;
  bodyEn: string;
  ctaLabelEs?: string | null;
  ctaLabelEn?: string | null;
  imageUrl?: string | null;
}

interface Props {
  payload: BroadcastAssetPayload;
  onClose: () => void;
  slug?: string;
}

type Mode = "card" | "story";
type Lang = "es" | "en";
type Page = "edit" | "export";
type ImageFit = "cover" | "contain";

// Canonical Instagram Story dimensions
const CANVAS_W = 1080;
const CANVAS_H = 1920;
const EXPORT_FONT_FAMILY = "Montserrat";
const EXPORT_FONT_STACK = `'${EXPORT_FONT_FAMILY}', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
const SPANISH_FONT_PROBE = "AgendaOS áéíóúÁÉÍÓÚñÑ¿¡üÜ";

// ============================================================================
export function BroadcastAssetStudio({ payload, onClose, slug = "broadcast" }: Props) {
  const { language } = useTranslation();
  const t = (es: string, en: string) => (language === "es" ? es : en);

  // --- Editable copy (does not mutate the broadcast row) -------------------
  const [pillEs,  setPillEs]  = useState(payload.pillEs  ?? "");
  const [pillEn,  setPillEn]  = useState(payload.pillEn  ?? "");
  const [titleEs, setTitleEs] = useState(payload.titleEs ?? "");
  const [titleEn, setTitleEn] = useState(payload.titleEn ?? "");
  const [bodyEs,  setBodyEs]  = useState(payload.bodyEs  ?? "");
  const [bodyEn,  setBodyEn]  = useState(payload.bodyEn  ?? "");
  const [ctaEs,   setCtaEs]   = useState(payload.ctaLabelEs ?? "");
  const [ctaEn,   setCtaEn]   = useState(payload.ctaLabelEn ?? "");
  const [exportLang, setExportLang] = useState<Lang>(language);

  // --- SEO-friendly filename for the exported PNG --------------------------
  // Auto pattern: charlies-barbershop-{title-slug}-{lang}-{yyyy-mm}.png
  // Field is prefilled with the auto name and stays auto-synced with title/lang
  // until the owner manually edits it (then we stop overwriting their text).
  const [customFileName, setCustomFileName] = useState("");
  const [customFileNameTouched, setCustomFileNameTouched] = useState(false);
  const [showFileNameField, setShowFileNameField] = useState(false);

  // --- Mode + page ---------------------------------------------------------
  const [mode, setMode] = useState<Mode>("card");
  const [page, setPage] = useState<Page>("edit");
  // Canva-style: which tool panel is open above the bottom toolbar.
  type Tool = "text" | "shadow" | "bg" | "image" | "lang" | null;
  const [tool, setTool] = useState<Tool>(null);

  // --- Card-shadow controls (used in BOTH modes) ---------------------------
  // Defaults sized in logical canvas px so the captured PNG matches preview.
  const [shadowOpacity, setShadowOpacity] = useState(0.45); // 0–1
  const [shadowBlur,    setShadowBlur]    = useState(85);   // px in canvas space
  const [shadowSpread,  setShadowSpread]  = useState(0);    // px

  // --- Story-mode background controls --------------------------------------
  const [bgColor,   setBgColor]   = useState("#0b0b0c");
  const [bgOpacity, setBgOpacity] = useState(1);            // 0–1
  const [bgBlur,    setBgBlur]    = useState(12);           // px on bg layer
  const [bgImage,   setBgImage]   = useState<string | null>(null);
  const [bgFit,     setBgFit]     = useState<ImageFit>("cover");
  const [bgScale,   setBgScale]   = useState(1);            // 0.5–3
  const [bgX,       setBgX]       = useState(0);            // % offset
  const [bgY,       setBgY]       = useState(0);            // %
  const [overlay,   setOverlay]   = useState(0.30);         // 0–1 dark wash on top of bg, behind card

  // --- Refs ---------------------------------------------------------------
  const captureRef    = useRef<HTMLDivElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.3);
  const [exporting, setExporting] = useState(false);

  // Hero image is pre-resolved ONCE to a data URL. This avoids the
  // CORS-cache poisoning bug where exporting one language tainted the
  // browser cache for the next language's export. After this resolves,
  // both Spanish and English exports render the same inlined image.
  const [heroDataUrl, setHeroDataUrl] = useState<string | null>(null);
  const [heroLoading, setHeroLoading] = useState(false);
  const [heroError, setHeroError] = useState(false);
  const [heroLoadAttempt, setHeroLoadAttempt] = useState(0);
  const [fontEmbedCSS, setFontEmbedCSS] = useState<string | null>(null);

  // Lock body scroll while studio is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Fit logical 1080×1920 canvas inside the visible preview area
  useEffect(() => {
    const fit = () => {
      const wrap = previewWrapRef.current;
      if (!wrap) return;
      const maxW = wrap.clientWidth - 24;
      const maxH = wrap.clientHeight - 24;
      const scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H);
      setPreviewScale(Math.max(0.05, scale));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [page]);

  const renderPayload = useMemo(
    () => ({
      pill:     exportLang === "es" ? pillEs   : pillEn,
      title:    exportLang === "es" ? titleEs  : titleEn,
      body:     exportLang === "es" ? bodyEs   : bodyEn,
      ctaLabel: exportLang === "es" ? ctaEs    : ctaEn,
      // Always feed the inlined data URL (when available) instead of the
      // remote URL — this is the single biggest fix for the language-
      // dependent black-image bug.
      imageUrl: heroDataUrl ?? payload.imageUrl ?? null,
    }),
    [exportLang, pillEs, pillEn, titleEs, titleEn, bodyEs, bodyEn, ctaEs, ctaEn, heroDataUrl, payload.imageUrl],
  );

  const onPickBgImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setBgImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const waitForExportFonts = async () => {
    const fonts = document.fonts;
    if (!fonts) return;
    await fonts.load(`400 48px ${EXPORT_FONT_FAMILY}`, SPANISH_FONT_PROBE);
    await fonts.load(`600 48px ${EXPORT_FONT_FAMILY}`, SPANISH_FONT_PROBE);
    await fonts.load(`700 48px ${EXPORT_FONT_FAMILY}`, SPANISH_FONT_PROBE);
    await fonts.load(`900 48px ${EXPORT_FONT_FAMILY}`, SPANISH_FONT_PROBE);
    await fonts.ready;
  };

  // Convert a remote URL to a base64 data URL so html-to-image can serialize
  // it without CORS taint. We force `cache: "reload"` and append a unique
  // query param so Safari/iOS cannot reuse a previously-tainted (non-CORS)
  // cached response from the live preview <img> render.
  const urlToDataUrl = async (url: string): Promise<string | null> => {
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url || null;
    try {
      const bust = `${url.includes("?") ? "&" : "?"}_cors=${Date.now()}`;
      const res = await fetch(url + bust, {
        mode: "cors",
        credentials: "omit",
        cache: "reload",
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  };

  // Pre-resolve the hero image into a stable data URL ONCE, when the
  // studio opens (or the source URL changes). Both languages then share
  // the same already-inlined image, so html-to-image never has to fetch
  // anything — and the CORS-cache race that caused the Spanish-only
  // black-image bug is impossible.
  useEffect(() => {
    let cancelled = false;
    const src = payload.imageUrl;
    if (!src) {
      setHeroDataUrl(null);
      setHeroError(false);
      return;
    }
    if (src.startsWith("data:") || src.startsWith("blob:")) {
      setHeroDataUrl(src);
      setHeroError(false);
      return;
    }
    setHeroLoading(true);
    setHeroError(false);
    setHeroDataUrl(null);
    urlToDataUrl(src)
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setHeroDataUrl(data);
          setHeroError(false);
        } else {
          console.warn("[asset-studio] hero image inlining failed", src);
          setHeroDataUrl(null);
          setHeroError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setHeroError(true);
      })
      .finally(() => {
        if (!cancelled) setHeroLoading(false);
      });
    return () => { cancelled = true; };
  }, [payload.imageUrl, heroLoadAttempt]);

  useEffect(() => {
    let cancelled = false;
    const prepareFonts = async () => {
      try {
        await waitForExportFonts();
        // modern-screenshot auto-embeds fonts via its `font` option (see handleExport).
        // Pre-resolved cssText is no longer needed since we removed html-to-image.
        if (!cancelled) setFontEmbedCSS(null);
      } catch (e) {
        console.warn("[asset-studio] export font preparation failed; using browser-resolved fonts", e);
        if (!cancelled) setFontEmbedCSS(null);
      }
    };
    prepareFonts();
    return () => { cancelled = true; };
  }, []);

  // Final safety net: walk the captured node and ensure every <img> has
  // finished decoding before we hand off to the capture library. With the hero
  // pre-resolved to a data URL this is essentially instant, but we keep
  // it for any future <img> additions (background image, etc.).
  const preloadImages = async (root: HTMLElement) => {
    const imgs = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) => (
        img.complete ? Promise.resolve() : img.decode().catch(() => {})
      )),
    );
  };

  const safeFileNamePart = (value: string, max = 60) => {
    const cleaned = value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max);
    return cleaned;
  };

  // SEO-rich auto filename: brand + descriptive title + language + YYYY-MM.
  // Example: charlies-barbershop-promocion-dia-de-las-madres-es-2026-04.png
  const buildAutoFileName = (): string => {
    const brand = "charlies-barbershop";
    const titleSrc = (exportLang === "es" ? titleEs : titleEn) || slug;
    const titlePart = safeFileNamePart(titleSrc, 60) || "broadcast";
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    return `${brand}-${titlePart}-${exportLang}-${yyyy}-${mm}`;
  };

  const autoFileName = buildAutoFileName();

  // Keep the editable field in sync with the auto name until the owner
  // actually edits it. Once touched, we never overwrite their text.
  useEffect(() => {
    if (!customFileNameTouched) setCustomFileName(autoFileName);
  }, [autoFileName, customFileNameTouched]);

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = fileName;
    link.href = url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
  };

  const handleExport = async () => {
    const node = captureRef.current;
    if (!node || exporting) return;
    if (heroLoading) {
      toast.error(t("Cargando imagen, intenta de nuevo en un segundo", "Image still loading, try again in a second"));
      return;
    }
    if (payload.imageUrl && !heroDataUrl) {
      toast.error(t("No se pudo cargar la imagen para exportar", "Could not load the image for export"));
      return;
    }
    setExporting(true);
    try {
      // Capture the LIVE node directly — modern-screenshot clones internally with
      // computed styles. A manual cloneNode + off-screen mount loses parent
      // layout context (scaled wrapper, sizing) and produces a blank PNG.
      await waitForExportFonts();
      await preloadImages(node);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const resolvedFontEmbedCSS = fontEmbedCSS ?? undefined;

      const cleanedCustom = safeFileNamePart(customFileName, 80);
      const baseName = cleanedCustom || autoFileName;
      const fileName = `${baseName}-${mode}.png`;
      const opts: ScreenshotOptions = {
        scale: 2, // 1080×1920 → 2160×3840 PNG
        width: CANVAS_W,
        height: CANVAS_H,
        backgroundColor: null,
        timeout: 30000,
        fetch: {
          bypassingCache: true,
          requestInit: { mode: "cors", credentials: "omit", cache: "reload" },
        },
        font: resolvedFontEmbedCSS
          ? { preferredFormat: "truetype", cssText: resolvedFontEmbedCSS }
          : { preferredFormat: "truetype" },
      };

      let blob = await domToBlob(node, opts);

      if (!blob) {
        // Safari/iOS PWA fallback: route through data URL → fetch → blob
        const dataUrl = await domToPng(node, opts);
        blob = await (await fetch(dataUrl)).blob();
      }

      if (!blob) throw new Error("Empty export");
      downloadBlob(blob, fileName);
      toast.success(t("¡Listo! Imagen descargada", "Done! Image downloaded"));
    } catch (e: unknown) {
      console.error("[asset-studio] export failed", e);
      toast.error(e instanceof Error ? e.message : t("Error al exportar", "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────
  const isExportPage = page === "export";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: "var(--bg-base)" }}>
      {/* Header ---------------------------------------------------------- */}
      <div
        className="flex items-center justify-between px-4 shrink-0"
        style={{
          borderBottom: "1px solid var(--divider)",
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
          paddingBottom: "12px",
        }}
      >
        <button onClick={onClose} className="p-3 -ml-2 rounded-lg" aria-label="close">
          <X size={20} style={{ color: "var(--text-primary)" }} />
        </button>
        <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          {isExportPage ? t("Descargar", "Download") : t("Diseñar", "Design")}
        </h2>
        {isExportPage ? (
          <button
            onClick={handleExport}
            disabled={exporting || heroLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-semibold disabled:opacity-60"
            style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}
          >
            {(exporting || heroLoading) ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            {t("Guardar PNG", "Save PNG")}
          </button>
        ) : (
          <button
            onClick={() => setPage("export")}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12px] font-semibold"
            style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}
          >
            {t("Siguiente", "Next")}
            <ArrowRight size={12} />
          </button>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          Full-screen preview (Canva-style). Both pages share the same
          pinned canvas; only the bottom UI changes.
          ────────────────────────────────────────────────────────────────── */}
      <div
        ref={previewWrapRef}
        className="flex-1 flex items-center justify-center overflow-hidden p-3 min-h-0 relative"
        style={{
          background:
            mode === "card"
              ? "repeating-conic-gradient(var(--bg-surface-2) 0% 25%, var(--bg-surface) 0% 50%) 0 0 / 24px 24px"
              : "var(--bg-surface)",
        }}
      >
        <div
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${previewScale})`,
            transformOrigin: "center center",
            flexShrink: 0,
          }}
        >
          <AssetCanvas
            ref={captureRef}
            exportLang={exportLang}
            mode={mode}
            payload={renderPayload}
            heroLoading={heroLoading && !heroDataUrl}
            shadow={{ opacity: shadowOpacity, blur: shadowBlur, spread: shadowSpread }}
            bg={{ color: bgColor, opacity: bgOpacity, blur: bgBlur, image: bgImage, fit: bgFit, scale: bgScale, x: bgX, y: bgY, overlay }}
          />
        </div>

        {heroError && payload.imageUrl && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-full text-[11px] font-medium shadow-lg"
            style={{
              background: "hsl(var(--destructive))",
              color: "hsl(var(--destructive-foreground))",
            }}
          >
            <span>{t("No se pudo cargar la imagen", "Image failed to load")}</span>
            <button
              type="button"
              onClick={() => { setHeroError(false); setHeroLoadAttempt((n) => n + 1); }}
              className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ background: "hsl(var(--background))", color: "hsl(var(--foreground))" }}
            >
              {t("Reintentar", "Retry")}
            </button>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          Bottom UI — Edit page: tool panel (collapsible) + icon toolbar.
                       Export page: ExportFooter.
          ────────────────────────────────────────────────────────────────── */}
      {isExportPage ? (
        <ExportFooter
          mode={mode}
          exportLang={exportLang}
          setExportLang={setExportLang}
          onBack={() => setPage("edit")}
          onExport={handleExport}
          exporting={exporting || heroLoading}
          autoFileName={autoFileName}
          customFileName={customFileName}
          setCustomFileName={(v) => { setCustomFileNameTouched(true); setCustomFileName(v); }}
          showFileNameField={showFileNameField}
          setShowFileNameField={setShowFileNameField}
          t={t}
        />
      ) : (
        <>
          {/* Open tool panel */}
          {tool && (
            <ToolPanel onClose={() => setTool(null)} title={
              tool === "text"   ? t("Texto", "Text")
              : tool === "shadow" ? t("Sombra de la tarjeta", "Card shadow")
              : tool === "bg"     ? t("Fondo", "Background")
              : tool === "image"  ? t("Imagen de fondo", "Background image")
              : tool === "lang"   ? t("Idioma del preview", "Preview language")
              : ""
            }>
              {tool === "text" && (
                <TextPanel
                  t={t}
                  exportLang={exportLang} setExportLang={setExportLang}
                  pillEs={pillEs} setPillEs={setPillEs} pillEn={pillEn} setPillEn={setPillEn}
                  titleEs={titleEs} setTitleEs={setTitleEs} titleEn={titleEn} setTitleEn={setTitleEn}
                  bodyEs={bodyEs} setBodyEs={setBodyEs} bodyEn={bodyEn} setBodyEn={setBodyEn}
                  ctaEs={ctaEs} setCtaEs={setCtaEs} ctaEn={ctaEn} setCtaEn={setCtaEn}
                />
              )}
              {tool === "shadow" && (
                <div className="space-y-3">
                  <Slider label={t("Intensidad", "Strength")} value={shadowOpacity} min={0} max={1} step={0.01} onChange={setShadowOpacity} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label={t("Suavidad",   "Blur")}     value={shadowBlur}    min={0} max={300} step={5}    onChange={setShadowBlur}    format={(v) => `${v}px`} />
                  <Slider label={t("Tamaño",     "Spread")}   value={shadowSpread}  min={0} max={120} step={2}    onChange={setShadowSpread}  format={(v) => `${v}px`} />
                </div>
              )}
              {tool === "bg" && mode === "story" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{t("Color", "Color")}</span>
                    <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                      className="h-9 w-12 rounded-lg cursor-pointer"
                      style={{ background: "transparent", border: "1px solid var(--divider)" }} />
                  </div>
                  <Slider label={t("Opacidad fondo", "BG opacity")} value={bgOpacity} min={0} max={1} step={0.01} onChange={setBgOpacity} format={(v) => `${Math.round(v * 100)}%`} />
                  <Slider label={t("Desenfoque",     "Blur")}       value={bgBlur}    min={0} max={60} step={1}   onChange={setBgBlur}    format={(v) => `${v}px`} />
                  <Slider label={t("Capa oscura",    "Dark overlay")} value={overlay}  min={0} max={1} step={0.01} onChange={setOverlay}   format={(v) => `${Math.round(v * 100)}%`} />
                </div>
              )}
              {tool === "bg" && mode !== "story" && (
                <p className="text-[12px] text-center py-3" style={{ color: "var(--text-tertiary)" }}>
                  {t("Cambia a “Historia” para ajustar el fondo.", "Switch to “Story” to adjust the background.")}
                </p>
              )}
              {tool === "image" && mode === "story" && (
                <div className="space-y-3">
                  {!bgImage ? (
                    <label
                      className="flex items-center justify-center gap-2 w-full px-3 py-3 rounded-lg text-[12px] font-semibold cursor-pointer"
                      style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px dashed var(--divider)" }}
                    >
                      <ImageIcon size={14} />
                      {t("Subir imagen", "Upload image")}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickBgImage(f); }} />
                    </label>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setBgFit(bgFit === "cover" ? "contain" : "cover")}
                          className="flex-1 px-3 py-2 rounded-lg text-[12px] font-semibold"
                          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                        >
                          {bgFit === "cover" ? t("Llenar pantalla", "Fill screen") : t("Mostrar todo", "Show full image")}
                        </button>
                        <button
                          onClick={() => setBgImage(null)}
                          className="px-3 py-2 rounded-lg"
                          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                          aria-label="remove image"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <Slider label={t("Tamaño imagen", "Image size")} value={bgScale} min={0.5} max={3} step={0.05} onChange={setBgScale} format={(v) => `${Math.round(v * 100)}%`} />
                      <Slider label={t("Mover ↔",       "Move ↔")}     value={bgX}     min={-50} max={50} step={1}   onChange={setBgX}     format={(v) => `${v}%`} />
                      <Slider label={t("Mover ↕",       "Move ↕")}     value={bgY}     min={-50} max={50} step={1}   onChange={setBgY}     format={(v) => `${v}%`} />
                    </>
                  )}
                </div>
              )}
              {tool === "image" && mode !== "story" && (
                <p className="text-[12px] text-center py-3" style={{ color: "var(--text-tertiary)" }}>
                  {t("Sólo disponible en modo “Historia”.", "Only available in “Story” mode.")}
                </p>
              )}
              {tool === "lang" && (
                <div className="flex items-center justify-center gap-2 py-2">
                  {(["es", "en"] as const).map((l) => {
                    const active = exportLang === l;
                    return (
                      <button
                        key={l}
                        onClick={() => setExportLang(l)}
                        className="px-5 py-2 rounded-full text-[12px] font-bold uppercase transition-all"
                        style={{
                          background: active ? "hsl(var(--foreground))" : "var(--bg-surface-2)",
                          color:      active ? "hsl(var(--background))" : "var(--text-primary)",
                          border: "1px solid var(--divider)",
                        }}
                      >
                        {l === "es" ? "Español" : "English"}
                      </button>
                    );
                  })}
                </div>
              )}
            </ToolPanel>
          )}

          {/* Bottom toolbar (Canva-style icon row) */}
          <div
            className="shrink-0 flex items-stretch justify-around gap-1 px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))]"
            style={{ borderTop: "1px solid var(--divider)", background: "var(--bg-surface)" }}
          >
            <ToolButton icon={mode === "card" ? Layers : Instagram}
              label={mode === "card" ? t("Tarjeta", "Card") : t("Historia", "Story")}
              onClick={() => setMode(mode === "card" ? "story" : "card")} />
            <ToolButton icon={Type}      label={t("Texto",  "Text")}    active={tool === "text"}   onClick={() => setTool(tool === "text"   ? null : "text")} />
            <ToolButton icon={Sun}       label={t("Sombra", "Shadow")}  active={tool === "shadow"} onClick={() => setTool(tool === "shadow" ? null : "shadow")} />
            <ToolButton icon={Palette}   label={t("Fondo",  "BG")}      active={tool === "bg"}     onClick={() => setTool(tool === "bg"     ? null : "bg")}     disabled={mode !== "story"} />
            <ToolButton icon={ImageIcon} label={t("Imagen", "Image")}   active={tool === "image"}  onClick={() => setTool(tool === "image"  ? null : "image")}  disabled={mode !== "story"} />
            <ToolButton icon={Languages} label={exportLang.toUpperCase()} active={tool === "lang"} onClick={() => setTool(tool === "lang"   ? null : "lang")} />
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Canva-style bottom UI: icon toolbar + collapsible tool panel.
   ───────────────────────────────────────────────────────────────────── */
function ToolButton({ icon: Icon, label, onClick, active, disabled }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-xl transition-colors disabled:opacity-30"
      style={{
        background: active ? "var(--bg-surface-2)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
      }}
    >
      <Icon size={20} />
      <span className="text-[10px] font-semibold leading-none truncate max-w-full">{label}</span>
    </button>
  );
}

function ToolPanel({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div
      className="shrink-0 px-4 pt-3 pb-3 max-h-[45vh] overflow-y-auto"
      style={{
        borderTop: "1px solid var(--divider)",
        background: "var(--bg-surface)",
        boxShadow: "0 -8px 24px -12px rgba(0,0,0,0.35)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {title}
        </p>
        <button
          onClick={onClose}
          className="p-1 rounded-md"
          style={{ color: "var(--text-secondary)" }}
          aria-label="close panel"
        >
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  );
}

interface TextPanelProps {
  t: (es: string, en: string) => string;
  exportLang: Lang; setExportLang: (l: Lang) => void;
  pillEs: string; setPillEs: (v: string) => void; pillEn: string; setPillEn: (v: string) => void;
  titleEs: string; setTitleEs: (v: string) => void; titleEn: string; setTitleEn: (v: string) => void;
  bodyEs: string; setBodyEs: (v: string) => void; bodyEn: string; setBodyEn: (v: string) => void;
  ctaEs: string; setCtaEs: (v: string) => void; ctaEn: string; setCtaEn: (v: string) => void;
}
function TextPanel(p: TextPanelProps) {
  const { t } = p;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end mb-1">
        <div
          className="inline-flex rounded-full p-0.5"
          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}
        >
          {(["es", "en"] as const).map((l) => {
            const active = p.exportLang === l;
            return (
              <button
                key={l}
                onClick={() => p.setExportLang(l)}
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase transition-all"
                style={{
                  background: active ? "hsl(var(--foreground))" : "transparent",
                  color:      active ? "hsl(var(--background))" : "var(--text-secondary)",
                }}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>
      {p.exportLang === "es" ? (
        <>
          <StudioInput value={p.pillEs}  onChange={p.setPillEs}  placeholder={t("Pill (opcional)", "Pill (optional)")} />
          <StudioInput value={p.titleEs} onChange={p.setTitleEs} placeholder={t("Título", "Title")} bold />
          <StudioTextarea value={p.bodyEs} onChange={p.setBodyEs} placeholder={t("Cuerpo del mensaje", "Message body")} />
          <StudioInput value={p.ctaEs}   onChange={p.setCtaEs}   placeholder={t("Botón (opcional)", "Button (optional)")} />
        </>
      ) : (
        <>
          <StudioInput value={p.pillEn}  onChange={p.setPillEn}  placeholder="Pill (optional)" />
          <StudioInput value={p.titleEn} onChange={p.setTitleEn} placeholder="Title" bold />
          <StudioTextarea value={p.bodyEn} onChange={p.setBodyEn} placeholder="Message body" />
          <StudioInput value={p.ctaEn}   onChange={p.setCtaEn}   placeholder="Button (optional)" />
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   ExportFooter — page 2: language, back, big download
   ───────────────────────────────────────────────────────────────────── */
function ExportFooter({
  mode, exportLang, setExportLang, onBack, onExport, exporting,
  autoFileName, customFileName, setCustomFileName,
  showFileNameField, setShowFileNameField, t,
}: {
  mode: Mode; exportLang: Lang; setExportLang: (l: Lang) => void;
  onBack: () => void; onExport: () => void; exporting: boolean;
  autoFileName: string;
  customFileName: string;
  setCustomFileName: (v: string) => void;
  showFileNameField: boolean;
  setShowFileNameField: (v: boolean) => void;
  t: (es: string, en: string) => string;
}) {
  const previewName = (customFileName.trim() || autoFileName) + `-${mode}.png`;
  return (
    <div
      className="shrink-0 px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] space-y-3"
      style={{ borderTop: "1px solid var(--divider)", background: "var(--bg-surface)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {mode === "card" ? t("PNG transparente · 9:16", "Transparent PNG · 9:16") : t("Historia · 9:16", "Story · 9:16")}
        </p>
        <div
          className="inline-flex rounded-full p-0.5"
          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}
        >
          {(["es", "en"] as const).map((l) => {
            const active = exportLang === l;
            return (
              <button
                key={l}
                onClick={() => setExportLang(l)}
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase transition-all"
                style={{
                  background: active ? "hsl(var(--foreground))" : "transparent",
                  color:      active ? "hsl(var(--background))" : "var(--text-secondary)",
                }}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        {t(
          "Se descarga en alta resolución (2160 × 3840 px), perfecta para Instagram Stories.",
          "Downloads in high resolution (2160 × 3840 px), perfect for Instagram Stories.",
        )}
      </p>

      {/* SEO filename: shows the auto-generated name + optional override */}
      <div
        className="rounded-xl px-3 py-2"
        style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}
      >
        <button
          type="button"
          onClick={() => setShowFileNameField(!showFileNameField)}
          className="w-full flex items-center gap-2 text-left"
        >
          <Tag size={12} style={{ color: "var(--text-tertiary)" }} className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {t("Nombre del archivo", "File name")}
            </p>
            <p className="text-[11px] font-mono truncate" style={{ color: "var(--text-secondary)" }}>
              {previewName}
            </p>
          </div>
          <ChevronDown
            size={14}
            style={{
              color: "var(--text-tertiary)",
              transform: showFileNameField ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}
          />
        </button>
        {showFileNameField && (
          <div className="mt-2 space-y-1">
            <input
              type="text"
              value={customFileName}
              onChange={(e) => setCustomFileName(e.target.value)}
              placeholder={autoFileName}
              className="w-full px-3 py-2 rounded-lg text-[12px] font-mono outline-none"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--divider)",
                color: "var(--text-primary)",
              }}
            />
            <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
              {t(
                "Solo letras, números y guiones. Mejora el SEO en Google Imágenes.",
                "Letters, numbers and dashes only. Boosts SEO on Google Images.",
              )}
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-full text-[13px] font-semibold"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
        >
          <ArrowLeft size={14} />
          {t("Editar", "Edit")}
        </button>
        <button
          onClick={onExport}
          disabled={exporting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-full text-[13px] font-bold disabled:opacity-60"
          style={{ background: "hsl(var(--foreground))", color: "hsl(var(--background))" }}
        >
          {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {t("Descargar PNG", "Download PNG")}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Tiny UI helpers
   ───────────────────────────────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (n: number) => void; format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[hsl(var(--foreground))]"
      />
    </div>
  );
}

function StudioInput({ value, onChange, placeholder, bold }: {
  value: string; onChange: (v: string) => void; placeholder?: string; bold?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg text-[13px] outline-none"
      style={{
        background: "var(--bg-surface-2)",
        color: "var(--text-primary)",
        border: "1px solid var(--divider)",
        fontWeight: bold ? 700 : 400,
      }}
    />
  );
}

function StudioTextarea({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="w-full px-3 py-2 rounded-lg text-[13px] outline-none resize-none"
      style={{
        background: "var(--bg-surface-2)",
        color: "var(--text-primary)",
        border: "1px solid var(--divider)",
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────
   AssetCanvas — captured DOM. Card visuals stay locked (white card,
   black CTA). Background layer changes by mode.
   ───────────────────────────────────────────────────────────────────── */
interface CanvasProps {
  exportLang: Lang;
  mode: Mode;
  payload: { pill: string | null; title: string; body: string; ctaLabel: string | null; imageUrl: string | null; };
  heroLoading?: boolean;
  shadow: { opacity: number; blur: number; spread: number };
  bg: { color: string; opacity: number; blur: number; image: string | null; fit: ImageFit; scale: number; x: number; y: number; overlay: number };
}

const AssetCanvas = forwardRef<HTMLDivElement, CanvasProps>(function AssetCanvas(
  { exportLang, mode, payload, heroLoading, shadow, bg }, ref,
) {
  const width  = CANVAS_W;
  const height = CANVAS_H;

  // Locked card palette (matches BroadcastModal popup)
  const CARD_BG  = "#ffffff";
  const TITLE_FG = "#0b0b0c";
  const BODY_FG  = "#6b7280";
  const PILL_BG  = "#eef0f3";
  const PILL_FG  = "#1f1f22";
  const CTA_BG   = "#0b0b0c";
  const CTA_FG   = "#ffffff";

  // Card sizing — same proportions as before, tuned for 1080×1920
  const baseUnit   = Math.min(width, height);
  const cardWidth  = Math.min(width * 0.86, baseUnit * 0.88);
  const cardRadius = cardWidth * 0.07;
  const innerPad   = cardWidth * 0.07;
  const heroAspect = 3 / 2;

  const pillSize  = cardWidth * 0.034;
  const titleSize = cardWidth * 0.095;
  const bodySize  = cardWidth * 0.042;
  const ctaSize   = cardWidth * 0.044;

  const gapImageToPill = innerPad * 0.85;
  const gapPillToTitle = innerPad * 0.55;
  const gapTitleToBody = innerPad * 0.45;
  const gapBodyToCta   = innerPad * 0.85;

  // Symmetric box-shadow (no Y offset) — even on all four sides, follows
  // rounded corners cleanly, supports real spread, and is much cheaper to
  // re-render than filter:drop-shadow on a 1080×1920 canvas.
  const cardBoxShadow = useMemo(() => {
    if (shadow.opacity <= 0) return "none";
    return `0 0 ${shadow.blur}px ${shadow.spread}px rgba(0,0,0,${shadow.opacity})`;
  }, [shadow.opacity, shadow.blur, shadow.spread]);

  // Story background layer
  const storyBgStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    background: bg.color,
    opacity: bg.opacity,
  };

  const storyImageWrapStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    filter: bg.blur > 0 ? `blur(${bg.blur}px)` : undefined,
    transform: `translate(${bg.x}%, ${bg.y}%) scale(${bg.scale})`,
    transformOrigin: "center center",
  };

  return (
    <div
      ref={ref}
      style={{
        width,
        height,
        position: "relative",
        background: mode === "card" ? "transparent" : "transparent",
        overflow: "hidden",
        fontFamily: EXPORT_FONT_STACK,
      }}
    >
      {/* Story background layers (skipped entirely in card mode) */}
      {mode === "story" && (
        <>
          <div style={storyBgStyle} />
          {bg.image && (
            <div style={storyImageWrapStyle}>
              <img loading="lazy" decoding="async"
                key={`story-bg-${exportLang}-${bg.image}`}
                alt=""
                crossOrigin="anonymous"
                src={bg.image}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: bg.fit,
                  display: "block",
                }}
              />
            </div>
          )}
          {bg.overlay > 0 && (
            <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${bg.overlay})` }} />
          )}
        </>
      )}

      {/* Centered popup */}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: cardWidth,
            background: CARD_BG,
            borderRadius: cardRadius,
            overflow: "hidden",
            boxShadow: cardBoxShadow,
            padding: innerPad,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {payload.imageUrl && (
            <div
              style={{
                width: "100%",
                aspectRatio: `${heroAspect}`,
                borderRadius: cardRadius * 0.7,
                overflow: "hidden",
                background: "#222",
                marginBottom: gapImageToPill,
                position: "relative",
              }}
            >
              {heroLoading ? (
                <div
                  className="hero-skeleton-pulse"
                  style={{
                    width: "100%",
                    height: "100%",
                    background:
                      "linear-gradient(90deg, #1f1f22 0%, #2a2a2e 50%, #1f1f22 100%)",
                    backgroundSize: "200% 100%",
                  }}
                />
              ) : (
                <img loading="lazy" decoding="async"
                  key={`hero-${exportLang}-${payload.imageUrl}`}
                  alt=""
                  src={payload.imageUrl}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              )}
            </div>
          )}

          {payload.pill && (
            <div style={{ marginBottom: gapPillToTitle }}>
              <span
                style={{
                  display: "inline-block",
                  padding: `${pillSize * 0.55}px ${pillSize * 1.1}px`,
                  borderRadius: 999,
                  background: PILL_BG,
                  color: PILL_FG,
                  fontSize: pillSize,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                }}
              >
                {payload.pill}
              </span>
            </div>
          )}

          <h2
            style={{
              fontSize: titleSize,
              lineHeight: 1.05,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              color: TITLE_FG,
              margin: 0,
              marginBottom: gapTitleToBody,
              textAlign: "center",
              maxWidth: "100%",
              wordBreak: "break-word",
            }}
          >
            {payload.title}
          </h2>

          <p
            style={{
              fontSize: bodySize,
              lineHeight: 1.4,
              color: BODY_FG,
              margin: 0,
              marginBottom: payload.ctaLabel ? gapBodyToCta : 0,
              textAlign: "center",
              maxWidth: "92%",
            }}
          >
            {payload.body}
          </p>

          {payload.ctaLabel && (
            <span
              style={{
                display: "inline-block",
                padding: `${ctaSize * 0.95}px ${ctaSize * 2.4}px`,
                borderRadius: cardRadius * 0.55,
                background: CTA_BG,
                color: CTA_FG,
                fontSize: ctaSize,
                fontWeight: 700,
                letterSpacing: 0.2,
              }}
            >
              {payload.ctaLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
