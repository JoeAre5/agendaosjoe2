/**
 * RepliesPane — inbound email replies grouped by gmail_thread_id.
 * Click a card → opens ThreadModal with full thread + Filho reply orb.
 */
import { useMemo, useState } from "react";
import { Mail, Clock, Archive, Trash2, CheckSquare, Square } from "lucide-react";
import { ThreadModal } from "./ThreadModal";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";
import { supabase } from "@/integrations/supabase/client";

export interface ReplyRow {
  id: string;
  first_name: string;
  last_name: string | null;
  from_email: string | null;
  email: string | null;
  subject: string | null;
  message: string | null;
  language: string;
  source: string | null;
  status: "new" | "read" | "archived";
  created_at: string;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
}

interface Thread {
  threadKey: string;
  subject: string;
  participants: string[];
  latest: ReplyRow;
  messages: ReplyRow[];
  hasNew: boolean;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export function RepliesPane({ rows, onChange }: { rows: ReplyRow[]; onChange: () => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => showArchived ? rows : rows.filter(r => r.status !== "archived"),
    [rows, showArchived],
  );

  const threads = useMemo<Thread[]>(() => {
    const groups = new Map<string, ReplyRow[]>();
    for (const r of filtered) {
      const key = r.gmail_thread_id || r.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const out: Thread[] = [];
    groups.forEach((msgs, key) => {
      msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const latest = msgs[msgs.length - 1];
      const participants = Array.from(new Set(msgs.map(m => m.from_email || m.email).filter(Boolean) as string[]));
      out.push({
        threadKey: key,
        subject: msgs.find(m => m.subject)?.subject || "(sin asunto)",
        participants,
        latest,
        messages: msgs,
        hasNew: msgs.some(m => m.status === "new"),
      });
    });
    out.sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime());
    return out;
  }, [filtered]);

  const openThread = threads.find(t => t.threadKey === openKey) || null;

  const toggleOne = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const allSelected = threads.length > 0 && threads.every(t => selected.has(t.threadKey));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(threads.map(t => t.threadKey)));
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  function idsForSelection(): string[] {
    const ids: string[] = [];
    for (const t of threads) if (selected.has(t.threadKey)) ids.push(...t.messages.map(m => m.id));
    return ids;
  }

  async function bulkArchive() {
    const ids = idsForSelection();
    if (!ids.length) return;
    await supabase.from("contact_submissions")
      .update({ status: "archived", archived_at: new Date().toISOString() })
      .in("id", ids);
    exitSelect();
    onChange();
  }
  async function bulkDelete() {
    const ids = idsForSelection();
    if (!ids.length) return;
    if (!window.confirm(`¿Borrar ${selected.size} hilo(s) permanentemente? Esta acción no se puede deshacer.`)) return;
    await supabase.from("contact_submissions").delete().in("id", ids);
    exitSelect();
    onChange();
  }

  return (
    <>
      <div className="flex justify-between items-center mt-4 mb-3">
        <p className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>
          {selectMode
            ? `${selected.size} seleccionado${selected.size === 1 ? "" : "s"}`
            : `${threads.length} ${threads.length === 1 ? "hilo" : "hilos"}`}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowArchived(s => !s)}
            className="text-xs font-medium underline"
            style={{ color: "var(--text-tertiary)" }}
          >
            {showArchived ? "Ocultar archivados" : "Ver archivados"}
          </button>
          <button
            onClick={() => selectMode ? exitSelect() : setSelectMode(true)}
            className={selectMode ? "text-xs font-bold px-2.5 py-1 rounded-md" : "p-0.5 flex items-center justify-center"}
            style={selectMode
              ? { background: "var(--accent-color)", color: "var(--cta-fg)" }
              : { background: "transparent" }}
            aria-label={selectMode ? "Cancelar selección" : "Seleccionar"}
          >
            {selectMode ? "Cancelar" : <Square size={16} className="icon-bold" style={{ color: "var(--text-tertiary)" }} />}
          </button>
        </div>
      </div>

      {selectMode && (
        <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg gap-2" style={{ background: "var(--bg-surface-1)" }}>
          <button onClick={toggleAll} className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            {allSelected ? <CheckSquare size={14} className="icon-bold" /> : <Square size={14} className="icon-bold" />}
            {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={bulkArchive}
              disabled={selected.size === 0}
              className="text-[11px] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-md disabled:opacity-40"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
            >
              <Archive size={12} className="icon-bold" />
              Archivar
            </button>
            <button
              onClick={bulkDelete}
              disabled={selected.size === 0}
              className="text-[11px] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-md disabled:opacity-40"
              style={{ background: "#ef4444", color: "#ffffff" }}
            >
              <Trash2 size={12} className="icon-bold" />
              Borrar ({selected.size})
            </button>
          </div>
        </div>
      )}

      {threads.length === 0 ? (
        <p className="text-sm py-12 text-center" style={{ color: "var(--text-tertiary)" }}>
          No hay respuestas todavía. Cuando un cliente conteste un email enviado desde noreply@charliesbarbershop.co aparecerá aquí.
        </p>
      ) : (
      <div className="space-y-2">
        {threads.map(t => {
          const senderName = [t.latest.first_name, t.latest.last_name].filter(Boolean).join(" ") || (t.latest.from_email ?? "Sin nombre");
          const isSel = selected.has(t.threadKey);
          return (
            <button
              key={t.threadKey}
              onClick={() => selectMode ? toggleOne(t.threadKey) : setOpenKey(t.threadKey)}
              className="w-full text-left rounded-2xl p-4 card-elevated relative"
              style={{
                opacity: t.latest.status === "archived" ? 0.55 : 1,
                outline: isSel ? "2px solid var(--accent-color)" : "none",
              }}
            >
              {selectMode && (
                <div className="absolute top-3 left-3">
                  {isSel ? <CheckSquare size={18} style={{ color: "var(--accent-color)" }} className="icon-bold" /> : <Square size={18} style={{ color: "var(--text-tertiary)" }} className="icon-bold" />}
                </div>
              )}
              {t.hasNew && !selectMode && (
                <span
                  className="absolute top-3 right-3 text-[9px] font-black px-2 py-0.5 rounded-full"
                  style={{ background: "#ef4444", color: "#ffffff" }}
                >
                  NUEVO
                </span>
              )}
              <div className={`flex items-center gap-2 mb-1 ${selectMode ? "pl-6" : ""}`}>
                <Mail size={12} className="icon-bold" style={{ color: "var(--accent-color)" }} />
                <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                  <Clock size={10} />
                  {timeAgo(t.latest.created_at)}
                </span>
                {t.messages.length > 1 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
                    {t.messages.length} mensajes
                  </span>
                )}
              </div>
              <p className="text-sm font-bold mb-0.5" style={{ color: "var(--text-primary)" }}>{senderName}</p>
              <p className="text-[11px] mb-1.5" style={{ color: "var(--text-tertiary)" }}>{t.latest.from_email || t.latest.email}</p>
              <p className="text-xs font-medium mb-1 line-clamp-1" style={{ color: "var(--text-primary)" }}>{t.subject}</p>
              <p className="text-xs line-clamp-2" style={{ color: "var(--text-secondary)" }}>{t.latest.message || ""}</p>
              {!selectMode && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--accent-color)" }}>
                  <AnimatedOrbNavIcon size={14} />
                  Responder con Filho
                </div>
              )}
            </button>
          );
        })}
      </div>
      )}

      {openThread && (
        <ThreadModal
          thread={openThread}
          onClose={() => { setOpenKey(null); onChange(); }}
        />
      )}
    </>
  );
}
