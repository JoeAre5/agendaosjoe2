import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2, Trophy, Copy, Check, Link as LinkIcon,
  Users, Clock, RotateCcw, Activity, Download, ChevronRight, Store,
  Coins, BookOpen, AlertCircle, DollarSign,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import { loadOwnerColorMap, getOwnerColor, getOwnerAvatar, type OwnerColorMap } from "@/lib/referralColors";
import { SubpageHeader } from "@/components/SubpageHeader";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import ReferralRulesTab from "@/components/admin/ReferralRulesTab";

interface ProductionRow {
  referral_owner_id: string;
  display_name: string;
  owner_type: string;
  slug: string;
  production_cents: number;
  payment_count: number;
  refund_cents: number;
  rank_name_es: string | null;
  rank_name_en: string | null;
  rank_sort_order: number | null;
}

interface OwnerRow {
  id: string;
  display_name: string;
  slug: string;
  owner_type: string;
  active: boolean;
  owner_profile_id: string | null;
}

interface LinkRow {
  id: string;
  slug: string;
  full_url: string;
  referral_owner_id: string;
  status: string;
}

interface AttributionRow {
  id: string;
  client_id: string;
  current_referral_owner_id: string;
  attribution_status: string;
  last_payment_at: string | null;
  reset_available_at: string | null;
  reallocated_at: string | null;
  reallocation_reason: string | null;
  created_at?: string | null;
  client_name?: string | null;
  owner_name?: string | null;
  total_production_cents?: number;
}

interface ActivityRow {
  id: string;
  event_type: string;
  description: string | null;
  created_at: string;
  client_name?: string | null;
  owner_name?: string | null;
}

interface Kpis {
  total_production_cents: number;
  attributed_clients_count: number;
  active_links_count: number;
  near_reset_count: number;
  pending_validation_count: number;
}

type RangeKey = "month" | "week" | "last90" | "all";
type TabId = "dashboard" | "rules";

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    .format((cents || 0) / 100);

const fmtDate = (d: string | null | undefined, isEs: boolean) =>
  d ? new Date(d).toLocaleDateString(isEs ? "es-PR" : "en-US",
    { month: "short", day: "numeric", year: "numeric" }) : "—";

const daysSince = (d: string | null) =>
  d ? (Date.now() - new Date(d).getTime()) / 86400000 : Infinity;

export default function ReferralInternal() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const isEs = language === "es";
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") === "rules" ? "rules" : "dashboard") as TabId;
  const setTab = (id: TabId) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<ProductionRow[]>([]);
  const [weekly, setWeekly] = useState<ProductionRow[]>([]);
  const [last90, setLast90] = useState<ProductionRow[]>([]);
  const [allTime, setAllTime] = useState<ProductionRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [colorMap, setColorMap] = useState<OwnerColorMap>(new Map());
  const [attributions, setAttributions] = useState<AttributionRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("month");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const ALL_START = "2000-01-01T00:00:00Z";
      const LAST90_START = new Date(Date.now() - 90 * 86400000).toISOString();
      const NOW = new Date().toISOString();

      const [m, w, l90, al, l, o, k] = await Promise.all([
        (supabase.rpc as any)("calculate_referral_production", { _window: "monthly" }),
        (supabase.rpc as any)("calculate_referral_production", { _window: "weekly" }),
        (supabase.rpc as any)("calculate_referral_production", { _window: "custom", _start_at: LAST90_START, _end_at: NOW }),
        (supabase.rpc as any)("calculate_referral_production", { _window: "custom", _start_at: ALL_START, _end_at: NOW }),
        // Only links whose owner is a barber or the shop belong to Red Interna.
        (supabase as any)
          .from("referral_links")
          .select("id,slug,full_url,referral_owner_id,status, referral_owners!inner(owner_type)")
          .eq("status", "active")
          .in("referral_owners.owner_type", ["barber", "shop"]),
        (supabase as any)
          .from("referral_owners")
          .select("id,display_name,slug,owner_type,active,owner_profile_id")
          .in("owner_type", ["barber", "shop"])
          .eq("active", true),
        (supabase.rpc as any)("get_internal_network_kpis"),
      ]);

      if (m.error) toast.error(m.error.message);
      if (w.error) toast.error(w.error.message);
      setMonthly((m.data as ProductionRow[]) || []);
      setWeekly((w.data as ProductionRow[]) || []);
      setLast90((l90.data as ProductionRow[]) || []);
      setAllTime((al.data as ProductionRow[]) || []);
      setLinks(((l.data as any[]) || []).map((r) => ({
        id: r.id, slug: r.slug, full_url: r.full_url,
        referral_owner_id: r.referral_owner_id, status: r.status,
      })));
      const ownerRows = (o.data as OwnerRow[]) || [];
      setOwners(ownerRows);
      setColorMap(await loadOwnerColorMap(ownerRows));
      if (k.data && Array.isArray(k.data) && k.data[0]) setKpis(k.data[0] as Kpis);
      else if (k.data && !Array.isArray(k.data)) setKpis(k.data as Kpis);

      // Attributions — Red Interna only (owner_type = barber|shop).
      // Source of truth = v_referral_attributions (network_type derived from owner_type).
      const { data: attrData } = await (supabase as any)
        .from("v_referral_attributions")
        .select("id,client_id,current_referral_owner_id,attribution_status,last_payment_at,reset_available_at,reallocated_at,reallocation_reason,created_at,referrer_display_name,network_type")
        .eq("network_type", "internal_network")
        .order("updated_at", { ascending: false })
        .limit(200);

      let attrRows: AttributionRow[] = ((attrData as any[]) || []).map((a) => ({
        id: a.id,
        client_id: a.client_id,
        current_referral_owner_id: a.current_referral_owner_id,
        attribution_status: a.attribution_status,
        last_payment_at: a.last_payment_at,
        reset_available_at: a.reset_available_at,
        reallocated_at: a.reallocated_at,
        reallocation_reason: a.reallocation_reason,
        created_at: a.created_at,
        owner_name: a.referrer_display_name || "—",
      }));
      if (attrRows.length > 0) {
        const clientIds = [...new Set(attrRows.map((a) => a.client_id))];
        const [cRes, pRes] = await Promise.all([
          (supabase as any).from("clients").select("id,first_name,last_name").in("id", clientIds),
          (supabase as any)
            .from("referral_payments")
            .select("client_id,amount_cents,is_tip,is_refund")
            .in("client_id", clientIds),
        ]);
        const cMap = new Map((cRes.data || []).map((c: any) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()]));
        const prodByClient = new Map<string, number>();
        for (const p of (pRes.data || []) as any[]) {
          if (p.is_tip || p.is_refund) continue;
          prodByClient.set(p.client_id, (prodByClient.get(p.client_id) || 0) + (p.amount_cents || 0));
        }
        attrRows = attrRows.map((a) => ({
          ...a,
          client_name: (cMap.get(a.client_id) as string) || (isEs ? "Sin nombre" : "Unnamed"),
          total_production_cents: prodByClient.get(a.client_id) || 0,
        }));
      }
      setAttributions(attrRows);


      // Activity — Red Interna only.
      const { data: logData } = await (supabase as any)
        .from("referral_activity_log")
        .select("id,event_type,description,created_at,client_id,referral_owner_id, referral_owners!inner(owner_type,display_name)")
        .in("referral_owners.owner_type", ["barber", "shop"])
        .order("created_at", { ascending: false })
        .limit(50);
      let logRows: any[] = logData || [];
      if (logRows.length > 0) {
        const cIds = [...new Set(logRows.map((r) => r.client_id).filter(Boolean))];
        const cRes = cIds.length
          ? await (supabase as any).from("clients").select("id,first_name,last_name").in("id", cIds)
          : { data: [] };
        const cMap = new Map((cRes.data || []).map((c: any) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()]));
        logRows = logRows.map((r) => ({
          ...r,
          client_name: cMap.get(r.client_id) || null,
          owner_name: r.referral_owners?.display_name || null,
        }));
      }
      setActivity(logRows as ActivityRow[]);


      setLoading(false);
    })();
  }, [isEs]);

  // Red Interna = only barbers + shop. Clients live in "Red de Clientes".
  const internalOwnerIds = useMemo(
    () => new Set(owners.filter((o) => o.owner_type === "barber" || o.owner_type === "shop").map((o) => o.id)),
    [owners],
  );
  const filterInternal = (rows: ProductionRow[]) =>
    rows.filter((r) => internalOwnerIds.has(r.referral_owner_id));

  const monthlyInternal = useMemo(() => filterInternal(monthly), [monthly, internalOwnerIds]);
  const weeklyInternal = useMemo(() => filterInternal(weekly), [weekly, internalOwnerIds]);
  const last90Internal = useMemo(() => filterInternal(last90), [last90, internalOwnerIds]);
  const allTimeInternal = useMemo(() => filterInternal(allTime), [allTime, internalOwnerIds]);

  const rangedRows = useMemo(() => {
    switch (range) {
      case "week": return weeklyInternal;
      case "last90": return last90Internal;
      case "all": return allTimeInternal;
      default: return monthlyInternal;
    }
  }, [range, monthlyInternal, weeklyInternal, last90Internal, allTimeInternal]);

  const totalMonthly = monthlyInternal.reduce((s, r) => s + (r.production_cents || 0), 0);
  const totalWeekly = weeklyInternal.reduce((s, r) => s + (r.production_cents || 0), 0);
  const hasRealProduction = rangedRows.reduce((s, r) => s + (r.production_cents || 0), 0) > 0;

  const resetSoon = useMemo(() => {
    return attributions.filter((a) => {
      if (!a.last_payment_at || a.attribution_status !== "active") return false;
      const age = daysSince(a.last_payment_at);
      return age >= 75 && age < 90;
    });
  }, [attributions]);

  const reallocated = useMemo(
    () => attributions.filter((a) => a.attribution_status === "reallocated"),
    [attributions],
  );

  // Per-link metadata: production count and "near reset" flag.
  const linkMeta = useMemo(() => {
    const referralsByOwner = new Map<string, number>();
    const nearResetByOwner = new Map<string, number>();
    for (const a of attributions) {
      if (a.attribution_status === "active") {
        referralsByOwner.set(a.current_referral_owner_id, (referralsByOwner.get(a.current_referral_owner_id) || 0) + 1);
      }
      if (a.last_payment_at) {
        const age = daysSince(a.last_payment_at);
        if (age >= 75 && age < 90) {
          nearResetByOwner.set(a.current_referral_owner_id, (nearResetByOwner.get(a.current_referral_owner_id) || 0) + 1);
        }
      }
    }
    return { referralsByOwner, nearResetByOwner };
  }, [attributions]);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      toast.success(t("referrals.actions.copied"));
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const exportCsv = () => {
    const header = "Owner,Slug,Producción mensual (cents),Producción semanal (cents),Rango\n";
    const wMap = new Map(weeklyInternal.map((r) => [r.referral_owner_id, r.production_cents]));
    const rows = monthlyInternal.map((r) =>
      [
        JSON.stringify(r.display_name),
        r.slug,
        r.production_cents,
        wMap.get(r.referral_owner_id) || 0,
        r.rank_name_es || "",
      ].join(","),
    );
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referidos-produccion-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 overflow-x-hidden" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title={t("referrals.systems.internal")}
        onBack={() => navigate("/admin/referidos")}
        actions={
          tab === "dashboard" ? (
            <button
              onClick={exportCsv}
              className="p-2 rounded-lg"
              style={{ background: "var(--bg-elevated)" }}
              aria-label={t("referrals.actions.export")}
            >
              <Download size={16} style={{ color: "var(--text-secondary)" }} />
            </button>
          ) : undefined
        }
      />

      <p className="px-4 sm:px-6 pb-2 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
        {t("referrals.systems.internalSub")}
      </p>

      <div className="px-4 sm:px-6 pt-1">
        <SegmentedTabs
          tabs={[
            { id: "dashboard", label: isEs ? "Dashboard" : "Dashboard" },
            { id: "rules",     label: t("referrals.sections.rules") },
          ]}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
          fitContent
          layoutId="referral-internal-tabs"
          labelClassName="text-[11px] px-2"
        />
      </div>

      {tab === "rules" ? (
        <ReferralRulesTab variant="internal" />
      ) : (
        <>
          {/* KPI cards: row 1 (week+month) */}
          <div className="px-4 sm:px-6 pt-3 grid grid-cols-2 gap-2.5">
            <KpiCard label={t("referrals.metrics.productionMonthly")} value={fmtMoney(totalMonthly)} />
            <KpiCard label={t("referrals.metrics.productionWeekly")} value={fmtMoney(totalWeekly)} />
          </div>

          {/* KPI cards: row 2+3 (aggregates from RPC) */}
          {kpis && (
            <div className="px-4 sm:px-6 pt-2 grid grid-cols-3 gap-2">
              <KpiCardSm
                icon={DollarSign}
                label={t("referrals.metrics.productionTotal")}
                value={fmtMoney(kpis.total_production_cents)}
              />
              <KpiCardSm
                icon={Users}
                label={t("referrals.metrics.attributedClients")}
                value={String(kpis.attributed_clients_count)}
              />
              <KpiCardSm
                icon={LinkIcon}
                label={t("referrals.metrics.activeLinks")}
                value={String(kpis.active_links_count)}
              />
              <KpiCardSm
                icon={Clock}
                label={t("referrals.metrics.nearReset")}
                value={String(kpis.near_reset_count)}
                accent={kpis.near_reset_count > 0 ? "var(--yellow)" : undefined}
              />
              <KpiCardSm
                icon={AlertCircle}
                label={t("referrals.metrics.pendingValidation")}
                value={String(kpis.pending_validation_count)}
                accent={kpis.pending_validation_count > 0 ? "var(--accent-color)" : undefined}
              />
              <KpiCardSm
                icon={RotateCcw}
                label={t("referrals.sections.reallocated")}
                value={String(reallocated.length)}
              />
            </div>
          )}

          {/* Leaderboard */}
          <SectionHeader icon={Trophy} label={t("referrals.sections.leaderboard")} />
          <p className="px-4 sm:px-6 text-[10.5px] leading-snug -mt-1 mb-2" style={{ color: "var(--text-tertiary)" }}>
            {t("referrals.notes.leaderboard")}
          </p>
          <div className="px-4 sm:px-6 mb-2 flex gap-1.5 overflow-x-auto">
            {(["month", "week", "last90", "all"] as RangeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className="text-[10px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap"
                style={{
                  background: range === k ? "var(--accent-dim)" : "var(--bg-elevated)",
                  color: range === k ? "var(--nav-accent)" : "var(--text-secondary)",
                }}
              >
                {t(`referrals.ranges.${k}`)}
              </button>
            ))}
          </div>
          <div className="px-4 sm:px-6 space-y-2">
            {rangedRows.length === 0 ? (
              <Empty label={t("referrals.empty.noProduction")} />
            ) : (
              rangedRows.map((r, idx) => {
                const ownerColor = getOwnerColor(colorMap, r.referral_owner_id);
                const avatarUrl = getOwnerAvatar(colorMap, r.referral_owner_id);
                const ownerSlug = owners.find((o) => o.id === r.referral_owner_id)?.slug || r.slug;
                const showTrophy = idx === 0 && hasRealProduction;
                return (
                  <button
                    key={r.referral_owner_id}
                    onClick={() => navigate(`/admin/referidos/interna/${ownerSlug}`)}
                    className="w-full text-left rounded-xl p-3 card-elevated transition active:opacity-80"
                  >
                    <div className="flex items-center gap-3">
                      {avatarUrl ? (
                        <img
                          src={`${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}width=80&height=80&resize=cover&quality=70`}
                          alt={r.display_name}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                          style={{ background: "var(--bg-surface-2)" }}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: "var(--bg-elevated)" }}
                        >
                          <Store size={16} style={{ color: "var(--text-secondary)" }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="text-[14px] font-bold truncate" style={{ color: ownerColor }}>
                            {r.display_name}
                          </div>
                          {showTrophy && (
                            <Trophy size={14} className="shrink-0" style={{ color: "var(--yellow)" }} />
                          )}
                        </div>
                        <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                          /r/{r.slug} · {r.payment_count} {t("referrals.metrics.payments").toLowerCase()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>
                          {fmtMoney(r.production_cents)}
                        </div>
                        {r.rank_name_es && (
                          <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                            {isEs ? r.rank_name_es : r.rank_name_en}
                          </div>
                        )}
                      </div>
                      <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Active links */}
          <SectionHeader icon={LinkIcon} label={t("referrals.sections.activeLinks")} />
          <div className="px-4 sm:px-6 space-y-2">
            {links.length === 0 ? (
              <Empty label={t("referrals.empty.noResults")} />
            ) : links.map((l) => {
              const owner = owners.find((o) => o.id === l.referral_owner_id);
              if (owner && owner.owner_type !== "barber" && owner.owner_type !== "shop") return null;
              const ownerColor = getOwnerColor(colorMap, l.referral_owner_id);
              const refCount = linkMeta.referralsByOwner.get(l.referral_owner_id) || 0;
              const nearReset = (linkMeta.nearResetByOwner.get(l.referral_owner_id) || 0) > 0;
              const linkStatus: keyof Awaited<ReturnType<typeof getLinkStatusMap>> =
                nearReset ? "nearReset" : refCount > 0 ? "withReferrals" : refCount === 0 ? "noUse" : "active";
              return (
                <div
                  key={l.id}
                  className="rounded-xl p-3 card-elevated"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="text-[13px] font-bold truncate" style={{ color: ownerColor }}>
                          {owner?.display_name || l.slug}
                        </div>
                        <LinkStatusPill status={linkStatus} t={t} />
                      </div>
                      <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                        {l.full_url}
                      </div>
                    </div>
                    <button
                      onClick={() => copy(l.full_url, l.id)}
                      className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg shrink-0"
                      style={{
                        background: copied === l.id ? "color-mix(in srgb, var(--green) 18%, transparent)" : "var(--accent-dim)",
                        color: copied === l.id ? "var(--green)" : "var(--nav-accent)",
                      }}
                      aria-label={t("referrals.actions.copyLink")}
                    >
                      {copied === l.id ? <Check size={13} /> : <Copy size={13} />}
                      <span className="text-[11px] font-bold">
                        {copied === l.id ? t("referrals.actions.copied") : t("referrals.actions.copy")}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Attributed clients */}
          <SectionHeader icon={Users} label={`${t("referrals.sections.attributedClients")} (${attributions.length})`} />
          <div className="px-4 sm:px-6 space-y-1.5">
            {attributions.length === 0 ? (
              <Empty label={t("referrals.empty.noClients")} />
            ) : attributions.slice(0, 50).map((a) => {
              const age = daysSince(a.last_payment_at);
              const isNear = a.last_payment_at && age >= 75 && age < 90 && a.attribution_status === "active";
              const status = a.attribution_status === "reallocated" ? "reallocated" : isNear ? "reset_available" : a.attribution_status;
              return (
                <div key={a.id} className="rounded-lg p-2.5 card-elevated">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                        {a.client_name}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                        → {a.owner_name} · {t("referrals.fields.attributedOn")}: {fmtDate(a.created_at, isEs)}
                      </div>
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                        {t("referrals.fields.lastPaid")}: {fmtDate(a.last_payment_at, isEs)} · {t("referrals.fields.totalProduction")}: {fmtMoney(a.total_production_cents || 0)}
                      </div>
                    </div>
                    <StatusPill status={status} t={t} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reset-soon */}
          <SectionHeader icon={Clock} label={`${t("referrals.sections.nearReset")} (${resetSoon.length})`} />
          <p className="px-4 sm:px-6 text-[10.5px] leading-snug -mt-1 mb-2" style={{ color: "var(--text-tertiary)" }}>
            {t("referrals.notes.nearReset")}
          </p>
          <div className="px-4 sm:px-6 space-y-1.5">
            {resetSoon.length === 0 ? (
              <Empty label={t("referrals.empty.noNearReset")} />
            ) : resetSoon.map((a) => (
              <div key={a.id} className="rounded-lg p-2.5 card-elevated">
                <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {a.client_name}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  {t("referrals.fields.lastPaid")}: {fmtDate(a.last_payment_at, isEs)} · → {a.owner_name}
                </div>
              </div>
            ))}
          </div>

          {/* Reallocated */}
          <SectionHeader icon={RotateCcw} label={`${t("referrals.sections.reallocated")} (${reallocated.length})`} />
          <div className="px-4 sm:px-6 space-y-1.5">
            {reallocated.length === 0 ? (
              <Empty label={t("referrals.empty.noReallocations")} />
            ) : reallocated.map((a) => (
              <div key={a.id} className="rounded-lg p-2.5 card-elevated">
                <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {a.client_name}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                  → {a.owner_name} · {fmtDate(a.reallocated_at, isEs)}
                </div>
              </div>
            ))}
          </div>

          {/* Activity */}
          <SectionHeader icon={Activity} label={t("referrals.sections.activity")} />
          <div className="px-4 sm:px-6 space-y-1.5">
            {activity.length === 0 ? (
              <Empty label={t("referrals.empty.noActivity")} />
            ) : activity.map((e) => (
              <div key={e.id} className="rounded-lg p-2.5 card-elevated">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {humanizeEvent(e.event_type, t)}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {fmtDate(e.created_at, isEs)}
                  </div>
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  {e.client_name ? `${e.client_name} · ` : ""}{e.owner_name ? `${e.owner_name} · ` : ""}{e.description || ""}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function humanizeEvent(eventType: string, t: (k: string) => string): string {
  const key = `referrals.events.${eventType}`;
  const translated = t(key);
  // Fallback to raw event_type if no translation exists.
  return translated === key ? eventType.replace(/_/g, " ") : translated;
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 card-elevated">
      <div className="text-[10px] uppercase font-bold" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <div className="text-[20px] font-bold mt-1" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function KpiCardSm({
  icon: Icon, label, value, accent,
}: { icon: any; label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl p-2.5 card-elevated">
      <div className="flex items-center gap-1">
        <Icon size={11} style={{ color: accent || "var(--text-tertiary)" }} />
        <div className="text-[9px] uppercase font-bold truncate" style={{ color: "var(--text-tertiary)" }}>
          {label}
        </div>
      </div>
      <div className="text-[14px] font-bold mt-1 tabular-nums" style={{ color: accent || "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 px-4 sm:px-6 mt-6 mb-2">
      <Icon size={14} style={{ color: "var(--text-tertiary)" }} />
      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </span>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg p-4 text-center text-[11px]" style={{ background: "var(--bg-elevated)", color: "var(--text-tertiary)" }}>
      {label}
    </div>
  );
}

function StatusPill({ status, t }: { status: string; t: (k: string) => string }) {
  const map: Record<string, { fg: string; key: string }> = {
    active:          { fg: "var(--green)",         key: "referrals.status.active" },
    reset_available: { fg: "var(--yellow)",        key: "referrals.status.resetAvailable" },
    reallocated:     { fg: "var(--accent-color)",  key: "referrals.status.reallocated" },
    shop_fallback:   { fg: "var(--text-tertiary)", key: "referrals.status.shopFallback" },
  };
  const s = map[status] || map.active;
  return (
    <span
      className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-pill shrink-0"
      style={{
        background: `color-mix(in srgb, ${s.fg} 15%, transparent)`,
        color: s.fg,
      }}
    >
      {t(s.key)}
    </span>
  );
}

type LinkStatusKey = "active" | "noUse" | "withReferrals" | "nearReset";
function getLinkStatusMap(): Record<LinkStatusKey, { fg: string; key: string }> {
  return {
    active:        { fg: "var(--green)",        key: "referrals.linkStatus.active" },
    noUse:         { fg: "var(--text-tertiary)", key: "referrals.linkStatus.noUse" },
    withReferrals: { fg: "var(--accent-color)", key: "referrals.linkStatus.withReferrals" },
    nearReset:     { fg: "var(--yellow)",       key: "referrals.linkStatus.nearReset" },
  };
}
function LinkStatusPill({ status, t }: { status: LinkStatusKey; t: (k: string) => string }) {
  const s = getLinkStatusMap()[status];
  return (
    <span
      className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-pill shrink-0"
      style={{
        background: `color-mix(in srgb, ${s.fg} 15%, transparent)`,
        color: s.fg,
      }}
    >
      {t(s.key)}
    </span>
  );
}
