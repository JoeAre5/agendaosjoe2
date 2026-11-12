/**
 * Identity-aware Barber Avatars manager (System Media).
 *
 * Joins storage with `public.barbers`. Each row IS a barber:
 *  - Replace avatar → uploads to `barber-avatars/{barber_id}.{ext}` and
 *    updates `barbers.avatar_url` (with cache-bust). Public bucket.
 *  - Delete avatar → removes the storage object AND nulls `avatar_url`.
 *
 * This is the SOURCE of truth for who an avatar belongs to so we never
 * orphan files or misattribute them.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Upload, Trash2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BarberRow {
  id: string;
  name: string;
  avatar_url: string | null;
  is_active: boolean;
}

const BUCKET = "barber-avatars";

export function BarberAvatarsManager({ es, readOnly }: { es: boolean; readOnly?: boolean }) {
  const [rows, setRows] = useState<BarberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("barbers")
      .select("id,name,avatar_url,is_active")
      .order("name");
    if (error) toast.error(error.message);
    setRows((data as BarberRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pathFromUrl = (url: string | null): string | null => {
    if (!url) return null;
    const marker = `/${BUCKET}/`;
    const i = url.indexOf(marker);
    if (i === -1) return null;
    return url.slice(i + marker.length).split("?")[0];
  };

  const onPick = (barberId: string) => {
    const el = inputRefs.current[barberId];
    if (el) el.click();
  };

  const onUpload = async (barber: BarberRow, file: File) => {
    setBusyId(barber.id);
    try {
      // Remove any previous file for this barber to avoid orphans.
      const oldPath = pathFromUrl(barber.avatar_url);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const newPath = `${barber.id}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (upErr) throw upErr;

      // If the previous extension differed, drop the stale file.
      if (oldPath && oldPath !== newPath) {
        await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(newPath);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: dbErr } = await supabase
        .from("barbers")
        .update({ avatar_url: url } as any)
        .eq("id", barber.id);
      if (dbErr) throw dbErr;

      setRows((rs) => rs.map((r) => (r.id === barber.id ? { ...r, avatar_url: url } : r)));
      toast.success(es ? "Avatar actualizado" : "Avatar updated");
    } catch (e: any) {
      toast.error(e.message || (es ? "Falló la subida" : "Upload failed"));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (barber: BarberRow) => {
    if (!confirm(es
      ? `¿Eliminar el avatar de ${barber.name}?`
      : `Delete ${barber.name}'s avatar?`)) return;
    setBusyId(barber.id);
    try {
      const path = pathFromUrl(barber.avatar_url);
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      }
      const { error } = await supabase
        .from("barbers")
        .update({ avatar_url: null } as any)
        .eq("id", barber.id);
      if (error) throw error;
      setRows((rs) => rs.map((r) => (r.id === barber.id ? { ...r, avatar_url: null } : r)));
      toast.success(es ? "Avatar eliminado" : "Avatar removed");
    } catch (e: any) {
      toast.error(e.message || (es ? "No se pudo eliminar" : "Delete failed"));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  if (readOnly) {
    // Barber-facing read-only grid: long-press the image to save.
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {rows.filter((r) => r.avatar_url).map((b) => (
          <div key={b.id} className="rounded-lg overflow-hidden" style={{ background: "var(--bg-surface-2)" }}>
            <div className="aspect-square">
              <img src={b.avatar_url!} alt={b.name} className="w-full h-full object-cover" />
            </div>
            <div className="px-2 py-1.5 text-[11px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
              {b.name}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] mb-2" style={{ color: "var(--text-tertiary)" }}>
        {es
          ? "Cada avatar está vinculado a un barbero. Reemplazar o eliminar actualiza el perfil en toda la app."
          : "Each avatar is linked to a barber. Replace or delete updates the profile across the app."}
      </p>
      {rows.map((b) => {
        const busy = busyId === b.id;
        return (
          <div
            key={b.id}
            className="flex items-center gap-3 p-3 rounded-xl card-elevated"
          >
            <div
              className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center shrink-0"
              style={{ background: "var(--bg-surface-2)" }}
            >
              {b.avatar_url ? (
                <img src={b.avatar_url} alt={b.name} className="w-full h-full object-cover" />
              ) : (
                <User size={22} style={{ color: "var(--text-tertiary)" }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {b.name}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {b.avatar_url
                  ? (es ? "Avatar activo" : "Has avatar")
                  : (es ? "Sin avatar" : "No avatar")}
                {!b.is_active && (es ? " · inactivo" : " · inactive")}
              </div>
            </div>
            <input
              ref={(el) => { inputRefs.current[b.id] = el; }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = "";
                if (f) onUpload(b, f);
              }}
            />
            <button
              onClick={() => onPick(b.id)}
              disabled={busy}
              className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-50"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
              aria-label={es ? "Reemplazar" : "Replace"}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} className="icon-bold" />}
            </button>
            {b.avatar_url && (
              <button
                onClick={() => onDelete(b)}
                disabled={busy}
                className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-50"
                style={{ background: "var(--bg-surface-2)", color: "#ef4444" }}
                aria-label={es ? "Eliminar" : "Delete"}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
