/**
 * Admin → Newsletter → Suscriptores
 *
 * Lists all clients with `newsletter_opt_in = true`, with:
 *  - search by name/email/phone
 *  - language filter (all / es / en)
 *  - source filter
 *  - CSV export (for use in external broadcast tools if needed)
 *  - per-row unsubscribe toggle
 *
 * Sending is intentionally NOT implemented here yet — broadcasts will land in the
 * native AgendaOS notifications module. This page is the source-of-truth view + export tool.
 */
import { toCsv } from "@/lib/csvSafe";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import { Search, Download, Mail, Phone, Globe, UserMinus, Users, UserPlus, X } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";

type Subscriber = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  newsletter_language: "es" | "en";
  newsletter_source: string | null;
  newsletter_opt_in_at: string | null;
};

type LangFilter = "all" | "es" | "en";

export default function Suscriptores() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";

  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState<LangFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addLang, setAddLang] = useState<"es" | "en">("es");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("clients")
      .select("id, first_name, last_name, email, phone, newsletter_language, newsletter_source, newsletter_opt_in_at")
      .eq("newsletter_opt_in", true)
      .order("newsletter_opt_in_at", { ascending: false, nullsFirst: false });
    if (error) {
      setLoadError(error.message);
    } else {
      setLoadError(null);
      setSubs((data as Subscriber[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Live sync: reload whenever any client newsletter flag changes
    const channel = supabase
      .channel("suscriptores-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clients" },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  const counts = useMemo(
    () => ({
      all: subs.length,
      es: subs.filter((s) => s.newsletter_language === "es").length,
      en: subs.filter((s) => s.newsletter_language === "en").length,
    }),
    [subs],
  );

  const tabs: { id: LangFilter; label: string }[] = [
    { id: "all", label: es ? "Todos" : "All" },
    { id: "es", label: "ES" },
    { id: "en", label: "EN" },
  ];

  function exportCsv() {
    const rows = [
      ["first_name", "last_name", "email", "phone", "language", "source", "opt_in_at"],
      ...filtered.map((s) => [
        s.first_name ?? "",
        s.last_name ?? "",
        s.email ?? "",
        s.phone ?? "",
        s.newsletter_language ?? "",
        s.newsletter_source ?? "",
        s.newsletter_opt_in_at ?? "",
      ]),
    ];
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `suscriptores-${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function unsubscribe(id: string) {
    if (!confirm(es ? "¿Quitar de la lista de suscriptores?" : "Remove from subscriber list?")) return;
    const { error } = await supabase
      .from("clients")
      .update({ newsletter_opt_in: false, notify_email_marketing: false })
      .eq("id", id);
    if (error) {
      alert(es ? "Error al quitar." : "Failed to remove.");
      return;
    }
    setSubs((prev) => prev.filter((s) => s.id !== id));
  }

  async function addSubscriber() {
    const email = addEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddMsg({ kind: "err", text: es ? "Email inválido." : "Invalid email." });
      return;
    }
    setAdding(true);
    setAddMsg(null);
    const flagsPatch = {
      newsletter_opt_in: true,
      newsletter_opt_in_at: new Date().toISOString(),
      newsletter_language: addLang,
      newsletter_source: "manual_admin",
      notify_email_marketing: true,
    };
    // Match existing client by email
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .ilike("email", email)
      .limit(1);
    if (existing && existing.length > 0) {
      const { error } = await supabase.from("clients").update(flagsPatch).eq("id", existing[0].id);
      if (error) {
        setAddMsg({ kind: "err", text: error.message });
        setAdding(false);
        return;
      }
    } else {
      const placeholderName = email.split("@")[0].slice(0, 60);
      const { error } = await supabase.from("clients").insert({
        first_name: placeholderName,
        email,
        is_guest: true,
        ...flagsPatch,
      });
      if (error) {
        setAddMsg({ kind: "err", text: error.message });
        setAdding(false);
        return;
      }
    }
    setAddMsg({ kind: "ok", text: es ? "Suscrito ✓" : "Subscribed ✓" });
    setAddEmail("");
    setAdding(false);
    await load();
    setTimeout(() => { setShowAdd(false); setAddMsg(null); }, 900);
  }

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Suscriptores" : "Subscribers"}
        subtitle={es
          ? "Personas suscritas al boletín desde el formulario web."
          : "People subscribed to the newsletter from the web form."}
        onBack={() => navigate("/admin/titulares")}
        actions={
          <>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
            >
              <UserPlus size={14} className="icon-bold" />
              {es ? "Añadir" : "Add"}
            </button>
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold active:scale-95 transition-transform disabled:opacity-40"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
            >
              <Download size={14} className="icon-bold" />
              CSV
            </button>
          </>
        }
      />

      {/* Add subscriber modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => !adding && setShowAdd(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5"
            style={{ background: "var(--bg-surface-1)", border: "1px solid var(--divider)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>
                {es ? "Añadir suscriptor" : "Add subscriber"}
              </h3>
              <button onClick={() => setShowAdd(false)} disabled={adding} style={{ color: "var(--text-tertiary)" }}>
                <X size={18} />
              </button>
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>
              {es
                ? "Si el email coincide con un cliente, se le activa el opt-in. Si no, se crea un suscriptor."
                : "If the email matches a client, opt-in is enabled. Otherwise a subscriber is created."}
            </p>
            <input
              type="email"
              autoFocus
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="email@ejemplo.com"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mb-2"
              style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)", color: "var(--text-primary)" }}
            />
            <div className="flex gap-2 mb-3">
              {(["es", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setAddLang(l)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold"
                  style={{
                    background: addLang === l ? "var(--accent-color)" : "var(--bg-surface-2)",
                    color: addLang === l ? "var(--cta-fg)" : "var(--text-secondary)",
                    border: addLang === l ? "none" : "1px solid var(--divider)",
                  }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            {addMsg && (
              <p className="text-xs mb-2" style={{ color: addMsg.kind === "ok" ? "#22c55e" : "#ef4444" }}>
                {addMsg.text}
              </p>
            )}
            <button
              onClick={addSubscriber}
              disabled={adding}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}
            >
              {adding ? "…" : es ? "Suscribir" : "Subscribe"}
            </button>
          </div>
        </div>
      )}

      <div className="px-4 pb-6">
        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4"
          style={{ background: "var(--bg-surface-2)", border: "1px solid var(--divider)" }}
        >
          <Search size={16} style={{ color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={es ? "Buscar nombre, email, teléfono..." : "Search name, email, phone..."}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto -mx-4 px-4 pb-1 no-scrollbar">
          {tabs.map((tab) => {
            const active = langFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setLangFilter(tab.id)}
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

        {loadError && (
          <div
            className="mb-3 px-3 py-2 rounded-xl text-xs"
            style={{ background: "rgba(239,68,68,0.08)", color: "#b91c1c", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            {es ? "Error al cargar: " : "Failed to load: "}{loadError}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl animate-pulse"
                style={{ background: "var(--bg-surface-2)" }}
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState es={es} hasFilter={search.length > 0 || langFilter !== "all"} />
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <SubscriberRow key={s.id} sub={s} es={es} onUnsubscribe={() => unsubscribe(s.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SubscriberRow({
  sub,
  es,
  onUnsubscribe,
}: {
  sub: Subscriber;
  es: boolean;
  onUnsubscribe: () => void;
}) {
  const fullName = [sub.first_name, sub.last_name].filter(Boolean).join(" ") || "—";
  return (
    <div className="rounded-xl p-3.5 card-elevated">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h3
          className="text-sm font-semibold leading-tight line-clamp-1"
          style={{ color: "var(--text-primary)" }}
        >
          {fullName}
        </h3>
        <button
          onClick={onUnsubscribe}
          className="p-1 rounded-md active:scale-90 transition-transform"
          style={{ color: "var(--text-tertiary)" }}
          aria-label={es ? "Quitar" : "Remove"}
        >
          <UserMinus size={14} className="icon-bold" />
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        {sub.email && (
          <span className="inline-flex items-center gap-1">
            <Mail size={11} className="icon-bold" />
            {sub.email}
          </span>
        )}
        {sub.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone size={11} className="icon-bold" />
            {sub.phone}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Globe size={11} className="icon-bold" />
          {sub.newsletter_language?.toUpperCase()}
        </span>
        {sub.newsletter_opt_in_at && (
          <span className="ml-auto">{formatDate(sub.newsletter_opt_in_at, es)}</span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ es, hasFilter }: { es: boolean; hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
        style={{ background: "var(--bg-surface-2)" }}
      >
        <Users size={22} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {hasFilter
          ? es ? "No hay resultados" : "No results"
          : es ? "Sin suscriptores aún" : "No subscribers yet"}
      </p>
      <p className="text-xs mb-1 max-w-[280px]" style={{ color: "var(--text-tertiary)" }}>
        {hasFilter
          ? es ? "Intenta cambiar el filtro o la búsqueda." : "Try changing the filter or search."
          : es
            ? "Cuando alguien se suscriba desde el formulario, aparecerá aquí."
            : "When someone subscribes from the form, they'll appear here."}
      </p>
    </div>
  );
}

function formatDate(iso: string, es: boolean): string {
  const d = new Date(iso);
  return d.toLocaleDateString(es ? "es-PR" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}
