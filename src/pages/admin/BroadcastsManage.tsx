/**
 * Admin → Manage broadcasts. Lists drafts + sent with edit/delete/asset actions.
 * Mirrors the pattern used by the Headlines posts list.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, FileText, CheckCircle2, Clock, Trash2, Image as ImageIcon, Eye, Send } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import { BroadcastAssetStudio, type BroadcastAssetPayload } from "@/components/notifications/BroadcastAssetStudio";

type Status = "draft" | "sending" | "sent" | "failed";

interface Row {
  id: string;
  pill_es: string | null; pill_en: string | null;
  title_es: string; title_en: string;
  body_es: string; body_en: string;
  cta_label_es: string | null; cta_label_en: string | null;
  hero_image_url: string | null;
  status: Status;
  audience_count: number; delivered_count: number; failed_count: number;
  sent_at: string | null;
  updated_at: string;
  opened_count?: number;
}

type FilterTab = "all" | "draft" | "sent";

export default function BroadcastsManage() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const initialFilter = (() => {
    const f = searchParams.get("filter");
    return f === "draft" || f === "sent" || f === "all" ? (f as FilterTab) : "all";
  })();
  const [filter, setFilter] = useState<FilterTab>(initialFilter);
  const [search, setSearch] = useState("");
  const [studioFor, setStudioFor] = useState<Row | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: broadcasts } = await supabase
      .from("broadcasts")
      .select("id,pill_es,pill_en,title_es,title_en,body_es,body_en,cta_label_es,cta_label_en,hero_image_url,status,audience_count,delivered_count,failed_count,sent_at,updated_at")
      .neq("status", "test")
      .order("updated_at", { ascending: false })
      .limit(100);
    const ids = (broadcasts || []).map((b) => b.id);
    const openedMap = new Map<string, number>();
    if (ids.length > 0) {
      const { data: receipts } = await supabase
        .from("broadcast_receipts")
        .select("broadcast_id, opened_at")
        .in("broadcast_id", ids)
        .not("opened_at", "is", null);
      for (const r of receipts || []) {
        openedMap.set(r.broadcast_id, (openedMap.get(r.broadcast_id) ?? 0) + 1);
      }
    }
    setRows((broadcasts || []).map((b) => ({ ...b, opened_count: openedMap.get(b.id) ?? 0 })) as Row[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter !== "all") list = list.filter((r) => r.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.title_es.toLowerCase().includes(q) || r.title_en.toLowerCase().includes(q));
    }
    return list;
  }, [rows, filter, search]);

  const counts = useMemo(() => ({
    all: rows.length,
    draft: rows.filter((r) => r.status === "draft").length,
    sent: rows.filter((r) => r.status === "sent").length,
  }), [rows]);

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: es ? "Todos" : "All" },
    { id: "draft", label: es ? "Borradores" : "Drafts" },
    { id: "sent", label: es ? "Enviados" : "Sent" },
  ];

  const studioPayload: BroadcastAssetPayload | null = studioFor ? {
    pillEs: studioFor.pill_es, pillEn: studioFor.pill_en,
    titleEs: studioFor.title_es, titleEn: studioFor.title_en,
    bodyEs: studioFor.body_es, bodyEn: studioFor.body_en,
    ctaLabelEs: studioFor.cta_label_es, ctaLabelEn: studioFor.cta_label_en,
    imageUrl: studioFor.hero_image_url,
  } : null;

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Gestionar" : "Manage"}
        subtitle={es ? "Borradores, enviados y métricas." : "Drafts, sent, and metrics."}
        onBack={() => navigate("/admin/broadcasts")}
        actions={
          <button
            onClick={() => navigate("/admin/broadcasts/compose")}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
            style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
          >
            <Plus size={14} className="icon-bold" />
            {es ? "Nuevo" : "New"}
          </button>
        }
      />

      <div className="px-4 pb-6">
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4"
          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}
        >
          <Search size={16} style={{ color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={es ? "Buscar..." : "Search..."}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

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

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse"
                style={{ background: "var(--bg-surface-2)" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
              style={{ background: "var(--bg-surface-2)" }}>
              <FileText size={22} style={{ color: "var(--text-tertiary)" }} />
            </div>
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {es ? "Sin broadcasts aún" : "No broadcasts yet"}
            </p>
            <button
              onClick={() => navigate("/admin/broadcasts/compose")}
              className="mt-4 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold active:scale-95"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
            >
              <Plus size={16} className="icon-bold" />
              {es ? "Crear el primero" : "Create the first one"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => {
              const title = (es ? r.title_es : r.title_en) || r.title_es || r.title_en;
              const isDraft = r.status === "draft";
              const StatusIcon = isDraft ? FileText : r.status === "sent" ? CheckCircle2 : Clock;
              const statusColor = isDraft ? "#94a3b8" : r.status === "sent" ? "#22c55e" : "#fbbf24";
              const statusBg = isDraft ? "rgba(148,163,184,0.15)" : r.status === "sent" ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.15)";
              const statusLabel = isDraft ? (es ? "Borrador" : "Draft") : r.status === "sent" ? (es ? "Enviado" : "Sent") : r.status;
              return (
                <div key={r.id} className="relative w-full rounded-xl card-elevated">
                  <button
                    onClick={() => isDraft
                      ? navigate(`/admin/broadcasts/compose?id=${r.id}`)
                      : navigate(`/admin/broadcasts/compose?id=${r.id}`)}
                    className="w-full text-left p-3.5 active:scale-[0.99] transition-transform"
                  >
                    <div className="flex items-start justify-between gap-3 mb-1.5 pr-16">
                      <h3 className="text-sm font-semibold leading-tight line-clamp-2"
                        style={{ color: "var(--text-primary)" }}>
                        {title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: statusBg, color: statusColor }}>
                        <StatusIcon size={10} className="icon-bold" />
                        {statusLabel}
                      </span>
                      {r.status === "sent" && (
                        <>
                          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                            <Send size={10} /> {r.delivered_count}/{r.audience_count}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                            <Eye size={10} /> {r.opened_count ?? 0}
                          </span>
                        </>
                      )}
                      <span className="text-[10px] ml-auto" style={{ color: "var(--text-tertiary)" }}>
                        {formatDate(r.sent_at || r.updated_at, es)}
                      </span>
                    </div>
                  </button>
                  <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setStudioFor(r); }}
                      className="p-1.5 rounded-lg active:scale-90 transition-transform"
                      style={{ color: "var(--text-secondary)" }}
                      aria-label={es ? "Generar asset" : "Generate asset"}
                    >
                      <ImageIcon size={14} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(es ? `¿Eliminar "${title}"?` : `Delete "${title}"?`)) return;
                        const { error } = await supabase.from("broadcasts").delete().eq("id", r.id);
                        if (error) { toast.error(error.message); return; }
                        setRows((prev) => prev.filter((x) => x.id !== r.id));
                        toast.success(es ? "Eliminado" : "Deleted");
                      }}
                      className="p-1.5 rounded-lg active:scale-90 transition-transform"
                      style={{ color: "#ef4444" }}
                      aria-label={es ? "Eliminar" : "Delete"}
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {studioFor && studioPayload && (
        <BroadcastAssetStudio
          payload={studioPayload}
          slug={((es ? studioFor.title_es : studioFor.title_en) || "broadcast")
            .toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}
          onClose={() => setStudioFor(null)}
        />
      )}
    </div>
  );
}

function formatDate(iso: string, es: boolean): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return es ? "ahora" : "now";
  if (diffMin < 60) return es ? `hace ${diffMin}m` : `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return es ? `hace ${diffH}h` : `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return es ? `hace ${diffD}d` : `${diffD}d ago`;
  return d.toLocaleDateString(es ? "es-PR" : "en-US", { month: "short", day: "numeric" });
}
