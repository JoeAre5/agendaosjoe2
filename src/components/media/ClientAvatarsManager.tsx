/**
 * Identity-aware Client Avatars manager (System Media, owner-only).
 *
 * Lists clients that currently have an avatar with a search box to find
 * any client. Replace / delete updates `clients.avatar_url` AND the
 * storage object under `{client_id}/avatar.{ext}` (private bucket).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload, Trash2, User, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveClientAvatarUrl, extractAvatarPath } from "@/lib/clientAvatar";
import { toast } from "sonner";

interface ClientRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

const BUCKET = "client-avatars";

const fullName = (c: { first_name: string | null; last_name: string | null }) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;

export function ClientAvatarsManager({ es }: { es: boolean }) {
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    // Pull clients that have an avatar first (most actionable).
    const { data, error } = await supabase
      .from("clients")
      .select("id,first_name,last_name,phone,avatar_url")
      .not("avatar_url", "is", null)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    const list = (data as ClientRow[]) || [];
    setRows(list);

    // Resolve signed URLs (private bucket).
    const next = new Map<string, string>();
    await Promise.all(
      list.map(async (c) => {
        const u = await resolveClientAvatarUrl(c.avatar_url);
        if (u) next.set(c.id, u);
      })
    );
    setUrlMap(next);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live search anywhere in clients table.
  useEffect(() => {
    const q = search.trim();
    if (!q) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("clients")
        .select("id,first_name,last_name,phone,avatar_url")
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
        .order("first_name")
        .limit(50);
      if (cancelled) return;
      const list = (data as ClientRow[]) || [];
      setRows(list);
      const next = new Map<string, string>();
      await Promise.all(
        list.map(async (c) => {
          if (!c.avatar_url) return;
          const u = await resolveClientAvatarUrl(c.avatar_url);
          if (u) next.set(c.id, u);
        })
      );
      if (!cancelled) setUrlMap(next);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const filteredRows = useMemo(() => rows, [rows]);

  const onPick = (id: string) => inputRefs.current[id]?.click();

  const onUpload = async (client: ClientRow, file: File) => {
    setBusyId(client.id);
    try {
      const oldPath = extractAvatarPath(client.avatar_url);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const newPath = `${client.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
      if (upErr) throw upErr;
      if (oldPath && oldPath !== newPath) {
        await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
      }
      const { error: dbErr } = await supabase
        .from("clients")
        .update({ avatar_url: newPath } as any)
        .eq("id", client.id);
      if (dbErr) throw dbErr;
      const signed = await resolveClientAvatarUrl(newPath);
      setRows((rs) => rs.map((r) => (r.id === client.id ? { ...r, avatar_url: newPath } : r)));
      if (signed) setUrlMap((m) => new Map(m).set(client.id, signed));
      toast.success(es ? "Avatar actualizado" : "Avatar updated");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (client: ClientRow) => {
    const name = fullName(client) || (es ? "cliente" : "client");
    if (!confirm(es
      ? `¿Eliminar avatar de ${name}?`
      : `Delete avatar for ${name}?`)) return;
    setBusyId(client.id);
    try {
      const path = extractAvatarPath(client.avatar_url);
      if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      const { error } = await supabase
        .from("clients")
        .update({ avatar_url: null } as any)
        .eq("id", client.id);
      if (error) throw error;
      setRows((rs) => rs.map((r) => (r.id === client.id ? { ...r, avatar_url: null } : r)));
      setUrlMap((m) => { const n = new Map(m); n.delete(client.id); return n; });
      toast.success(es ? "Avatar eliminado" : "Avatar removed");
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
        style={{ background: "var(--bg-surface-2)" }}
      >
        <Search size={14} style={{ color: "var(--text-tertiary)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={es ? "Buscar cliente por nombre o teléfono" : "Search client by name or phone"}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none"
          style={{ color: "var(--text-primary)" }}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center text-xs py-8" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Sin resultados" : "No results"}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRows.map((c) => {
            const busy = busyId === c.id;
            const url = urlMap.get(c.id);
            return (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl card-elevated">
                <div
                  className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  {url ? (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={18} style={{ color: "var(--text-tertiary)" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {fullName(c) || (es ? "Sin nombre" : "No name")}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                    {c.phone || "—"}
                  </div>
                </div>
                <input
                  ref={(el) => { inputRefs.current[c.id] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.currentTarget.value = "";
                    if (f) onUpload(c, f);
                  }}
                />
                <button
                  onClick={() => onPick(c.id)}
                  disabled={busy}
                  className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-50"
                  style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} className="icon-bold" />}
                </button>
                {c.avatar_url && (
                  <button
                    onClick={() => onDelete(c)}
                    disabled={busy}
                    className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-50"
                    style={{ background: "var(--bg-surface-2)", color: "#ef4444" }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
