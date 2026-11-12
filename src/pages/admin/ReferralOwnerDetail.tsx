import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Loader2, Copy, Check, ChevronLeft, ChevronRight,
  Users, Activity, Clock, RotateCcw, CreditCard, Search, Link as LinkIcon,
  CalendarDays,
} from "lucide-react";
import {
  addMonths, addWeeks, endOfMonth, endOfWeek,
  format, startOfMonth, startOfWeek, subMonths, subWeeks,
} from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MonthGrid } from "@/components/MonthGrid";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import { loadOwnerColorMap, getOwnerColor, FALLBACK_COLOR } from "@/lib/referralColors";
import { SubpageHeader } from "@/components/SubpageHeader";

type Mode = "month" | "week";

interface OwnerRow {
  id: string;
  display_name: string;
  slug: string;
  owner_type: string;
  active: boolean;
  owner_profile_id: string | null;
}

interface PaymentRow {
  id: string;
  client_id: string | null;
  amount_cents: number;
  payment_type: string;
  is_refund: boolean;
  paid_at: string;
  client_name?: string;
}

interface AttributionRow {
  id: string;
  client_id: string;
  original_referral_owner_id: string;
  current_referral_owner_id: string;
  attribution_status: string;
  created_at: string;
  last_payment_at: string | null;
  reset_available_at: string | null;
  reallocated_at: string | null;
  reallocation_reason: string | null;
  client_name?: string;
  client_phone?: string | null;
  client_email?: string | null;
  original_owner_name?: string;
  current_owner_name?: string;
}

interface ActivityRow {
  id: string;
  event_type: string;
  description: string | null;
  created_at: string;
  client_id: string | null;
  client_name?: string | null;
}

interface LinkRow {
  id: string;
  full_url: string;
  slug: string;
  status: string;
}

const fmtMoney = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    .format((cents || 0) / 100);

const fmtDate = (d: string | null | undefined, isEs: boolean) =>
  d ? new Date(d).toLocaleDateString(isEs ? "es-PR" : "en-US",
    { month: "short", day: "numeric", year: "numeric" }) : "—";

/** Compute [start, end) bounds for period in PR (UTC-4) using local Date math then ISO. */
function periodBounds(mode: Mode, anchor: Date): { start: Date; end: Date; label: string; isEs: boolean } {
  if (mode === "month") {
    const start = startOfMonth(anchor);
    const end = endOfMonth(anchor);
    return { start, end, label: "", isEs: true };
  }
  const start = startOfWeek(anchor, { weekStartsOn: 6 });
  const end = endOfWeek(anchor, { weekStartsOn: 6 });
  return { start, end, label: "", isEs: true };
}

export default function ReferralOwnerDetail() {
  const navigate = useNavigate();
  const { slug = "" } = useParams<{ slug: string }>();
  const { t, language } = useTranslation();
  const isEs = language === "es";
  const dfLocale = isEs ? esLocale : enUS;

  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState<OwnerRow | null>(null);
  const [ownerColor, setOwnerColor] = useState<string>(FALLBACK_COLOR);
  const [rank, setRank] = useState<{ name_es: string; name_en: string } | null>(null);
  const [link, setLink] = useState<LinkRow | null>(null);
  const [attributions, setAttributions] = useState<AttributionRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [lifetimeCents, setLifetimeCents] = useState(0);
  const [copied, setCopied] = useState(false);

  // Period state
  const [mode, setMode] = useState<Mode>("month");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date());

  const { start: periodStart, end: periodEnd } = useMemo(
    () => periodBounds(mode, anchor),
    [mode, anchor],
  );

  // Initial load (owner + relations not depending on period)
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: ownerData } = await (supabase as any)
        .from("referral_owners")
        .select("id,display_name,slug,owner_type,active,owner_profile_id")
        .eq("slug", slug)
        .maybeSingle();

      if (!ownerData) {
        toast.error(isEs ? "Owner no encontrado" : "Owner not found");
        navigate("/admin/referidos/interna");
        return;
      }
      const o = ownerData as OwnerRow;
      setOwner(o);
      const cmap = await loadOwnerColorMap([o]);
      setOwnerColor(getOwnerColor(cmap, o.id));

      // Link
      const { data: linkData } = await (supabase as any)
        .from("referral_links")
        .select("id,full_url,slug,status")
        .eq("referral_owner_id", o.id)
        .eq("status", "active")
        .maybeSingle();
      setLink((linkData as LinkRow) || null);

      // Attributions for this owner
      const { data: attrData } = await (supabase as any)
        .from("client_referral_attributions")
        .select("id,client_id,original_referral_owner_id,current_referral_owner_id,attribution_status,created_at,last_payment_at,reset_available_at,reallocated_at,reallocation_reason")
        .eq("current_referral_owner_id", o.id)
        .order("updated_at", { ascending: false });

      let attrRows: AttributionRow[] = (attrData as AttributionRow[]) || [];
      if (attrRows.length > 0) {
        const cIds = [...new Set(attrRows.map((a) => a.client_id))];
        const oIds = [...new Set([
          ...attrRows.map((a) => a.original_referral_owner_id),
          ...attrRows.map((a) => a.current_referral_owner_id),
        ])];
        const [cRes, oRes] = await Promise.all([
          (supabase as any).from("clients").select("id,first_name,last_name,phone,email").in("id", cIds),
          (supabase as any).from("referral_owners").select("id,display_name").in("id", oIds),
        ]);
        const cMap = new Map((cRes.data || []).map((c: any) => [
          c.id,
          {
            name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || (isEs ? "Sin nombre" : "Unnamed"),
            phone: c.phone, email: c.email,
          },
        ]));
        const oMap = new Map((oRes.data || []).map((x: any) => [x.id, x.display_name]));
        attrRows = attrRows.map((a) => {
          const c = cMap.get(a.client_id) as any;
          return {
            ...a,
            client_name: c?.name || "—",
            client_phone: c?.phone || null,
            client_email: c?.email || null,
            original_owner_name: oMap.get(a.original_referral_owner_id) as string || "—",
            current_owner_name: oMap.get(a.current_referral_owner_id) as string || "—",
          };
        });
      }
      setAttributions(attrRows);

      // Activity for this owner
      const { data: logData } = await (supabase as any)
        .from("referral_activity_log")
        .select("id,event_type,description,created_at,client_id")
        .eq("referral_owner_id", o.id)
        .order("created_at", { ascending: false })
        .limit(100);
      let logRows: ActivityRow[] = (logData as ActivityRow[]) || [];
      if (logRows.length > 0) {
        const cIds = [...new Set(logRows.map((r) => r.client_id).filter(Boolean))] as string[];
        const cRes = cIds.length
          ? await (supabase as any).from("clients").select("id,first_name,last_name").in("id", cIds)
          : { data: [] };
        const cMap = new Map((cRes.data || []).map((c: any) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()]));
        logRows = logRows.map((r) => ({ ...r, client_name: r.client_id ? (cMap.get(r.client_id) as string) || null : null }));
      }
      setActivity(logRows);

      // Lifetime production (non-tip, non-refund minus refunds)
      const { data: allPays } = await (supabase as any)
        .from("referral_payments")
        .select("amount_cents,is_tip,is_refund")
        .eq("referral_owner_id", o.id);
      let lifetime = 0;
      for (const p of (allPays as any[]) || []) {
        if (p.is_tip) continue;
        lifetime += p.is_refund ? -Math.abs(p.amount_cents || 0) : (p.amount_cents || 0);
      }
      setLifetimeCents(Math.max(0, lifetime));

      // Current rank: query monthly RPC to get the rank label
      const { data: monthlyRows } = await (supabase.rpc as any)("calculate_referral_production", { _window: "monthly" });
      const myRow = ((monthlyRows as any[]) || []).find((r) => r.referral_owner_id === o.id);
      if (myRow?.rank_name_es) setRank({ name_es: myRow.rank_name_es, name_en: myRow.rank_name_en });

      setLoading(false);
    })();
  }, [slug, isEs, navigate]);

  // Period-bound payments
  useEffect(() => {
    if (!owner) return;
    (async () => {
      const startIso = periodStart.toISOString();
      const endIso = periodEnd.toISOString();
      const { data: payData } = await (supabase as any)
        .from("referral_payments")
        .select("id,client_id,amount_cents,payment_type,is_refund,is_tip,paid_at")
        .eq("referral_owner_id", owner.id)
        .eq("is_tip", false)
        .gte("paid_at", startIso)
        .lte("paid_at", endIso)
        .order("paid_at", { ascending: false });
      let rows: PaymentRow[] = (payData as PaymentRow[]) || [];
      if (rows.length > 0) {
        const cIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[];
        const cRes = cIds.length
          ? await (supabase as any).from("clients").select("id,first_name,last_name").in("id", cIds)
          : { data: [] };
        const cMap = new Map((cRes.data || []).map((c: any) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()]));
        rows = rows.map((r) => ({ ...r, client_name: r.client_id ? (cMap.get(r.client_id) as string) || "—" : "—" }));
      }
      setPayments(rows);
    })();
  }, [owner, periodStart, periodEnd]);

  const periodCents = useMemo(() => {
    let net = 0;
    for (const p of payments) net += p.is_refund ? -Math.abs(p.amount_cents) : p.amount_cents;
    return Math.max(0, net);
  }, [payments]);

  const periodLabel = useMemo(() => {
    if (mode === "month") return format(anchor, "LLLL yyyy", { locale: dfLocale });
    return `${format(periodStart, "d MMM", { locale: dfLocale })} - ${format(periodEnd, "d MMM", { locale: dfLocale })}`;
  }, [mode, anchor, periodStart, periodEnd, dfLocale]);

  const resetSoon = useMemo(() => {
    const now = Date.now();
    return attributions.filter((a) => {
      if (!a.last_payment_at || a.attribution_status !== "active") return false;
      const ageDays = (now - new Date(a.last_payment_at).getTime()) / 86400000;
      return ageDays >= 75 && ageDays < 90;
    });
  }, [attributions]);

  const reallocated = useMemo(
    () => attributions.filter((a) => a.attribution_status === "reallocated"),
    [attributions],
  );

  // Referred clients filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const referredClients = useMemo(() => {
    const inPeriodIds = new Set<string>();
    for (const p of payments) if (p.client_id) inPeriodIds.add(p.client_id);
    return attributions
      .filter((a) => (statusFilter === "all" ? true : a.attribution_status === statusFilter))
      .filter((a) => !search.trim() || (a.client_name || "").toLowerCase().includes(search.toLowerCase()))
      .map((a) => {
        const daysToReset = a.last_payment_at
          ? Math.max(0, 90 - Math.floor((Date.now() - new Date(a.last_payment_at).getTime()) / 86400000))
          : null;
        const monthlyForClient = payments
          .filter((p) => p.client_id === a.client_id)
          .reduce((s, p) => s + (p.is_refund ? -Math.abs(p.amount_cents) : p.amount_cents), 0);
        return { ...a, daysToReset, monthlyCents: Math.max(0, monthlyForClient), inPeriod: inPeriodIds.has(a.client_id) };
      });
  }, [attributions, payments, search, statusFilter]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(isEs ? "Copiado" : "Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const goPrev = () => setAnchor((a) => (mode === "month" ? subMonths(a, 1) : subWeeks(a, 1)));
  const goNext = () => setAnchor((a) => (mode === "month" ? addMonths(a, 1) : addWeeks(a, 1)));
  const goToday = () => setAnchor(new Date());

  if (loading || !owner) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 overflow-x-hidden" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title={owner.display_name}
        titleColor={ownerColor}
        onBack={() => navigate("/admin/referidos/interna")}
        subtitle={`/r/${owner.slug} · ${owner.owner_type}`}
        actions={
          rank ? (
            <span
              className="shrink-0 text-[10px] font-bold uppercase px-2 py-1 rounded-full"
              style={{ background: "var(--accent-dim)", color: "var(--nav-accent)" }}
            >
              {isEs ? rank.name_es : rank.name_en}
            </span>
          ) : null
        }
      />



      {/* Period controls */}
      <div className="px-4 sm:px-6 mt-1 space-y-2">
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--bg-elevated)" }}>
          {(["month", "week"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 text-[12px] font-semibold py-1.5 rounded-md transition"
              style={{
                background: mode === m ? "var(--bg-base)" : "transparent",
                color: mode === m ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {t(m === "month" ? "referrals.actions.month" : "referrals.actions.week")}
            </button>
          ))}
        </div>

        <div className="relative flex items-center justify-between rounded-lg p-2" style={{ background: "var(--bg-elevated)" }}>
          <Popover open={pickerOpen} onOpenChange={(o) => { setPickerOpen(o); if (o) setPickerMonth(anchor); }}>
            <PopoverTrigger asChild>
              <button className="p-1" aria-label="Pick date">
                <CalendarDays size={18} style={{ color: "var(--accent-color)" }} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0 z-50"
              align="start"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)" }}
            >
              <MonthGrid
                monthDate={pickerMonth}
                selectedDate={anchor}
                onSelectDate={(d) => { setAnchor(d); setPickerOpen(false); }}
                onChangeMonth={setPickerMonth}
                language={language}
              />
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2">
            <button onClick={goPrev} className="p-1" aria-label={t("referrals.actions.prev")}>
              <ChevronLeft size={18} style={{ color: "var(--accent-color)" }} />
            </button>
            <span className="text-[13px] font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
              {periodLabel}
            </span>
            <button onClick={goNext} className="p-1" aria-label={t("referrals.actions.next")}>
              <ChevronRight size={18} style={{ color: "var(--accent-color)" }} />
            </button>
          </div>

          <button
            onClick={goToday}
            className="px-3 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
          >
            {t("referrals.actions.today")}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="px-4 sm:px-6 mt-3 grid grid-cols-2 gap-2.5">
        <Kpi label={t("referrals.metrics.production")} value={fmtMoney(periodCents)} accent={ownerColor} />
        <Kpi label={t("referrals.metrics.payments")} value={String(payments.length)} accent={ownerColor} />
        <Kpi label={t("referrals.metrics.attributedClients")} value={String(attributions.length)} accent={ownerColor} />
        <Kpi label={t("referrals.metrics.lifetime")} value={fmtMoney(lifetimeCents)} accent={ownerColor} />
      </div>

      {/* Active link */}
      <SectionHeader icon={LinkIcon} label={t("referrals.sections.activeLinks")} />
      <div className="px-4 sm:px-6">
        {link ? (
          <div
            className="rounded-xl p-3 card-elevated flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                {link.full_url}
              </div>
            </div>
            <button
              onClick={() => copy(link.full_url)}
              className="p-2 rounded-lg"
              style={{ background: "var(--bg-elevated)" }}
              aria-label={t("referrals.actions.copyLink")}
            >
              {copied
                ? <Check size={14} style={{ color: "#22c55e" }} />
                : <Copy size={14} style={{ color: "var(--text-secondary)" }} />}
            </button>
          </div>
        ) : (
          <Empty label={t("referrals.empty.noResults")} />
        )}
      </div>

      {/* Referred clients with search + filter */}
      <SectionHeader icon={Users} label={`${t("referrals.sections.referredClients")} (${referredClients.length})`} />
      <div className="px-4 sm:px-6 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-elevated)" }}>
            <Search size={14} style={{ color: "var(--text-tertiary)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("referrals.actions.search")}
              className="flex-1 bg-transparent outline-none text-[13px]"
              style={{ color: "var(--text-primary)" }}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg px-2 text-[12px]"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "none" }}
          >
            <option value="all">{t("referrals.status.all")}</option>
            <option value="active">{t("referrals.status.active")}</option>
            <option value="reset_available">{t("referrals.status.resetAvailable")}</option>
            <option value="reallocated">{t("referrals.status.reallocated")}</option>
          </select>
        </div>

        {referredClients.length === 0 ? (
          <Empty label={t("referrals.empty.noClients")} />
        ) : referredClients.map((c) => (
          <div key={c.id} className="rounded-lg p-3 card-elevated">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {c.client_name}
                </div>
                <div className="text-[10px] truncate" style={{ color: "var(--text-secondary)" }}>
                  {c.client_phone || c.client_email || "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }}>
                  {fmtMoney(c.monthlyCents)}
                </div>
                {c.daysToReset !== null && (
                  <div className="text-[9px]" style={{ color: c.daysToReset < 15 ? "#f59e0b" : "var(--text-tertiary)" }}>
                    {c.daysToReset}d · {t("referrals.fields.daysToReset")}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-1.5 text-[10px] flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: "var(--text-secondary)" }}>
              <span>{t("referrals.fields.originalOwner")}: {c.original_owner_name}</span>
              <span>{t("referrals.fields.currentOwner")}: {c.current_owner_name}</span>
              <span>{t("referrals.fields.firstReferral")}: {fmtDate(c.created_at, isEs)}</span>
              <span>{t("referrals.fields.lastPaid")}: {fmtDate(c.last_payment_at, isEs)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Payments */}
      <SectionHeader icon={CreditCard} label={`${t("referrals.sections.payments")} (${payments.length})`} />
      <div className="px-4 sm:px-6 space-y-1.5">
        {payments.length === 0 ? (
          <Empty label={t("referrals.empty.noPayments")} />
        ) : payments.slice(0, 50).map((p) => (
          <div key={p.id} className="rounded-lg p-2.5 card-elevated flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                {p.client_name}
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                {fmtDate(p.paid_at, isEs)} · {p.payment_type}{p.is_refund ? " · refund" : ""}
              </div>
            </div>
            <div className="text-[13px] font-bold" style={{ color: p.is_refund ? "#ef4444" : "var(--text-primary)" }}>
              {p.is_refund ? "-" : ""}{fmtMoney(Math.abs(p.amount_cents))}
            </div>
          </div>
        ))}
      </div>

      {/* Reset risk */}
      <SectionHeader icon={Clock} label={`${t("referrals.sections.nearReset")} (${resetSoon.length})`} />
      <div className="px-4 sm:px-6 space-y-1.5">
        {resetSoon.length === 0 ? (
          <Empty label={t("referrals.empty.noNearReset")} />
        ) : resetSoon.map((a) => (
          <div key={a.id} className="rounded-lg p-2.5 card-elevated">
            <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{a.client_name}</div>
            <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              {t("referrals.fields.lastPaid")}: {fmtDate(a.last_payment_at, isEs)}
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
            <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{a.client_name}</div>
            <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              {fmtDate(a.reallocated_at, isEs)} · {a.reallocation_reason || "—"}
            </div>
          </div>
        ))}
      </div>

      {/* Activity log */}
      <SectionHeader icon={Activity} label={t("referrals.sections.activity")} />
      <div className="px-4 sm:px-6 space-y-1.5">
        {activity.length === 0 ? (
          <Empty label={t("referrals.empty.noActivity")} />
        ) : activity.map((e) => (
          <div key={e.id} className="rounded-lg p-2.5 card-elevated">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>{e.event_type}</div>
              <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{fmtDate(e.created_at, isEs)}</div>
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {e.client_name ? `${e.client_name} · ` : ""}{e.description || ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl p-3 card-elevated" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="text-[10px] uppercase font-bold" style={{ color: "var(--text-tertiary)" }}>{label}</div>
      <div className="text-[18px] font-bold mt-1" style={{ color: "var(--text-primary)" }}>{value}</div>
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
