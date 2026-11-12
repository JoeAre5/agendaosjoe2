import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { SubpageHeader } from "@/components/SubpageHeader";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

const BenefitsManagerTab = lazy(() => import("@/components/admin/client-network/BenefitsManagerTab"));

type GiftsTabId = "vouchers" | "catalog";


type VoucherRow = {
  id: string;
  client_id: string;
  code: string;
  points_cost: number;
  claimed_at: string;
  expires_at: string;
  redeemed_at: string | null;
  void_reason: string | null;
  redeemed_appointment_id: string | null;
  redeemed_by: string | null;
  benefit_id: string;
  gift_year: number | null;
  clients: { first_name: string | null; last_name: string | null; email: string | null } | null;
  rewards_benefits: { title_es: string | null; title_en: string | null; kind: string | null } | null;
};

type StatusTone = "active" | "redeemed" | "expired";

const statusFor = (row: VoucherRow): { label: string; tone: StatusTone } => {
  if (row.redeemed_at) return { label: "Redimido", tone: "redeemed" };
  if (row.void_reason === "expired" || new Date(row.expires_at) < new Date()) return { label: "Expirado", tone: "expired" };
  return { label: "Activo", tone: "active" };
};

const toneStyle = (tone: StatusTone) => {
  switch (tone) {
    case "active": return { background: "rgba(212,175,55,0.15)", color: "var(--accent-color)" };
    case "redeemed": return { background: "rgba(34,197,94,0.15)", color: "#22c55e" };
    case "expired": return { background: "rgba(239,68,68,0.12)", color: "#ef4444" };
  }
};

export default function AdminGifts() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const isEs = language === "es";

  const [loading, setLoading] = useState(true);
  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StatusTone | "birthday">("all");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("client_benefit_redemptions")
      .select("id, client_id, code, points_cost, claimed_at, expires_at, redeemed_at, void_reason, redeemed_appointment_id, redeemed_by, benefit_id, gift_year, clients:client_id(first_name,last_name,email), rewards_benefits:benefit_id(title_es,title_en,kind)")
      .order("claimed_at", { ascending: false });
    if (data) setVouchers(data as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vouchers.filter((r) => {
      const s = statusFor(r);
      if (statusFilter === "birthday") {
        if (r.rewards_benefits?.kind !== "birthday") return false;
      } else if (statusFilter !== "all" && s.tone !== statusFilter) return false;
      if (!q) return true;
      const hay = `${r.clients?.first_name || ""} ${r.clients?.last_name || ""} ${r.clients?.email || ""} ${r.code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [vouchers, search, statusFilter]);

  const fmtDate = (s: string) => new Date(s).toLocaleDateString(isEs ? "es-PR" : "en-US", { day: "numeric", month: "short", year: "numeric" });
  const clientName = (c: { first_name: string | null; last_name: string | null } | null) =>
    `${c?.first_name || ""} ${c?.last_name || ""}`.trim() || (isEs ? "Sin nombre" : "Unnamed");

  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") === "catalog" ? "catalog" : "vouchers") as GiftsTabId;
  const setTab = (id: GiftsTabId) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-screen pb-12" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title={isEs ? "Regalos y Beneficios" : "Gifts & Benefits"}
        onBack={() => navigate(-1)}
      />

      <div className="px-4 sm:px-6 pt-1 pb-3">
        <SegmentedTabs
          tabs={[
            { id: "vouchers", label: isEs ? "Vales" : "Vouchers" },
            { id: "catalog", label: isEs ? "Catálogo" : "Catalog" },
          ]}
          value={tab}
          onChange={(id) => setTab(id as GiftsTabId)}
          layoutId="admin-gifts-tabs"
        />
      </div>

      {tab === "catalog" ? (
        <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} /></div>}>
          <BenefitsManagerTab isEs={isEs} />
        </Suspense>
      ) : (
        <>
      <div className="px-4 mb-3 flex gap-2">
        <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg-surface-2)" }}>
          <Search size={14} style={{ color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isEs ? "Buscar cliente o código" : "Search client or code"}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--text-primary)" }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="rounded-xl px-3 py-2 text-xs font-semibold outline-none"
          style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
        >
          <option value="all">{isEs ? "Todos" : "All"}</option>
          <option value="active">{isEs ? "Activo" : "Active"}</option>
          <option value="redeemed">{isEs ? "Redimido" : "Redeemed"}</option>
          <option value="expired">{isEs ? "Expirado" : "Expired"}</option>
          <option value="birthday">{isEs ? "Cumpleaños" : "Birthday"}</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center pt-20">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {filtered.map((r) => {
            const s = statusFor(r);
            const title = isEs ? r.rewards_benefits?.title_es : r.rewards_benefits?.title_en;
            const isBirthday = r.rewards_benefits?.kind === "birthday";
            return (
              <div key={r.id} className="rounded-xl p-3 card-elevated">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>{clientName(r.clients)}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>
                      {isBirthday ? (isEs ? "🎂 " : "🎂 ") : ""}{title || r.benefit_id.slice(0, 8)}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={toneStyle(s.tone)}>{s.label}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-mono text-base font-black tracking-widest tabular-nums" style={{ color: "var(--accent-color)" }}>{r.code}</span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {isBirthday ? (isEs ? "Regalo" : "Gift") : `${r.points_cost} pts`}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  <span>{isEs ? "Reclamado" : "Claimed"}: {fmtDate(r.claimed_at)}</span>
                  <span>{isEs ? "Vence" : "Expires"}: {fmtDate(r.expires_at)}</span>
                </div>
                {r.redeemed_appointment_id && (
                  <button
                    onClick={() => navigate(`/admin/appointment/${r.redeemed_appointment_id}`)}
                    className="text-[11px] font-bold mt-2 underline"
                    style={{ color: "var(--accent-color)" }}
                  >
                    {isEs ? "Ver cita" : "View appointment"}
                  </button>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p className="text-center text-xs py-12" style={{ color: "var(--text-tertiary)" }}>
              {isEs ? "No hay registros." : "No records."}
            </p>
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}

