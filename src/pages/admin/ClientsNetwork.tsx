// Admin dashboard: client-to-client referral network overview.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, Users, Trophy, UserPlus, ChevronRight, Search, TrendingUp, Coins,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { SubpageHeader } from "@/components/SubpageHeader";

type Referrer = {
  client_id: string;
  owner_id: string;
  slug: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  referrals_count: number;
  active_referrals: number;
  last_payment_at: string | null;
  downline_spend_cents: number;
  points_balance: number;
};

type Dashboard = {
  total_referrers: number;
  total_referrals: number;
  total_points: number;
  referrers: Referrer[];
};

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    .format((cents || 0) / 100);

const fmtDate = (d: string | null, isEs: boolean) =>
  d ? new Date(d).toLocaleDateString(isEs ? "es-PR" : "en-US",
    { month: "short", day: "numeric" }) : "—";

export default function ClientsNetwork() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const isEs = language === "es";

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Dashboard | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"referrals" | "points" | "spend">("referrals");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase.rpc as any)("get_client_network_dashboard");
      if (error) console.warn("[ClientsNetwork]", error);
      setData((data as Dashboard) || { total_referrers: 0, total_referrals: 0, total_points: 0, referrers: [] });
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let rows = q
      ? data.referrers.filter((r) =>
          r.name.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q) ||
          (r.email || "").toLowerCase().includes(q) ||
          (r.phone || "").includes(q))
      : data.referrers;
    rows = [...rows].sort((a, b) => {
      if (sortBy === "points") return b.points_balance - a.points_balance;
      if (sortBy === "spend") return b.downline_spend_cents - a.downline_spend_cents;
      return b.referrals_count - a.referrals_count;
    });
    return rows;
  }, [data, query, sortBy]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  const withReferrals = filtered.filter((r) => r.referrals_count > 0);
  const withoutReferrals = filtered.filter((r) => r.referrals_count === 0);

  return (
    <div className="min-h-screen pb-12 overflow-x-hidden" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title={isEs ? "Red de Clientes" : "Client Network"}
        subtitle={isEs ? "Clientes refiriendo clientes" : "Clients referring clients"}
        onBack={() => navigate("/admin/referidos")}
      />


      {/* KPI cards */}
      <div className="px-4 sm:px-6 pt-1 grid grid-cols-3 gap-2">
        <Kpi icon={Users} label={isEs ? "Embajadores" : "Ambassadors"} value={String(data?.total_referrers ?? 0)} />
        <Kpi icon={UserPlus} label={isEs ? "Referidos" : "Referrals"} value={String(data?.total_referrals ?? 0)} />
        <Kpi icon={Coins} label={isEs ? "Puntos" : "Points"} value={(data?.total_points ?? 0).toLocaleString()} />
      </div>

      {/* Search + sort */}
      <div className="px-4 sm:px-6 mt-4 space-y-2">
        <div
          className="flex items-center gap-2 rounded-xl px-3 h-10"
          style={{ background: "var(--bg-elevated)" }}
        >
          <Search size={14} style={{ color: "var(--text-tertiary)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isEs ? "Buscar por nombre, slug o contacto" : "Search by name, slug or contact"}
            className="flex-1 bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>
        <div className="flex gap-1.5">
          {([
            ["referrals", isEs ? "Más referidos" : "Top referrers"],
            ["spend", isEs ? "Gasto downline" : "Downline spend"],
            ["points", isEs ? "Puntos" : "Points"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-md"
              style={{
                background: sortBy === k ? "var(--accent-dim)" : "var(--bg-elevated)",
                color: sortBy === k ? "var(--nav-accent)" : "var(--text-secondary)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Active referrers */}
      <SectionHeader
        icon={Trophy}
        label={`${isEs ? "Embajadores activos" : "Active ambassadors"} (${withReferrals.length})`}
      />
      <div className="px-4 sm:px-6 space-y-2">
        {withReferrals.length === 0 ? (
          <Empty label={isEs ? "Aún ningún cliente ha referido a alguien." : "No client has referred anyone yet."} />
        ) : (
          withReferrals.map((r, idx) => (
            <ReferrerRow
              key={r.owner_id}
              r={r}
              idx={idx}
              isEs={isEs}
              onClick={() => navigate(`/admin/clients?open=${encodeURIComponent(r.name)}`)}
            />
          ))
        )}
      </div>

      {/* Inactive referrers (have a link, no referrals yet) */}
      {withoutReferrals.length > 0 && (
        <>
          <SectionHeader
            icon={TrendingUp}
            label={`${isEs ? "Con enlace, sin referidos" : "Have link, no referrals"} (${withoutReferrals.length})`}
          />
          <div className="px-4 sm:px-6 space-y-2">
            {withoutReferrals.slice(0, 30).map((r) => (
              <ReferrerRow
                key={r.owner_id}
                r={r}
                idx={-1}
                isEs={isEs}
                onClick={() => navigate(`/admin/clients?open=${encodeURIComponent(r.name)}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 card-elevated">
      <div className="flex items-center gap-1.5">
        <Icon size={12} style={{ color: "var(--text-tertiary)" }} />
        <div className="text-[10px] uppercase font-bold" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      </div>
      <div className="text-[18px] font-bold mt-1 tabular-nums" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="px-4 sm:px-6 mt-5 mb-2 flex items-center gap-1.5">
      <Icon size={12} style={{ color: "var(--text-tertiary)" }} />
      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </span>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-xl p-4 card-elevated text-center text-[12px]" style={{ color: "var(--text-tertiary)" }}>
      {label}
    </div>
  );
}

function ReferrerRow({
  r, idx, isEs, onClick,
}: { r: Referrer; idx: number; isEs: boolean; onClick: () => void }) {
  const showTrophy = idx === 0 && r.referrals_count > 0;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-3 card-elevated transition active:opacity-80"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold"
          style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
        >
          {r.name ? r.name.trim().charAt(0).toUpperCase() : "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="text-[14px] font-bold truncate" style={{ color: "var(--text-primary)" }}>
              {r.name || (isEs ? "Sin nombre" : "Unnamed")}
            </div>
            {showTrophy && <Trophy size={13} className="shrink-0" style={{ color: "#f59e0b" }} />}
          </div>
          <div className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>
            /r/{r.slug} · {r.points_balance.toLocaleString()} {isEs ? "pts" : "pts"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[14px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
            {r.referrals_count}
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
            {r.downline_spend_cents > 0
              ? fmtMoney(r.downline_spend_cents)
              : fmtDate(r.last_payment_at, isEs)}
          </div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
      </div>
    </button>
  );
}
