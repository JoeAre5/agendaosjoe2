/**
 * Admin → Media library
 *
 * Top-level tabs:
 *   • System (owner-only): identity-aware catalog of every image in the
 *     project — Barber Avatars + Client Avatars (joined to their tables so
 *     replace/delete updates the actual record), Website Assets (links to
 *     section editors), plus raw storage buckets for everything else.
 *   • Shop (owner + barbers): curated marketing folders. Owner manages,
 *     barbers see/download public folders only.
 *
 * Every sub-view uses SubpageHeader for a consistent smart back button.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Images, FolderPlus, Upload, Trash2, Download, Eye, EyeOff,
  Loader2, Database, FolderOpen, Pencil, Check, X, Users, User,
  ChevronRight,
} from "lucide-react";
import { motion } from "motion/react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { StandardToggle } from "@/components/ui/StandardToggle";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import { BarberAvatarsManager } from "@/components/media/BarberAvatarsManager";
import { ClientAvatarsManager } from "@/components/media/ClientAvatarsManager";


type Tab = "system" | "shop";

interface Folder {
  id: string;
  slug: string;
  name_es: string;
  name_en: string;
  description_es: string | null;
  description_en: string | null;
  sort_order: number;
  is_public_to_barbers: boolean;
}

interface Asset {
  id: string;
  folder_id: string;
  storage_path: string;
  title: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sort_order: number;
  created_at: string;
}

/** Raw storage buckets that don't map cleanly to one entity — shown as plain browsers. */
const RAW_BUCKETS: Array<{ id: string; label_es: string; label_en: string }> = [
  { id: "product-images",   label_es: "Productos",        label_en: "Products" },
  { id: "broadcast-images", label_es: "Imágenes de push", label_en: "Broadcast images" },
  { id: "blog-covers",      label_es: "Portadas del blog",label_en: "Blog covers" },
  { id: "author-avatars",   label_es: "Autores del blog", label_en: "Blog authors" },
  { id: "email-assets",     label_es: "Assets de email",  label_en: "Email assets" },
  { id: "brand-assets",     label_es: "Marca",            label_en: "Brand" },
  { id: "barber-gallery",   label_es: "Galerías (raw)",   label_en: "Galleries (raw)" },
];

const BUCKET_LABELS: Record<string, { es: string; en: string }> = {
  "barber-avatars": { es: "Avatares de barberos", en: "Barber avatars" },
  "client-avatars": { es: "Avatares de clientes", en: "Client avatars" },
  ...Object.fromEntries(RAW_BUCKETS.map((b) => [b.id, { es: b.label_es, en: b.label_en }])),
};

export default function Media() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { language } = useTranslation();
  const es = language === "es";
  const isOwner = role === "owner";

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || (isOwner ? "system" : "shop");
  const bucket = searchParams.get("bucket");
  const folderId = searchParams.get("folder");

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setSearchParams(next, { replace: true });
  };

  const goRoot = () => setParam({ view: null, bucket: null, folder: null, section: null });
  const onBackFromSub = () => goRoot();

  // ── Sub-views with their own SubpageHeader ────────────────────────────────

  if (tab === "system" && bucket === "barber-avatars") {
    return (
      <PageShell>
        <SubpageHeader
          sticky
          title={es ? BUCKET_LABELS["barber-avatars"].es : BUCKET_LABELS["barber-avatars"].en}
          onBack={onBackFromSub}
        />
        <div className="px-4">
          <BarberAvatarsManager es={es} readOnly={!isOwner} />
        </div>
      </PageShell>
    );
  }

  if (tab === "system" && bucket === "client-avatars" && isOwner) {
    return (
      <PageShell>
        <SubpageHeader sticky title={BUCKET_LABELS["client-avatars"][es ? "es" : "en"]} onBack={onBackFromSub} />
        <div className="px-4"><ClientAvatarsManager es={es} /></div>
      </PageShell>
    );
  }

  if (tab === "system" && bucket && isOwner) {
    const label = BUCKET_LABELS[bucket]?.[es ? "es" : "en"] || bucket;
    return (
      <PageShell>
        <SubpageHeader sticky title={label} onBack={onBackFromSub} />
        <div className="px-4"><RawBucketBrowser bucket={bucket} /></div>
      </PageShell>
    );
  }

  if (tab === "shop" && folderId) {
    return (
      <ShopFolderRoute folderId={folderId} isOwner={isOwner} es={es} onBack={onBackFromSub} />
    );
  }

  // ── Root: tabs + section list ─────────────────────────────────────────────
  const setTab = (t: Tab) => setParam({ tab: t, view: null, bucket: null, folder: null, section: null });

  return (
    <PageShell>
      <SubpageHeader sticky title="Media" onBack={() => navigate("/admin?tab=menu")} />

      <div className="px-4">
        {isOwner && (
          <div className="flex p-1 rounded-xl mb-4" style={{ background: "var(--bg-surface-2)" }}>
            <TabButton active={tab === "system"} onClick={() => setTab("system")} icon={Database} label={es ? "Sistema" : "System"} />
            <TabButton active={tab === "shop"} onClick={() => setTab("shop")} icon={Images} label="Marketing" />
          </div>
        )}

        {tab === "system" && isOwner
          ? <SystemRoot es={es} onPick={(patch) => setParam(patch)} />
          : <ShopMedia isOwner={isOwner} es={es} />}
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen mx-auto w-full pb-32"
      style={{ maxWidth: 430, background: "var(--bg-base)" }}
    >
      {children}
    </div>
  );
}

function TabButton({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-colors"
      style={{
        background: active ? "var(--bg-base)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
      }}
    >
      <Icon size={13} className="icon-bold" />
      {label}
    </button>
  );
}

/* ─────────────────────────────── System root ─────────────────────────────── */

function SystemRoot({
  es,
  onPick,
}: {
  es: boolean;
  onPick: (patch: Record<string, string | null>) => void;
}) {
  const rows: Array<{
    key: string;
    title_es: string;
    title_en: string;
    subtitle_es: string;
    subtitle_en: string;
    icon: any;
    patch: Record<string, string | null>;
  }> = [
    {
      key: "barber-avatars",
      title_es: "Avatares de barberos",
      title_en: "Barber avatars",
      subtitle_es: "Vinculados a cada barbero",
      subtitle_en: "Linked to each barber",
      icon: Users,
      patch: { bucket: "barber-avatars", view: null, folder: null },
    },
    {
      key: "client-avatars",
      title_es: "Avatares de clientes",
      title_en: "Client avatars",
      subtitle_es: "Vinculados al perfil del cliente",
      subtitle_en: "Linked to client profile",
      icon: User,
      patch: { bucket: "client-avatars", view: null, folder: null },
    },
  ];

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <button
            key={r.key}
            onClick={() => onPick(r.patch)}
            className="w-full flex items-center gap-3 px-4 py-4 rounded-xl card-elevated text-left"
          >
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--bg-surface-2)" }}>
              <Icon size={16} style={{ color: "var(--accent-color)" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {es ? r.title_es : r.title_en}
              </div>
              <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                {es ? r.subtitle_es : r.subtitle_en}
              </div>
            </div>
            <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
          </button>
        );
      })}

      <div className="text-[11px] font-bold uppercase tracking-wider px-1 pt-4 pb-1" style={{ color: "var(--text-tertiary)" }}>
        {es ? "Otros buckets" : "Other buckets"}
      </div>

      {RAW_BUCKETS.map((b) => (
        <button
          key={b.id}
          onClick={() => onPick({ bucket: b.id, view: null, folder: null })}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl card-elevated text-left"
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--bg-surface-2)" }}>
            <Database size={15} style={{ color: "var(--text-tertiary)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
              {es ? b.label_es : b.label_en}
            </div>
            <div className="text-[10px] truncate" style={{ color: "var(--text-tertiary)" }}>
              {b.id}
            </div>
          </div>
          <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Raw bucket browser ─────────────────────────────── */

function RawBucketBrowser({ bucket }: { bucket: string }) {
  const [items, setItems] = useState<Array<{ name: string; url: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: files, error } = await supabase.storage.from(bucket).list("", {
        limit: 500,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const all: Array<{ name: string }> = [];
      for (const f of files || []) {
        if (f.id === null) {
          const { data: nested } = await supabase.storage.from(bucket).list(f.name, { limit: 200 });
          for (const n of nested || []) if (n.id !== null) all.push({ name: `${f.name}/${n.name}` });
        } else {
          all.push({ name: f.name });
        }
      }
      const withUrls = await Promise.all(
        all.slice(0, 200).map(async (f) => {
          const { data } = await supabase.storage.from(bucket).createSignedUrl(f.name, 600);
          return { name: f.name, url: data?.signedUrl || "" };
        })
      );
      if (!cancelled) {
        setItems(withUrls.filter((x) => x.url));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bucket]);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>;
  }
  if (items.length === 0) {
    return <div className="text-center text-xs py-8" style={{ color: "var(--text-tertiary)" }}>Empty</div>;
  }
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((f) => <ThumbCard key={f.name} url={f.url} name={f.name} />)}
    </div>
  );
}

function ThumbCard({ url, name, onDownload, onDelete }: { url: string; name: string; onDownload?: () => void; onDelete?: () => void }) {
  const isImg = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)$/i.test(name);
  return (
    <div className="relative rounded-lg overflow-hidden aspect-square group" style={{ background: "var(--bg-surface-2)" }}>
      {isImg ? (
        <img src={url} alt={name} loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-center px-2" style={{ color: "var(--text-tertiary)" }}>
          {name.split("/").pop()}
        </div>
      )}
      {(onDownload || onDelete) && (
        <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 p-1 opacity-0 group-hover:opacity-100 active:opacity-100 transition-opacity" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
          {onDownload && (
            <button onClick={onDownload} className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", color: "white" }}>
              <Download size={13} />
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "rgba(239,68,68,0.85)", color: "white" }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Shop folder route wrapper ─────────────────────────────── */

function ShopFolderRoute({
  folderId, isOwner, es, onBack,
}: { folderId: string; isOwner: boolean; es: boolean; onBack: () => void }) {
  const [folder, setFolder] = useState<Folder | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("shop_media_folders")
      .select("*")
      .eq("id", folderId)
      .maybeSingle();
    if (error) toast.error(error.message);
    setFolder((data as Folder) || null);
    setLoading(false);
  }, [folderId]);

  useEffect(() => { load(); }, [load]);

  return (
    <PageShell>
      <SubpageHeader
        sticky
        title={folder ? (es ? folder.name_es : folder.name_en) : "…"}
        onBack={onBack}
      />
      <div className="px-4">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>
        ) : folder ? (
          <FolderBody folder={folder} isOwner={isOwner} es={es} onFolderUpdated={load} onDeleted={onBack} />
        ) : (
          <div className="text-center text-xs py-10" style={{ color: "var(--text-tertiary)" }}>
            {es ? "Carpeta no encontrada" : "Folder not found"}
          </div>
        )}
      </div>
    </PageShell>
  );
}

/* ─────────────────────────────── Shop media (folders list + management) ─────────────────────────────── */

function ShopMedia({ isOwner, es }: { isOwner: boolean; es: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFolders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shop_media_folders")
      .select("*")
      .order("sort_order");
    if (error) toast.error(error.message);
    setFolders((data as Folder[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadFolders(); }, [loadFolders]);

  const open = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("folder", id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div>
      {isOwner && <OwnerFolderTools folders={folders} onChanged={loadFolders} es={es} />}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>
      ) : folders.length === 0 ? (
        <div className="text-center text-xs py-8" style={{ color: "var(--text-tertiary)" }}>
          {es ? "No hay carpetas todavía." : "No folders yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {folders.map((f, i) => (
            <motion.button
              key={f.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => open(f.id)}
              className="w-full flex items-center justify-between px-4 py-4 rounded-xl card-elevated text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--bg-surface-2)" }}>
                  <FolderOpen size={16} style={{ color: "var(--accent-color)" }} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {es ? f.name_es : f.name_en}
                  </div>
                  {(es ? f.description_es : f.description_en) && (
                    <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                      {es ? f.description_es : f.description_en}
                    </div>
                  )}
                </div>
              </div>
              {isOwner && (
                <span title={f.is_public_to_barbers ? (es ? "Visible para barberos" : "Visible to barbers") : (es ? "Privada (solo owner)" : "Private (owner only)")}>
                  {f.is_public_to_barbers
                    ? <Eye size={14} style={{ color: "var(--text-tertiary)" }} />
                    : <EyeOff size={14} style={{ color: "var(--text-tertiary)" }} />}
                </span>
              )}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}

function OwnerFolderTools({ folders, onChanged, es }: { folders: Folder[]; onChanged: () => void; es: boolean }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const slugify = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-");

  const addFolder = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const slug = slugify(name);
    const max = folders.reduce((m, f) => Math.max(m, f.sort_order), 0);
    const { error } = await supabase.from("shop_media_folders").insert({
      slug, name_es: name.trim(), name_en: name.trim(), sort_order: max + 10, is_public_to_barbers: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setName("");
    setAdding(false);
    onChanged();
  };

  return (
    <div className="mb-3">
      {adding ? (
        <div className="flex items-center gap-2 p-2 rounded-xl" style={{ background: "var(--bg-surface-2)" }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={es ? "Nombre de la carpeta" : "Folder name"}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
            autoFocus
          />
          <button onClick={addFolder} disabled={busy || !name.trim()} className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50" style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          </button>
          <button onClick={() => { setAdding(false); setName(""); }} className="px-2 py-2 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold border-dashed"
          style={{ border: "1.5px dashed var(--divider)", color: "var(--text-secondary)" }}
        >
          <FolderPlus size={13} /> {es ? "Nueva carpeta" : "New folder"}
        </button>
      )}
    </div>
  );
}

function FolderBody({
  folder, isOwner, es, onFolderUpdated, onDeleted,
}: { folder: Folder; isOwner: boolean; es: boolean; onFolderUpdated: () => void; onDeleted: () => void }) {
  const [assets, setAssets] = useState<Array<Asset & { url: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(es ? folder.name_es : folder.name_en);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shop_media_assets")
      .select("*")
      .eq("folder_id", folder.id)
      .order("sort_order")
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const rows = (data as Asset[]) || [];
    const paths = rows.map((a) => a.storage_path);
    const urlMap = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from("shop-media").createSignedUrls(paths, 3600);
      (signed || []).forEach((s, i) => { if (s.signedUrl) urlMap.set(paths[i], s.signedUrl); });
    }
    setAssets(rows.map((r) => ({ ...r, url: urlMap.get(r.storage_path) || "" })));
    setLoading(false);
  }, [folder.id]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const max = assets.reduce((m, a) => Math.max(m, a.sort_order), 0);
      let order = max + 10;
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${folder.slug}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("shop-media").upload(path, file, {
          cacheControl: "3600", contentType: file.type, upsert: false,
        });
        if (upErr) { toast.error(upErr.message); continue; }
        const { error: insErr } = await supabase.from("shop_media_assets").insert({
          folder_id: folder.id,
          storage_path: path,
          title: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          sort_order: order,
        });
        if (insErr) {
          await supabase.storage.from("shop-media").remove([path]);
          toast.error(insErr.message);
          continue;
        }
        order += 10;
      }
      await load();
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (asset: Asset) => {
    if (!confirm(es ? "¿Borrar este archivo?" : "Delete this file?")) return;
    const { error } = await supabase.from("shop_media_assets").delete().eq("id", asset.id);
    if (error) { toast.error(error.message); return; }
    await supabase.storage.from("shop-media").remove([asset.storage_path]);
    setAssets((a) => a.filter((x) => x.id !== asset.id));
  };

  const handleDownload = async (asset: Asset & { url: string }) => {
    const { data, error } = await supabase.storage
      .from("shop-media")
      .createSignedUrl(asset.storage_path, 120, { download: asset.title || asset.storage_path.split("/").pop() || "asset" });
    if (error || !data?.signedUrl) { toast.error(error?.message || "Download failed"); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const togglePublic = async () => {
    const { error } = await supabase
      .from("shop_media_folders")
      .update({ is_public_to_barbers: !folder.is_public_to_barbers })
      .eq("id", folder.id);
    if (error) { toast.error(error.message); return; }
    onFolderUpdated();
  };

  const renameFolder = async () => {
    if (!draftName.trim()) return;
    const patch: any = es ? { name_es: draftName.trim() } : { name_en: draftName.trim() };
    const { error } = await supabase.from("shop_media_folders").update(patch).eq("id", folder.id);
    if (error) { toast.error(error.message); return; }
    setEditingName(false);
    onFolderUpdated();
  };

  const deleteFolder = async () => {
    if (assets.length > 0) {
      if (!confirm(es ? `Esta carpeta tiene ${assets.length} archivo(s). ¿Borrar todo?` : `This folder has ${assets.length} file(s). Delete everything?`)) return;
      await supabase.storage.from("shop-media").remove(assets.map((a) => a.storage_path));
    } else if (!confirm(es ? "¿Borrar carpeta?" : "Delete folder?")) return;
    const { error } = await supabase.from("shop_media_folders").delete().eq("id", folder.id);
    if (error) { toast.error(error.message); return; }
    onDeleted();
    onFolderUpdated();
  };

  return (
    <div>
      <div className="mb-4">
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg text-base font-bold outline-none"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
              autoFocus
            />
            <button onClick={renameFolder} className="p-2 rounded-lg" style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}><Check size={14} /></button>
            <button onClick={() => { setEditingName(false); setDraftName(es ? folder.name_es : folder.name_en); }} className="p-2" style={{ color: "var(--text-tertiary)" }}><X size={14} /></button>
          </div>
        ) : isOwner ? (
          <div className="flex items-center justify-end">
            <button onClick={() => setEditingName(true)} className="text-[11px] font-bold flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
              <Pencil size={11} /> {es ? "Renombrar" : "Rename"}
            </button>
          </div>
        ) : null}

        {isOwner && (
          <div className="flex items-center justify-between mt-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--bg-surface-2)" }}>
            <div className="flex items-center gap-2">
              {folder.is_public_to_barbers
                ? <Eye size={14} style={{ color: "var(--accent-color)" }} />
                : <EyeOff size={14} style={{ color: "var(--text-tertiary)" }} />}
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                {es ? "Visible para barberos" : "Visible to barbers"}
              </span>
            </div>
            <StandardToggle checked={folder.is_public_to_barbers} onChange={togglePublic} />
          </div>
        )}
      </div>

      {isOwner && (
        <div className="flex gap-2 mb-3">
          <label className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold cursor-pointer" style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} className="icon-bold" />}
            {es ? "Subir" : "Upload"}
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => { handleUpload(e.target.files); e.currentTarget.value = ""; }}
            />
          </label>
          <button
            onClick={deleteFolder}
            className="px-3 py-2.5 rounded-xl text-xs font-bold"
            style={{ background: "var(--bg-surface-2)", color: "#ef4444" }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>
      ) : assets.length === 0 ? (
        <div className="text-center text-xs py-10" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Vacío. Sube tus primeros assets." : "Empty. Upload your first assets."}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {assets.map((a) => (
            <ThumbCard
              key={a.id}
              url={a.url}
              name={a.title || a.storage_path}
              onDownload={() => handleDownload(a)}
              onDelete={isOwner ? () => handleDelete(a) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
