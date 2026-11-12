/**
 * Admin → Broadcasts → Suscriptores Push
 *
 * Mirrors the Newsletter "Suscriptores" page but for native push.
 * Lists every client with at least one active push_subscriptions row,
 * grouped by client (multiple devices = one row with chips).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Smartphone, Users, ChevronDown } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { usePreferences } from "@/hooks/usePreferences";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPushSubscribers,
  groupByClient,
  fullName,
  initials,
  detectPlatform,
  platformLabel,
  endpointHost,
  isInactive,
  type GroupedSubscriber,
  type PushSubscriberRow,
} from "@/lib/pushSubscribers";

export default function BroadcastSubscribers() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PushSubscriberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const data = await fetchPushSubscribers();
      setRows(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("push-subs-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "push_subscriptions" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const groups = useMemo(() => groupByClient(rows), [rows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter((g) =>
      (g.first_name || "").toLowerCase().includes(q) ||
      (g.last_name || "").toLowerCase().includes(q) ||
      (g.email || "").toLowerCase().includes(q) ||
      (g.phone || "").toLowerCase().includes(q),
    );
  }, [groups, search]);

  const stats = useMemo(() => {
    const platforms = { ios: 0, android: 0, desktop: 0 };
    for (const r of rows) {
      const p = detectPlatform(r.user_agent);
      if (p === "ios") platforms.ios++;
      else if (p === "android") platforms.android++;
      else platforms.desktop++;
    }
    return { devices: rows.length, clients: groups.length, ...platforms };
  }, [rows, groups]);

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Suscriptores Push" : "Push Subscribers"}
        subtitle={es
          ? "Clientes con la PWA instalada y notificaciones activas."
          : "Clients with the PWA installed and notifications enabled."}
        onBack={() => navigate("/admin/broadcasts")}
      />

      <div className="px-4 pb-6">
        {/* Stat strip */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Stat label={es ? "Dispos." : "Devices"} value={stats.devices} />
          <Stat label={es ? "Clientes" : "Clients"} value={stats.clients} />
          <Stat label="iOS" value={stats.ios} />
          <Stat label={es ? "Otros" : "Other"} value={stats.android + stats.desktop} />
        </div>

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

        {error && (
          <div className="mb-3 px-3 py-2 rounded-xl text-xs"
            style={{ background: "rgba(239,68,68,0.08)", color: "#b91c1c", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "var(--bg-surface-2)" }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState es={es} hasFilter={!!search} />
        ) : (
          <div className="space-y-2">
            {filtered.map((g) => (
              <SubRow
                key={g.client_id}
                group={g}
                es={es}
                expanded={expanded.has(g.client_id)}
                onToggle={() => {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    next.has(g.client_id) ? next.delete(g.client_id) : next.add(g.client_id);
                    return next;
                  });
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl p-2 text-center" style={{ background: "var(--bg-surface-1)", border: "1px solid var(--divider)" }}>
      <div className="text-base font-black" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-tertiary)" }}>{label}</div>
    </div>
  );
}

function SubRow({
  group, es, expanded, onToggle,
}: {
  group: GroupedSubscriber; es: boolean; expanded: boolean; onToggle: () => void;
}) {
  const platforms = Array.from(new Set(group.devices.map((d) => detectPlatform(d.user_agent))));
  return (
    <div className="rounded-xl p-3.5 card-elevated">
      <button onClick={onToggle} className="w-full flex items-center gap-3 text-left">
        <Avatar group={group} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight truncate" style={{ color: "var(--text-primary)" }}>
            {fullName(group)}
          </div>
          <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
            {group.email || group.phone || "—"}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {platforms.map((p) => (
            <span key={p} className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
              {platformLabel(p)}
            </span>
          ))}
          {group.devices.length > 1 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5"
              style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}>
              <Smartphone size={9} /> {group.devices.length}
            </span>
          )}
          <ChevronDown size={14} className="icon-bold transition-transform"
            style={{ color: "var(--text-tertiary)", transform: expanded ? "rotate(180deg)" : "none" }} />
        </div>
      </button>

      {expanded && (
        <div className="mt-3 pt-3 space-y-2 divider-hairline-top">
          {group.devices.map((d) => (
            <div key={d.subscription_id} className="text-[11px] flex flex-col gap-0.5"
              style={{ color: "var(--text-secondary)", opacity: isInactive(d) ? 0.5 : 1 }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {platformLabel(detectPlatform(d.user_agent))}
                </span>
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-tertiary)" }}>
                  {d.language.toUpperCase()}
                </span>
                {isInactive(d) && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#b91c1c" }}>
                    {es ? "inactivo" : "inactive"}
                  </span>
                )}
                {d.failure_count > 0 && (
                  <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {es ? `${d.failure_count} fallos` : `${d.failure_count} failures`}
                  </span>
                )}
              </div>
              <div className="text-[10px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>
                {endpointHost(d.endpoint)}
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {es ? "Último uso: " : "Last used: "}{relTime(d.last_used_at, es)}
                {" · "}
                {es ? "Registrado: " : "Registered: "}{relTime(d.created_at, es)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar({ group }: { group: GroupedSubscriber }) {
  if (group.avatar_url) {
    return <img src={group.avatar_url} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
      style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
      {initials(group)}
    </div>
  );
}

function EmptyState({ es, hasFilter }: { es: boolean; hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: "var(--bg-surface-2)" }}>
        <Users size={22} style={{ color: "var(--text-tertiary)" }} />
      </div>
      <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {hasFilter
          ? (es ? "No hay resultados" : "No results")
          : (es ? "Aún no hay dispositivos suscritos" : "No subscribed devices yet")}
      </p>
      <p className="text-xs max-w-[280px]" style={{ color: "var(--text-tertiary)" }}>
        {hasFilter
          ? (es ? "Intenta cambiar la búsqueda." : "Try a different search.")
          : (es
              ? "Cuando un cliente instale la PWA y active las notificaciones, aparecerá aquí."
              : "When a client installs the PWA and enables notifications, they'll appear here.")}
      </p>
    </div>
  );
}

function relTime(iso: string, es: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return es ? "ahora" : "now";
  if (m < 60) return es ? `hace ${m} min` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return es ? `hace ${h} h` : `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return es ? `hace ${d} d` : `${d}d ago`;
  return new Date(iso).toLocaleDateString(es ? "es-PR" : "en-US", { month: "short", day: "numeric", year: "numeric" });
}
