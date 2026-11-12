import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { optimizeToWebP } from "@/lib/imageOptimize";
import { toast } from "sonner";

/**
 * Gallery editor for either:
 *   /admin/galleries/home               → shop_settings.home_grid_photos
 *   /admin/galleries/barber/:id         → barbers.ig_photos
 *
 * Photos are stored as an ordered text[] of public URLs. Tiles can be
 * reordered with ←/→, removed with X, and new photos are auto-converted
 * to WebP (max 1080px, q 0.82) before upload.
 */
export default function GalleryEditor() {
  const navigate = useNavigate();
  const params = useParams();
  const { language } = useTranslation();
  const t = (es: string, en: string) => (language === "es" ? es : en);

  const isHome = !params.id; // route /admin/galleries/home has no :id
  const barberId = params.id || null;

  const [title, setTitle] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);

  // Load
  useEffect(() => {
    (async () => {
      if (isHome) {
        const { data } = await supabase
          .from("shop_settings")
          .select("home_grid_photos")
          .limit(1)
          .maybeSingle();
        setTitle(t("Página de inicio", "Homepage"));
        setPhotos(((data as any)?.home_grid_photos) || []);
      } else if (barberId) {
        const { data } = await supabase
          .from("barbers")
          .select("name,ig_photos")
          .eq("id", barberId)
          .maybeSingle();
        setTitle((data as any)?.name || "");
        setPhotos(((data as any)?.ig_photos) || []);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barberId, isHome]);

  const persist = useCallback(
    async (next: string[]) => {
      setSaving(true);
      try {
        if (isHome) {
          const { data: ss } = await supabase
            .from("shop_settings")
            .select("id")
            .limit(1)
            .maybeSingle();
          if ((ss as any)?.id) {
            await supabase
              .from("shop_settings")
              .update({ home_grid_photos: next } as any)
              .eq("id", (ss as any).id);
          }
        } else if (barberId) {
          await supabase
            .from("barbers")
            .update({ ig_photos: next } as any)
            .eq("id", barberId);
        }
      } catch (e: any) {
        toast.error(e.message || "Save failed");
      } finally {
        setSaving(false);
      }
    },
    [isHome, barberId]
  );

  const update = (next: string[]) => {
    setPhotos(next);
    void persist(next);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[idx], next[j]] = [next[j], next[idx]];
    update(next);
  };

  const remove = (idx: number) => {
    const next = photos.filter((_, i) => i !== idx);
    update(next);
  };

  const upload = async (file: File) => {
    setUploadingIdx(photos.length);
    try {
      const blob = await optimizeToWebP(file, { maxWidth: 1080, quality: 0.82 });
      const folder = isHome ? "home" : `barber/${barberId}`;
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
      const { error } = await supabase.storage
        .from("barber-gallery")
        .upload(path, blob, { contentType: "image/webp", upsert: false });
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
    for (const f of Array.from(files)) {
      // sequential to keep order predictable
      // eslint-disable-next-line no-await-in-loop
      await upload(f);
    }
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        sticky
        title={title}
        subtitle={`${photos.length} ${t("fotos", "photos")}${saving ? ` · ${t("guardando…", "saving…")}` : ""}`}
        onBack={() => navigate("/admin/galleries")}
      />

      <div className="px-4">
        <p className="text-[11px] mb-3" style={{ color: "var(--text-tertiary)" }}>
          {t(
            "Sube fotos en cualquier orden. Usa ← → para reorganizar. Se convierten automáticamente a WebP.",
            "Upload photos in any order. Use ← → to reorder. Auto-converted to WebP."
          )}
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin" size={20} style={{ color: "var(--text-tertiary)" }} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: Math.max(9, photos.length) }).map((_, idx) => {
              const url = photos[idx];
              if (!url) {
                const isUploading = uploadingIdx === idx;
                return (
                  <label
                    key={`empty-${idx}`}
                    className="aspect-square flex flex-col items-center justify-center cursor-pointer relative"
                    style={{ background: "var(--bg-surface-2)", border: "1px dashed var(--divider)" }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => onFiles(e.target.files)}
                      disabled={isUploading}
                    />
                    {isUploading ? (
                      <Loader2 className="animate-spin" size={18} style={{ color: "var(--text-tertiary)" }} />
                    ) : (
                      <>
                        <Plus size={20} style={{ color: "var(--text-tertiary)" }} />
                        <span className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                          {idx + 1}
                        </span>
                      </>
                    )}
                  </label>
                );
              }
              return (
                <div
                  key={url + idx}
                  className="relative aspect-square overflow-hidden"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  <img src={url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,0.65)" }}
                    aria-label="Remove"
                  >
                    <X size={14} color="#fff" />
                  </button>
                  <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                      style={{ background: "rgba(0,0,0,0.65)" }}
                      aria-label="Move left"
                    >
                      <ChevronLeft size={14} color="#fff" />
                    </button>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}
                    >
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === photos.length - 1}
                      className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30"
                      style={{ background: "rgba(0,0,0,0.65)" }}
                      aria-label="Move right"
                    >
                      <ChevronRight size={14} color="#fff" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
