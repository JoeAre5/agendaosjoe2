/**
 * Admin → Bandeja (/admin/bandeja)
 *
 * Owner-only inbox for public form submissions.
 * Tabs: Suscriptores · Contacto · Equipo
 *
 * - Suscriptores tab links into the existing Suscriptores admin (single source of truth)
 * - Contacto + Equipo are stored in their own tables; we mark items as read/archived here
 * - Realtime: rows appear instantly when forms come in
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Mail, MessageSquare, Users, CheckCircle2,
  Archive, ExternalLink, Phone, Clock, UserPlus, Check, Trash2, CheckSquare, Square, Reply,
  Search, UserMinus, Globe,
} from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { RepliesPane, type ReplyRow } from "@/components/admin/bandeja/RepliesPane";

function TabLabel({ icon, text, count, highlight }: { icon: React.ReactNode; text: string; count: number; highlight?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon}
      <span>{text}</span>
      {count > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-black min-w-[18px] text-center leading-none"
          style={{
            background: highlight ? "#ef4444" : "var(--bg-surface-2)",
            color: highlight ? "#ffffff" : "var(--text-secondary)",
          }}
        >
          {count}
        </span>
      )}
    </span>
  );
}

type Tab = "subscribers" | "contact" | "recruitment" | "replies";

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  language: string;
  is_existing_client: boolean;
  status: "new" | "read" | "archived";
  created_at: string;
  source?: string | null;
  subject?: string | null;
  from_email?: string | null;
  gmail_thread_id?: string | null;
  gmail_message_id?: string | null;
}
interface RecruitmentRow {
  id: string;
  workplace: string | null;
  social: string | null;
  experience: string | null;
  passion: string | null;
  message: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  is_existing_client: boolean;
  status: "new" | "read" | "archived";
  created_at: string;
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

export default function Bandeja() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initial = (params.get("tab") as Tab) || "contact";
  const [tab, setTab] = useState<Tab>(initial);

  const [contact, setContact] = useState<ContactRow[]>([]);
  const [recruit, setRecruit] = useState<RecruitmentRow[]>([]);
  const [subscriberCount, setSubscriberCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  async function load() {
    const [c, r, s] = await Promise.all([
      supabase.from("contact_submissions")
        .select("id, first_name, last_name, email, phone, message, language, is_existing_client, status, created_at, source, subject, from_email, gmail_thread_id, gmail_message_id")
        .order("created_at", { ascending: false }).limit(200),
      supabase.from("recruitment_submissions")
        .select("id, workplace, social, experience, passion, message, contact_email, contact_phone, contact_name, is_existing_client, status, created_at")
        .order("created_at", { ascending: false }).limit(200),
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("newsletter_opt_in", true),
    ]);
    setContact((c.data ?? []) as ContactRow[]);
    setRecruit((r.data ?? []) as RecruitmentRow[]);
    setSubscriberCount(s.count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("bandeja-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_submissions" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "recruitment_submissions" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => { setParams({ tab }); }, [tab, setParams]);

  const isReply = (r: ContactRow) => r.source === "email_reply" || r.source === "newsletter_reply";
  const contactOnly = useMemo(() => contact.filter(r => !isReply(r)), [contact]);
  const replyOnly = useMemo(() => contact.filter(r => isReply(r)), [contact]);

  const newContact = contactOnly.filter(r => r.status === "new").length;
  const newRecruit = recruit.filter(r => r.status === "new").length;
  const newReplies = replyOnly.filter(r => r.status === "new").length;

  const visibleContact = useMemo(
    () => contactOnly.filter(r => showArchived ? true : r.status !== "archived"),
    [contactOnly, showArchived],
  );
  const visibleRecruit = useMemo(
    () => recruit.filter(r => showArchived ? true : r.status !== "archived"),
    [recruit, showArchived],
  );
  const visibleReplies = useMemo(
    () => replyOnly.filter(r => showArchived ? true : r.status !== "archived"),
    [replyOnly, showArchived],
  );

  async function setStatus(table: "contact_submissions" | "recruitment_submissions", id: string, status: "read" | "archived") {
    const now = new Date().toISOString();
    const patch = status === "read"
      ? { status, read_at: now }
      : { status, archived_at: now };
    if (table === "contact_submissions") {
      await supabase.from("contact_submissions").update(patch).eq("id", id);
    } else {
      await supabase.from("recruitment_submissions").update(patch).eq("id", id);
    }
  }

  async function deleteRows(table: "contact_submissions" | "recruitment_submissions", ids: string[]) {
    if (!ids.length) return;
    const label = ids.length === 1 ? "este mensaje" : `${ids.length} mensajes`;
    if (!window.confirm(`¿Borrar ${label} permanentemente? Esta acción no se puede deshacer.`)) return;
    await supabase.from(table).delete().in("id", ids);
    await load();
  }

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      {/* Header — matches Reports page style */}
      <div className="sticky top-0 z-10" style={{ background: "var(--bg-base)" }}>
        <SubpageHeader title="Bandeja" onBack={() => navigate("/admin")} />

        {/* Tabs — unified SegmentedTabs (matches Reports) */}
        <div className="flex justify-center px-2 mb-3 pb-2">
          <SegmentedTabs<Tab>
            width={400}
            layoutId="bandeja-tab-pill"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "subscribers", label: <TabLabel icon={<Mail size={12} className="icon-bold" />} text="Susc." count={subscriberCount} /> },
              { id: "contact", label: <TabLabel icon={<MessageSquare size={12} className="icon-bold" />} text="Contacto" count={newContact} highlight={newContact > 0} /> },
              { id: "replies", label: <TabLabel icon={<Reply size={12} className="icon-bold" />} text="Respuestas" count={newReplies} highlight={newReplies > 0} /> },
              { id: "recruitment", label: <TabLabel icon={<Users size={12} className="icon-bold" />} text="Equipo" count={newRecruit} highlight={newRecruit > 0} /> },
            ]}
          />
        </div>
      </div>

      <div className="px-4 pb-12">
        {loading && (
          <p className="text-sm py-12 text-center" style={{ color: "var(--text-tertiary)" }}>Cargando…</p>
        )}

        {!loading && tab === "subscribers" && (
          <SubscribersPane count={subscriberCount} />
        )}

        {!loading && tab === "contact" && (
          <ListPane
            empty="No hay mensajes de contacto todavía."
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived(s => !s)}
            items={visibleContact.map(r => ({
              id: r.id,
              status: r.status,
              isExisting: r.is_existing_client,
              createdAt: r.created_at,
              title: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Sin nombre",
              email: r.email,
              phone: r.phone,
              body: r.message,
              extra: null,
            }))}
            onMarkRead={(id) => setStatus("contact_submissions", id, "read")}
            onArchive={(id) => setStatus("contact_submissions", id, "archived")}
            onDelete={(ids) => deleteRows("contact_submissions", ids)}
          />
        )}

        {!loading && tab === "replies" && (
          <RepliesPane
            rows={visibleReplies as unknown as ReplyRow[]}
            onChange={load}
          />
        )}

        {!loading && tab === "recruitment" && (
          <ListPane
            empty="No hay solicitudes para unirse al equipo todavía."
            showArchived={showArchived}
            onToggleArchived={() => setShowArchived(s => !s)}
            items={visibleRecruit.map(r => ({
              id: r.id,
              status: r.status,
              isExisting: r.is_existing_client,
              createdAt: r.created_at,
              title: r.contact_name || r.workplace || "Aplicante anónimo",
              email: r.contact_email,
              phone: r.contact_phone,
              body: r.passion,
              extra: [
                r.workplace ? `Trabajo: ${r.workplace}` : null,
                r.experience ? `Exp: ${r.experience}` : null,
                r.social ? `Redes: ${r.social}` : null,
                r.message ? `Mensaje: ${r.message}` : null,
              ].filter(Boolean).join(" · ") || null,
            }))}
            onMarkRead={(id) => setStatus("recruitment_submissions", id, "read")}
            onArchive={(id) => setStatus("recruitment_submissions", id, "archived")}
            onDelete={(ids) => deleteRows("recruitment_submissions", ids)}
          />
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label, count, highlight }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count: number; highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all"
      style={{
        background: active ? "var(--bg-surface-1)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-black min-w-[18px] text-center"
          style={{
            background: highlight ? "#ef4444" : "var(--bg-surface-2)",
            color: highlight ? "#ffffff" : "var(--text-secondary)",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function SubscribersPane({ count }: { count: number }) {
  const [subs, setSubs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState<"all" | "es" | "en">("all");
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("clients")
      .select("id, first_name, last_name, email, phone, newsletter_language, newsletter_source, newsletter_opt_in_at")
      .eq("newsletter_opt_in", true)
      .order("newsletter_opt_in_at", { ascending: false, nullsFirst: false });
    setSubs(data ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    const ch = supabase
      .channel("bandeja-subs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    let list = subs;
    if (langFilter !== "all") list = list.filter((s) => s.newsletter_language === langFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          (s.first_name || "").toLowerCase().includes(q) ||
          (s.last_name || "").toLowerCase().includes(q) ||
          (s.email || "").toLowerCase().includes(q) ||
          (s.phone || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [subs, search, langFilter]);

  const counts = useMemo(() => ({
    all: subs.length,
    es: subs.filter((s) => s.newsletter_language === "es").length,
    en: subs.filter((s) => s.newsletter_language === "en").length,
  }), [subs]);

  async function unsubscribe(id: string) {
    if (!confirm("¿Quitar de la lista de suscriptores?")) return;
    await supabase.from("clients").update({ newsletter_opt_in: false, notify_email_marketing: false }).eq("id", id);
    setSubs((prev) => prev.filter((s) => s.id !== id));
  }

  const tabs: { id: "all" | "es" | "en"; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "es", label: "ES" },
    { id: "en", label: "EN" },
  ];

  return (
    <div className="mt-4">
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4"
        style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}
      >
        <Search size={16} style={{ color: "var(--text-tertiary)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar nombre, email, teléfono..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
          style={{ color: "var(--text-primary)" }}
        />
      </div>
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto -mx-4 px-4 pb-1 no-scrollbar">
        {tabs.map((tab) => {
          const active = langFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setLangFilter(tab.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
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
        <p className="text-sm py-12 text-center" style={{ color: "var(--text-tertiary)" }}>Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm py-12 text-center" style={{ color: "var(--text-tertiary)" }}>Sin suscriptores aún.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const fullName = [s.first_name, s.last_name].filter(Boolean).join(" ") || "—";
            return (
              <div key={s.id} className="rounded-xl p-3.5 card-elevated">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <h3 className="text-sm font-semibold leading-tight line-clamp-1" style={{ color: "var(--text-primary)" }}>
                    {fullName}
                  </h3>
                  <button
                    onClick={() => unsubscribe(s.id)}
                    className="p-1 rounded-md active:scale-90"
                    style={{ color: "var(--text-tertiary)" }}
                    aria-label="Quitar"
                  >
                    <UserMinus size={14} className="icon-bold" />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  {s.email && <span className="inline-flex items-center gap-1"><Mail size={11} className="icon-bold" />{s.email}</span>}
                  {s.phone && <span className="inline-flex items-center gap-1"><Phone size={11} className="icon-bold" />{s.phone}</span>}
                  <span className="inline-flex items-center gap-1"><Globe size={11} className="icon-bold" />{s.newsletter_language?.toUpperCase()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ListItem {
  id: string;
  status: "new" | "read" | "archived";
  isExisting: boolean;
  createdAt: string;
  title: string;
  email: string | null;
  phone: string | null;
  body: string | null;
  extra: string | null;
}

function ListPane({ items, empty, showArchived, onToggleArchived, onMarkRead, onArchive, onDelete }: {
  items: ListItem[];
  empty: string;
  showArchived: boolean;
  onToggleArchived: () => void;
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (ids: string[]) => void;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };
  const bulkDelete = async () => {
    await onDelete(Array.from(selected));
    exitSelect();
  };

  return (
    <>
      <div className="flex justify-between items-center mt-4 mb-3">
        <p className="text-xs font-bold" style={{ color: "var(--text-tertiary)" }}>
          {selectMode ? `${selected.size} seleccionado${selected.size === 1 ? "" : "s"}` : `${items.length} ${items.length === 1 ? "mensaje" : "mensajes"}`}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleArchived}
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
        <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--bg-surface-1)" }}>
          <button onClick={toggleAll} className="text-[11px] font-bold flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            {allSelected ? <CheckSquare size={14} className="icon-bold" /> : <Square size={14} className="icon-bold" />}
            {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
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
      )}

      {items.length === 0 && (
        <p className="text-sm py-12 text-center" style={{ color: "var(--text-tertiary)" }}>{empty}</p>
      )}

      <div className="space-y-2">
        {items.map((it) => {
          const isSel = selected.has(it.id);
          return (
          <div
            key={it.id}
            onClick={() => selectMode && toggleOne(it.id)}
            className="rounded-2xl p-4 card-elevated relative"
            style={{
              opacity: it.status === "archived" ? 0.55 : 1,
              cursor: selectMode ? "pointer" : "default",
              outline: isSel ? "2px solid var(--accent-color)" : "none",
            }}
          >
            {selectMode && (
              <div className="absolute top-3 left-3">
                {isSel ? <CheckSquare size={18} style={{ color: "var(--accent-color)" }} className="icon-bold" /> : <Square size={18} style={{ color: "var(--text-tertiary)" }} className="icon-bold" />}
              </div>
            )}
            {it.status === "new" && !selectMode && (
              <span
                className="absolute top-3 right-3 text-[9px] font-black px-2 py-0.5 rounded-full"
                style={{ background: "#ef4444", color: "#ffffff" }}
              >
                NUEVO
              </span>
            )}
            <div className={`flex items-center gap-2 mb-1 ${selectMode ? "pl-6" : ""}`}>
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{
                  background: it.isExisting ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                  color: it.isExisting ? "#16a34a" : "#d97706",
                }}
              >
                {it.isExisting
                  ? <><Check size={10} className="icon-bold" /> Cliente</>
                  : <><UserPlus size={10} className="icon-bold" /> Prospecto</>}
              </span>
              <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                <Clock size={10} />
                {timeAgo(it.createdAt)}
              </span>
            </div>
            <p className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>{it.title}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
              {it.email && (
                <a href={`mailto:${it.email}`} className="text-[11px] flex items-center gap-1" style={{ color: "var(--accent-color)" }}>
                  <Mail size={10} />{it.email}
                </a>
              )}
              {it.phone && (
                <a href={`tel:${it.phone}`} className="text-[11px] flex items-center gap-1" style={{ color: "var(--accent-color)" }}>
                  <Phone size={10} />{it.phone}
                </a>
              )}
            </div>
            {it.body && (
              <p className="text-xs mb-2 whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{it.body}</p>
            )}
            {it.extra && (
              <p className="text-[11px] mb-2" style={{ color: "var(--text-tertiary)" }}>{it.extra}</p>
            )}
            {!selectMode && (
              <div className="flex gap-2 mt-3">
                {it.status === "new" && (
                  <button
                    onClick={() => onMarkRead(it.id)}
                    className="flex-1 text-[11px] font-bold py-1.5 rounded-lg flex items-center justify-center gap-1"
                    style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
                  >
                    <CheckCircle2 size={12} className="icon-bold" />
                    Marcar leído
                  </button>
                )}
                {it.status !== "archived" && (
                  <button
                    onClick={() => onArchive(it.id)}
                    className="flex-1 text-[11px] font-bold py-1.5 rounded-lg flex items-center justify-center gap-1"
                    style={{ background: "var(--bg-surface-2)", color: "var(--text-tertiary)" }}
                  >
                    <Archive size={12} className="icon-bold" />
                    Archivar
                  </button>
                )}
                <button
                  onClick={() => onDelete([it.id])}
                  className="text-[11px] font-bold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1"
                  style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}
                  aria-label="Borrar"
                >
                  <Trash2 size={12} className="icon-bold" />
                </button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </>
  );
}
