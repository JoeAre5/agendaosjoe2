// Overview tab — KPIs + searchable client list with rewards data.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, Link as LinkIcon, Coins, Search, ChevronRight, Trophy, Download, RefreshCw, BookOpen } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ClientRewardsProfilePanel from "./ClientRewardsProfilePanel";

type Overview = { total_clients: number; active_referral_links: number; total_points_issued: number };

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  referral_slug: string | null;
  points_balance: number;
  referrals_count: number;
  last_activity: string | null;
};

const fmtDate = (d: string | null, isEs: boolean) => {
  if (!d) return isEs ? "Sin actividad" : "No activity";
  return new Date(d).toLocaleDateString(isEs ? "es-PR" : "en-US", { month: "short", day: "numeric" });
};

export default function OverviewTab({ isEs }: { isEs: boolean }) {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [query, setQuery] = useState("");
  const [openClientId, setOpenClientId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [ovRes, dashRes] = await Promise.all([
      (supabase.rpc as any)("get_client_network_overview"),
      (supabase.rpc as any)("get_client_network_dashboard"),
    ]);

    if (ovRes.data) setOverview(ovRes.data as Overview);

    // Build rows from dashboard's referrers (clients with slugs) + we also fetch top-points clients.
    const referrers: any[] = (dashRes.data as any)?.referrers || [];
    const mapped: ClientRow[] = referrers.map((r) => ({
      id: r.client_id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      avatar_url: null,
      referral_slug: r.slug,
      points_balance: r.points_balance || 0,
      referrals_count: r.referrals_count || 0,
      last_activity: r.last_payment_at,
    }));

    // Also fetch other clients with points but no slug
    const { data: ledgerClients } = await supabase
      .from("client_rewards_ledger")
      .select("client_id")
      .limit(1000);
    const idsInLedger = new Set<string>((ledgerClients || []).map((l: any) => l.client_id));
    const knownIds = new Set(mapped.map((m) => m.id));
    const extraIds = [...idsInLedger].filter((id) => !knownIds.has(id));
    if (extraIds.length > 0) {
      const { data: extras } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email, phone, avatar_url, referral_slug, last_visit_at")
        .in("id", extraIds.slice(0, 100));
      for (const c of (extras || []) as any[]) {
        mapped.push({
          id: c.id,
          name: `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Sin nombre",
          phone: c.phone,
          email: c.email,
          avatar_url: c.avatar_url,
          referral_slug: c.referral_slug,
          points_balance: 0,
          referrals_count: 0,
          last_activity: c.last_visit_at,
        });
      }
    }

    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.phone || "").includes(q) ||
        (r.email || "").toLowerCase().includes(q) ||
        (r.referral_slug || "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  return (
    <div className="pt-4">
      {/* Action buttons */}
      <div className="px-4 sm:px-6 flex gap-2 mb-3">
        <ActionBtn icon={Download} label={isEs ? "Exportar" : "Export"} onClick={() => toast.info(isEs ? "Exportación próximamente." : "Export coming soon.")} />
        <ActionBtn icon={RefreshCw} label={isEs ? "Refrescar" : "Refresh"} onClick={load} />
        <ActionBtn icon={BookOpen} label={isEs ? "Ver puntos" : "View ledger"}
          onClick={() => setSearchParams((p) => { p.set("tab", "ledger"); return p; }, { replace: true })} />
      </div>

      {/* KPIs */}
      <div className="px-4 sm:px-6 grid grid-cols-3 gap-2">
        <Kpi icon={Users} label={isEs ? "Clientes" : "Clients"} value={String(overview?.total_clients ?? 0)} hint={isEs ? "En rewards" : "In rewards"} />
        <Kpi icon={LinkIcon} label={isEs ? "Enlaces" : "Links"} value={String(overview?.active_referral_links ?? 0)} hint={isEs ? "Activos" : "Active"} />
        <Kpi icon={Coins} label={isEs ? "Puntos" : "Points"} value={(overview?.total_points_issued ?? 0).toLocaleString()} hint={isEs ? "Emitidos" : "Issued"} />
      </div>

      {/* Search */}
      <div className="px-4 sm:px-6 mt-4">
        <div className="flex items-center gap-2 rounded-xl px-3 h-10" style={{ background: "var(--bg-elevated)" }}>
          <Search size={14} style={{ color: "var(--text-tertiary)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isEs ? "Buscar clientes..." : "Search clients..."}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
      </div>

      {/* Section header */}
      <div className="px-4 sm:px-6 mt-5 mb-2 flex items-center gap-1.5">
        <Trophy size={12} style={{ color: "var(--text-tertiary)" }} />
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
          {isEs ? "Clientes" : "Clients"} ({filtered.length})
        </span>
      </div>

      {/* Rows */}
      <div className="px-4 sm:px-6 space-y-2">
        {filtered.length === 0 ? (
          rows.length > 0 || query ? (
            <EmptyState
              title={isEs ? "No hay clientes para este filtro." : "No clients for this filter."}
              subtitle={isEs ? "Limpia la búsqueda para ver todos." : "Clear the search to see all."}
            />
          ) : (
            <EmptyState
              title={isEs ? "Aún sin clientes en rewards" : "No rewards clients yet"}
              subtitle={isEs ? "Los clientes aparecerán aquí cuando entren al sistema de rewards." : "Clients will appear here once they enter the rewards system."}
            />
          )
        ) : (
          filtered.map((r) => (
            <ClientRowBtn key={r.id} r={r} isEs={isEs} onClick={() => setOpenClientId(r.id)} />
          ))
        )}
      </div>


      <ClientRewardsProfilePanel
        clientId={openClientId}
        isEs={isEs}
        onClose={() => setOpenClientId(null)}
        onChanged={load}
      />
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
      style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
    >
      <Icon size={12} /> {label}
    </button>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl p-3 card-elevated">
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color: "var(--text-tertiary)" }} />
        <div className="text-[10px] uppercase font-bold" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      </div>
      <div className="text-[18px] font-bold mt-1 tabular-nums" style={{ color: "var(--text-primary)" }}>{value}</div>
      <div className="text-[9px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{hint}</div>
    </div>
  );
}

function ClientRowBtn({ r, isEs, onClick }: { r: ClientRow; isEs: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl p-3 card-elevated transition active:opacity-80">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold"
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
          {r.name.trim().charAt(0).toUpperCase() || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold truncate" style={{ color: "var(--text-primary)" }}>{r.name}</div>
          <div className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>
            {r.referral_slug ? `/r/${r.referral_slug}` : (r.phone || "")} · {r.points_balance.toLocaleString()} pts
          </div>
        </div>
        <div className="text-right">
          <div className="text-[12px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{r.referrals_count}</div>
          <div className="text-[9px]" style={{ color: "var(--text-tertiary)" }}>{fmtDate(r.last_activity, isEs)}</div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
      </div>
    </button>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl p-6 card-elevated text-center">
      <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{title}</div>
      <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>{subtitle}</div>
    </div>
  );
}
