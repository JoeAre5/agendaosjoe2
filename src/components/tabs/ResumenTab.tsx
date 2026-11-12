import { useEffect, useState, useMemo } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { HomePeriodBanner } from "@/components/reports/HomePeriodBanner";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";
import { useAuth } from "@/hooks/useAuth";
import { useHomePeriod } from "@/hooks/useHomePeriod";
import { readAllReportRows } from "@/lib/reportPagination";
import { Button } from "@/components/ui/button";
import { periodGoalCents, prorateWeeklyCents, prRangeTimestamps, prToday } from "@/lib/homePeriods";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CalendarCheck,
  CreditCard,
  Crown,
  Loader2,
  Minus,
  Wallet,
  Coins,
  Target,
  CircleCheckBig,
  Receipt,
  Plus,
} from "lucide-react";
import { startOfWeek, format } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { AnimatedCurrency, AnimatedNumber, AnimatedBar } from "./AnimatedStats";
import {
  buildUnifiedProduction,
  sumProduction,
  sumTips,
  groupByPaymentMethod,
  groupTipsByPm,
  type RawAppointment,
  type RawTransaction,
} from "@/lib/unifiedProduction";
import { ShopServiceSummaryCard } from "@/components/reports/ShopServiceSummaryCard";
import { RetentionChallengeCard } from "@/components/reports/RetentionChallengeCard";

import { OperationalExpenseDialog, type OperationalExpense } from "@/components/reports/OperationalExpenseDialog";
import { homeProfitLoss, homeServiceFees, type FeeTransaction } from "@/lib/homeFinancials";
import { homeExpenseBreakdown, frequencyLabel } from "@/lib/operationalExpenses";
import { HomeCardLayout } from "@/components/reports/HomeCardLayout";
import type { HomeCardId } from "@/lib/homeCardLayout";
import { homeBarberContribution, type RankingProductSale, type RankingTransaction } from "@/lib/homeBarberContribution";

/* ─── helpers ─── */
const fmt = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const pct = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

interface BarberFull {
  id: string; name: string; color: string | null;
  employment_type: string; commission_rate: number | null;
  retention_rate: number | null; weekly_salary: number | null;
}
interface Appointment {
  id: string; barber_id: string; starts_at: string; status: string;
  created_by_role?: string | null;
}

export function ResumenTab() {
  const { language } = usePreferences();
  const { user, isOwner } = useAuth();
  const es = language === "es";

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [barbers, setBarbers] = useState<BarberFull[]>([]);
  // Unified data: appointments + transactions, this week + last year
  const [apptsThisWeekFull, setApptsThisWeekFull] = useState<RawAppointment[]>([]);
  const [txThisWeekFull, setTxThisWeekFull] = useState<RawTransaction[]>([]);
  const [rankingProducts, setRankingProducts] = useState<RankingProductSale[]>([]);
  const [rankingError, setRankingError] = useState(false);
  const [apptsLastYearFull, setApptsLastYearFull] = useState<RawAppointment[]>([]);
  const [txLastYearFull, setTxLastYearFull] = useState<RawTransaction[]>([]);
  const [apptsThisWeek, setApptsThisWeek] = useState<Appointment[]>([]);
  const [apptsLastYear, setApptsLastYear] = useState<Appointment[]>([]);
  const [userFirstName, setUserFirstName] = useState("");
  const [digitalFeeRate, setDigitalFeeRate] = useState(0.10);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [manualExpenses, setManualExpenses] = useState<OperationalExpense[]>([]);
  const [goalTargetCents, setGoalTargetCents] = useState<number | null>(null);

  const selection = useHomePeriod();
  const { period, start: weekStart, end: weekEnd, comparisonStart: lyStart, comparisonEnd: lyEnd } = selection;
  const now = prToday();
  const currentTimestamps = prRangeTimestamps(weekStart, weekEnd);
  const comparisonTimestamps = prRangeTimestamps(lyStart, lyEnd);
  const periodLabel = es
    ? ({ day: "diaria", week: "semanal", month: "mensual" }[period])
    : ({ day: "Daily", week: "Weekly", month: "Monthly" }[period]);
  const periodNoun = es ? ({ day: "del día", week: "de la semana", month: "del mes" }[period])
    : ({ day: "today", week: "this week", month: "this month" }[period]);
  const comparisonLabel = `${format(lyStart, "d MMM yyyy", { locale: es ? esLocale : undefined })}${period === "day" ? "" : ` - ${format(lyEnd, "d MMM yyyy", { locale: es ? esLocale : undefined })}`}`;

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.full_name) setUserFirstName(data.full_name.split(" ")[0]); });
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      try {
      const apptCols = "id,barber_id,starts_at,status,paid,price_cents,tip_cents,amount_paid_cents,payment_method,notes,created_by_role,service_name";
      const txCols = "id,barber_id,appointment_id,created_at,status,payment_method,subtotal_cents,tip_cents,total_cents,gateway_fee_cents,type";
      const { data: contexts, error: contextError } = await supabase.rpc("get_home_expense_context");
      const expenseContext = contexts?.[0];
      if (contextError || !expenseContext) throw contextError ?? new Error("No expense context");
      const [bRes, apFullRes, txFullRes, apLyFullRes, txLyFullRes, sRes, goalRes, manualRes, productsRes] = await Promise.all([
        // SECURITY: Sensitive payroll columns are not directly readable; fetch via SECURITY DEFINER RPC.
        (supabase.rpc as any)("get_barbers_payroll"),
        readAllReportRows((from, to) => supabase.from("appointments").select(apptCols)
          .neq("status", "cancelled")
          .gte("starts_at", currentTimestamps.start).lte("starts_at", currentTimestamps.end).order("id").range(from, to)),
        readAllReportRows((from, to) => supabase.from("transactions").select(txCols)
          .eq("status", "completed").gte("created_at", currentTimestamps.start).lte("created_at", currentTimestamps.end).order("id").range(from, to)),
        readAllReportRows((from, to) => supabase.from("appointments").select(apptCols)
          .neq("status", "cancelled")
          .gte("starts_at", comparisonTimestamps.start).lte("starts_at", comparisonTimestamps.end).order("id").range(from, to)),
        readAllReportRows((from, to) => supabase.from("transactions").select(txCols)
          .eq("status", "completed").gte("created_at", comparisonTimestamps.start).lte("created_at", comparisonTimestamps.end).order("id").range(from, to)),
        // digital_fee_rate is sensitive financial config — owner-only RPC
        (supabase.rpc as any)("get_shop_financial_config").then((r: any) => ({
          data: r.data?.[0] || null,
          error: r.error,
        })),
        supabase.from("production_goals" as any)
          .select("week_start,target_cents")
          .is("barber_id", null)
          .gte("week_start", format(startOfWeek(weekStart, { weekStartsOn: 6 }), "yyyy-MM-dd"))
          .lte("week_start", format(weekEnd, "yyyy-MM-dd")),
        readAllReportRows((from, to) => supabase.from("operational_expenses").select("*")
          .eq("shop_id", expenseContext.shop_id).eq("is_active", true)
          .order("expense_date").order("id").range(from, to)),
        readAllReportRows((from, to) => supabase.from("product_sales")
          .select("item_id,transaction_id,revenue_cents")
          .gte("created_at", currentTimestamps.start).lte("created_at", currentTimestamps.end)
          .order("item_id").range(from, to)),
      ]);
      if (cancelled) return;
      if ([bRes, apFullRes, txFullRes, apLyFullRes, txLyFullRes, sRes, goalRes, manualRes].some(result => result.error)) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setManualExpenses((manualRes.data || []) as OperationalExpense[]);
      setRankingError(Boolean(productsRes.error));
      setRankingProducts(productsRes.error ? [] : (productsRes.data || []) as RankingProductSale[]);
      setBarbers((bRes.data as BarberFull[]) || []);
      const apFull = (apFullRes.data as RawAppointment[]) || [];
      const apLyFull = (apLyFullRes.data as RawAppointment[]) || [];
      setApptsThisWeekFull(apFull);
      setTxThisWeekFull((txFullRes.data as RawTransaction[]) || []);
      setApptsLastYearFull(apLyFull);
      setTxLastYearFull((txLyFullRes.data as RawTransaction[]) || []);
      // Appointment count card uses the lighter shape (for both this-week and last-year)
      const toLite = (a: any): Appointment => ({ id: a.id, barber_id: a.barber_id, starts_at: a.starts_at, status: a.status, created_by_role: a.created_by_role ?? null });
      setApptsThisWeek(apFull.filter(a => a.status !== "cancelled" && a.status !== "canceled").map(toLite));
      setApptsLastYear(apLyFull.filter(a => a.status !== "cancelled" && a.status !== "canceled").map(toLite));
      if (sRes.data?.digital_fee_rate) setDigitalFeeRate(sRes.data.digital_fee_rate);
      setGoalTargetCents(periodGoalCents((goalRes.data as unknown as { week_start: string; target_cents: number }[]) || [], weekStart, weekEnd));
      setLoading(false);
      } catch {
        if (!cancelled) { setLoadError(true); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [currentTimestamps.start, currentTimestamps.end, comparisonTimestamps.start, comparisonTimestamps.end, reload, es]);

  /* ─── Unified production rows (no double-counting) ─── */
  const rowsThisWeek = useMemo(
    () => buildUnifiedProduction(apptsThisWeekFull, txThisWeekFull),
    [apptsThisWeekFull, txThisWeekFull]
  );
  const rowsLastYear = useMemo(
    () => buildUnifiedProduction(apptsLastYearFull, txLastYearFull),
    [apptsLastYearFull, txLastYearFull]
  );

  /* ─── Computed ─── */
  const productionThisWeek = useMemo(() => sumProduction(rowsThisWeek), [rowsThisWeek]);
  const productionLastYear = useMemo(() => sumProduction(rowsLastYear), [rowsLastYear]);
  const tipsThisWeek = useMemo(() => sumTips(rowsThisWeek), [rowsThisWeek]);
  const diffCents = productionThisWeek - productionLastYear;
  const diffPct = pct(productionThisWeek, productionLastYear);
  const isUp = diffCents >= 0;

  // Appointments — YoY comparison (this week vs same week last year)
  const totalAppts = apptsThisWeek.length;
  const lastYearAppts = apptsLastYear.length;
  const apptDiff = totalAppts - lastYearAppts;
  const apptPctDiff = pct(totalAppts, lastYearAppts);

  // Booking source breakdown by created_by_role:
  //   null         → Acuity (imported, no app role stamped)
  //   "admin"      → Admin app (owner-created)
  //   "barber"     → Barber app
  //   "public_site"→ Public website
  //   "client_app" → Client mobile app
  const sourceBreakdown = useMemo(() => {
    const counts = { acuity: 0, admin: 0, barber: 0, web: 0, app: 0 };
    apptsThisWeek.forEach((a) => {
      const role = a.created_by_role;
      if (!role) counts.acuity += 1;
      else if (role === "admin") counts.admin += 1;
      else if (role === "barber") counts.barber += 1;
      else if (role === "public_site") counts.web += 1;
      else if (role === "client_app") counts.app += 1;
      else counts.acuity += 1; // unknown role → treat as external
    });
    return counts;
  }, [apptsThisWeek]);

  // Payment methods (uses unified rows so walk-ins + paid appts both count)
  const paymentBreakdown = useMemo(() => groupByPaymentMethod(rowsThisWeek), [rowsThisWeek]);
  const totalCollected = Object.values(paymentBreakdown).reduce((a, b) => a + b, 0);

  // Tips breakdown by payment method
  const tipsBreakdown = useMemo(() => groupTipsByPm(rowsThisWeek), [rowsThisWeek]);

  // Admin-only service contribution; does not feed Home totals, payroll or reports.
  const barberRanking = useMemo(() => {
    if (rankingError) return [];
    return homeBarberContribution(barbers, rowsThisWeek, txThisWeekFull as RankingTransaction[],
      rankingProducts, digitalFeeRate, weekStart, weekEnd);
  }, [rowsThisWeek, barbers, txThisWeekFull, rankingProducts, rankingError, digitalFeeRate, currentTimestamps.start, currentTimestamps.end]);

  const serviceFees = useMemo(() => homeServiceFees(rowsThisWeek, txThisWeekFull as FeeTransaction[], digitalFeeRate), [rowsThisWeek, txThisWeekFull, digitalFeeRate]);
  const expenseBreakdown = useMemo(() => homeExpenseBreakdown(manualExpenses, weekStart, weekEnd), [manualExpenses, weekStart, weekEnd]);
  const fixedExpenseCents = expenseBreakdown.recurringCents;
  const manualExpenseCents = expenseBreakdown.onceCents;

  // ─── Nómina Estimada (uses unified rows from useReportData) ───
  const nominaData = useMemo(() => {
    const pBarbers = barbers;
    const pRows = rowsThisWeek;
    const dRate = digitalFeeRate;

    // Build per-barber cash/digital from unified rows (no double-count, prefers receipt amounts)
    const barberMap = new Map<string, { id: string; name: string; color: string | null; cash: number; digital: number; employment_type: string; commission_rate: number | null; retention_rate: number | null; weekly_salary: number | null }>();
    pBarbers.forEach((b: any) => barberMap.set(b.id, { id: b.id, name: b.name, color: b.color || null, cash: 0, digital: 0, employment_type: b.employment_type, commission_rate: b.commission_rate, retention_rate: b.retention_rate, weekly_salary: b.weekly_salary }));

    pRows.forEach((r) => {
      const e = barberMap.get(r.barber_id);
      if (!e) return;
      if (r.pm === "digital") e.digital += r.subtotal_cents; else e.cash += r.subtotal_cents;
    });

    // Commission barbers
    const commissionBarbers = Array.from(barberMap.values())
      .filter(b => b.employment_type === "commission")
      .map(b => {
        const gross = b.cash + b.digital;
        const digitalFeeAmt = serviceFees.byBarber[b.id] ?? 0;
        const production = gross - digitalFeeAmt;
        const commRate = b.commission_rate ?? 0.65;
        const retRate = b.retention_rate || 0;
        const preNet = Math.round(production * commRate);
        const retention = Math.round(preNet * retRate);
        const netPayout = preNet - retention;
        return { id: b.id, name: b.name, color: b.color, gross, digitalFee: digitalFeeAmt, netProduction: production, commRate, retRate, commission: preNet, retention, netPayout };
      })
      .sort((a, b) => b.gross - a.gross);

    // Charlie (W-2 Fixed)
    const charlieEntry = Array.from(barberMap.values()).find(b => b.employment_type === "w2_fixed");
    let charlieData: typeof commissionBarbers[0] | null = null;
    if (charlieEntry) {
      const gross = charlieEntry.cash + charlieEntry.digital;
      const digitalFeeAmt = serviceFees.byBarber[charlieEntry.id] ?? 0;
      const w2Gross = prorateWeeklyCents(charlieEntry.weekly_salary ?? 57000, weekStart, weekEnd);
      const deductions = Math.round(w2Gross * (0.062 + 0.0145 + 0.04 + 0.003));
      const netPayout = w2Gross - deductions;
      charlieData = { id: charlieEntry.id, name: charlieEntry.name, color: charlieEntry.color, gross, digitalFee: digitalFeeAmt, netProduction: gross - digitalFeeAmt, commRate: 0, retRate: 0, commission: w2Gross, retention: deductions, netPayout };
    }

    // Variable W-2 is disabled in existing payroll; no new payout rule is introduced.
    const yvetteGross = 0;
    const yvetteNet = 0;
    const yvetteBarber = Array.from(barberMap.values()).find(b => b.employment_type === "w2_variable");

    const allPayouts = [
      ...(charlieData ? [charlieData] : []),
      ...commissionBarbers,
    ];
    const totalPayouts = allPayouts.reduce((s, b) => s + b.netPayout, 0) + yvetteNet;

    // Production for this payroll week
    const payrollProduction = Array.from(barberMap.values()).reduce((s, b) => s + b.cash + b.digital, 0);
    const businessRetention = payrollProduction - serviceFees.totalCents - allPayouts.reduce((sum, b) => sum + b.commission, 0);

    return { commissionBarbers, charlieData, allPayouts, totalPayouts, businessRetention, yvetteBarber: yvetteBarber ? { name: yvetteBarber.name, color: yvetteBarber.color } : null, yvetteNet, yvetteGross };
  }, [barbers, rowsThisWeek, digitalFeeRate, serviceFees, currentTimestamps.start, currentTimestamps.end]);

  const financials = homeProfitLoss(productionThisWeek, serviceFees.totalCents,
    nominaData.charlieData?.commission ?? 0,
    nominaData.commissionBarbers.reduce((sum, barber) => sum + barber.commission, 0),
    fixedExpenseCents, manualExpenseCents);
  const reservePeriodLabel = es
    ? ({ day: "Para el día seleccionado", week: "Para la semana seleccionada", month: "Para el mes seleccionado" }[period])
    : ({ day: "For the selected day", week: "For the selected week", month: "For the selected month" }[period]);
  const totalReserveCents = financials.personnel + financials.expenses;
  const totalCostCents = serviceFees.totalCents + totalReserveCents;

  /* ─── Shared UI ─── */
  const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
    <div className={`rounded-2xl p-5 mb-4 card-elevated ${className}`}>
      {children}
    </div>
  );

  const SectionLabel = ({ icon: Icon, label }: { icon: React.ElementType; label: string }) => (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} style={{ color: "var(--accent-color)" }} />
      <span className="text-xs font-bold uppercase tracking-wider"
        style={{ color: "var(--text-tertiary)", letterSpacing: "0.5px" }}>{label}</span>
    </div>
  );

  const paymentMethods = [
    { key: "athmovil", label: "ATH Móvil" },
    { key: "cash", label: es ? "Efectivo" : "Cash" },
    { key: "stripe", label: es ? "Tarjeta" : "Card" },
    { key: "paypal", label: "PayPal" },
  ];

  // Signature gray for progress-bar fills; beige accent reserved for the leading item.
  const BAR_GRAY = "var(--text-tertiary)";
  const BAR_ACCENT = "var(--accent-color)";

  // Week is "in progress" if today is within the week range
  const weekInProgress = now >= weekStart && now <= weekEnd;

  const homeCards: Record<HomeCardId, React.ReactNode> = {
    profit: (
      <div className="rounded-2xl p-5 mb-4 card-portal-hero">
        <SectionLabel icon={TrendingUp} label={es ? "Cuadre y Profit & Loss" : "Business Profit & Loss"} />
        <p className={`text-3xl font-black ${financials.profit >= 0 ? "text-[var(--green)]" : "text-destructive"}`}><AnimatedCurrency cents={financials.profit} /></p>
        <div className="flex justify-between gap-2 mt-1 text-xs text-muted-foreground"><span>{financials.profit >= 0 ? (es ? "Profit del negocio" : "Business profit") : (es ? "Déficit / En pérdida" : "Deficit / Loss")}</span><span>{es ? "Margen" : "Margin"}: {financials.margin === null ? "N/A" : `${financials.margin.toFixed(1)}%`}</span></div>
        <div className="mt-4 space-y-2 text-sm">
          {[
            [es ? "Ingreso bruto" : "Gross income", productionThisWeek],
            [es ? "Fees de servicios" : "Service fees", -serviceFees.totalCents],
            [es ? "Ingreso neto" : "Net income", financials.netIncome],
            [es ? "Salario W-2 bruto" : "Gross W-2 salary", -(nominaData.charlieData?.commission ?? 0)],
            [es ? "Comisiones ganadas" : "Earned commissions", -nominaData.commissionBarbers.reduce((sum, b) => sum + b.commission, 0)],
          ].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-3 text-foreground"><span>{label}</span><span className="font-semibold whitespace-nowrap">{fmt(Number(amount))}</span></div>)}
          {expenseBreakdown.rows.map(expense => <div key={expense.id} className="flex justify-between gap-3 text-foreground"><span className="min-w-0 break-words">{expense.title}</span><span className="font-semibold whitespace-nowrap">{fmt(-expense.period_cents)}</span></div>)}
          <div className="divider-hairline" />
          <div className="flex justify-between gap-3 text-foreground">
            <span>{es ? "Costos totales" : "Total costs"}</span>
            <span className="font-semibold whitespace-nowrap text-destructive">{fmt(totalCostCents)}</span>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{es ? "Incluye fees de servicios, nómina y gastos operativos." : "Includes service fees, payroll and operating expenses."}</p>
        <p className="text-[11px] text-muted-foreground mt-3">{es ? "Estimado del período, sin propinas" : "Period estimate, excluding tips"}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{es ? "Fees reales" : "Actual fees"}: {fmt(serviceFees.actualCents)} · {es ? "estimados" : "estimated"}: {fmt(serviceFees.estimatedCents)}</p>
        <section aria-label={es ? "Reservas y costos del período" : "Period reserves and costs"} className="mt-5">
          <div className="divider-hairline" />
          <h3 className="mt-5 text-base font-bold text-foreground">{es ? "Fondos a reservar" : "Funds to set aside"}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{reservePeriodLabel}</p>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between items-start gap-4">
              <dt className="min-w-0 text-foreground">{es ? "Reserva operativa" : "Operating reserve"}</dt>
              <dd className="shrink-0 font-semibold tabular-nums text-foreground">{fmt(financials.expenses)}</dd>
            </div>
            <div>
              <div className="flex justify-between items-start gap-4">
                <dt className="min-w-0 font-semibold text-foreground">{es ? "Reserva para nómina" : "Payroll reserve"}</dt>
                <dd className="shrink-0 font-semibold tabular-nums text-foreground">{fmt(financials.personnel)}</dd>
              </div>
              <dl className="mt-3 space-y-3 pl-3 text-xs text-muted-foreground">
                <div className="flex justify-between items-start gap-4">
                  <dt className="min-w-0">{es ? "Comisiones" : "Commissions"}</dt>
                  <dd className="shrink-0 tabular-nums">{fmt(nominaData.commissionBarbers.reduce((sum, barber) => sum + barber.commission, 0))}</dd>
                </div>
                <div className="flex justify-between items-start gap-4">
                  <dt className="min-w-0">{es ? "Salarios W-2" : "W-2 wages"}</dt>
                  <dd className="shrink-0 tabular-nums">{fmt(nominaData.charlieData?.commission ?? 0)}</dd>
                </div>
              </dl>
            </div>
            <div className="flex justify-between items-start gap-4 pt-1 text-base font-bold text-foreground">
              <dt className="min-w-0">{es ? "Total a reservar" : "Total to set aside"}</dt>
              <dd className="shrink-0 tabular-nums">{fmt(totalReserveCents)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{es ? "Reserva estimada, no saldo pendiente. Nómina bruta, sin propinas ni cargas patronales adicionales." : "Estimated reserve, not an unpaid balance. Gross payroll, excluding tips and additional employer charges."}</p>
        </section>
      </div>
    ),
    expenses: (
      <Card className="!pb-8">
        <SectionLabel icon={Receipt} label={es ? `Gastos ${periodNoun}` : `${periodLabel} expenses`} />
        <p className="text-2xl font-black text-foreground">{fmt(financials.expenses)}</p><p className="text-xs text-muted-foreground mt-1">{es ? `A separar ${periodNoun}` : `Set aside ${periodNoun}`}</p>
        {expenseBreakdown.rows.length === 0 ? <p className="text-xs text-muted-foreground mt-4">{es ? "Sin gastos en este período" : "No expenses in this period"}</p> : <div className="mt-4 space-y-3">{expenseBreakdown.rows.map(expense => <div key={expense.id} className="flex justify-between gap-3 text-sm border-b border-border pb-3"><div className="min-w-0"><p className="text-foreground font-semibold break-words">{expense.title}</p><p className="text-xs text-muted-foreground mt-1">{frequencyLabel(expense.frequency, es)}{expense.frequency === "once" ? ` · ${expense.expense_date}` : ` · ${fmt(expense.amount_cents)}`}</p>{expense.description && <p className="text-xs text-muted-foreground mt-1 break-words">{expense.description}</p>}</div><span className="font-semibold text-foreground whitespace-nowrap">{fmt(expense.period_cents)}</span></div>)}</div>}
        <div className="mt-4"><div className="inline-flex"><Button variant="outline" size="sm" onClick={() => setExpenseDialogOpen(true)}><Plus className="h-4 w-4" />{es ? "Añadir gasto" : "Add expense"}</Button></div></div>
      </Card>
    ),
    retention: (
      <RetentionChallengeCard selection={selection} es={es} />
    ),
    production: (
      <div className="rounded-2xl p-5 mb-4 card-elevated">
        <SectionLabel icon={DollarSign} label={es ? `Producción ${periodLabel}` : `${periodLabel} Production`} />
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-black" style={{ color: "var(--text-primary)", letterSpacing: "-1px" }}>
              <AnimatedCurrency cents={productionThisWeek} />
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              {es ? "Servicios + productos (sin propinas)" : "Services + products (excl. tips)"}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              {isUp ? (
                <TrendingUp size={16} style={{ color: "var(--green)" }} />
              ) : diffCents < 0 ? (
                <TrendingDown size={16} style={{ color: "var(--red)" }} />
              ) : (
                <Minus size={16} style={{ color: "var(--text-tertiary)" }} />
              )}
              <span className="text-sm font-bold" style={{ color: isUp ? "var(--green)" : "var(--red)" }}>
                {diffPct >= 0 ? "+" : ""}{diffPct.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {fmt(Math.abs(diffCents))} {diffCents >= 0 ? (es ? "más" : "more") : es ? "menos" : "less"}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)", opacity: 0.6 }}>
              vs. {comparisonLabel}: {fmt(productionLastYear)}
            </p>
          </div>
        </div>

        {/* Production Goal — uses DB target or falls back to +30% vs last year */}
        {(() => {
          const goalCents = goalTargetCents ?? (productionLastYear > 0 ? Math.round(productionLastYear * 1.3) : 0);
          if (goalCents <= 0) return null;
          const goalProgress = Math.min((productionThisWeek / goalCents) * 100, 100);
          const goalMet = productionThisWeek >= goalCents;
          const goalLabel = goalTargetCents
            ? (es ? `Meta ${periodLabel}` : `${periodLabel} goal`)
            : (es ? "Meta: +30% vs año pasado" : "Goal: +30% vs last year");
          return (
            <div className="mt-3 pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  {goalMet ? (
                    <CircleCheckBig size={14} className="animate-scale-in" style={{ color: "var(--accent-color)" }} />
                  ) : (
                    <Target size={14} style={{ color: "var(--accent-color)" }} />
                  )}
                  <span className="text-[11px] font-semibold" style={{ color: goalMet ? "var(--accent-color)" : "var(--text-secondary)" }}>
                    {goalMet ? (es ? "Meta alcanzada" : "Goal reached") : goalLabel}
                  </span>
                </div>
                <span className="text-[11px] font-bold" style={{ color: goalMet ? "var(--accent-color)" : "var(--text-tertiary)" }}>
                  <AnimatedCurrency cents={productionThisWeek} delay={200} /> / {fmt(goalCents)}
                </span>
              </div>
              <AnimatedBar ratio={goalProgress} color={goalMet ? "var(--accent-color)" : "var(--text-tertiary)"} delay={200} height="h-2.5" />
            </div>
          );
        })()}

        {tipsThisWeek > 0 && (
          <p className="text-[11px] mt-2 pt-2" style={{ color: "var(--text-tertiary)" }}>
            <Coins size={12} className="inline-block mr-1 -mt-0.5" style={{ color: "var(--accent-color)" }} />
            {es ? `Propinas ${periodNoun}` : `Tips ${periodNoun}`}: {fmt(tipsThisWeek)}
          </p>
        )}
      </div>
    ),
    payroll: (
      <Card>
        <SectionLabel icon={Wallet} label={es ? `Nómina estimada ${periodLabel}` : `${periodLabel} Estimated Payroll`} />
        {period !== "week" && <p className="text-[11px] text-muted-foreground mb-3">{es ? "Salario W-2 prorrateado por días operativos" : "W-2 salary prorated by operating days"}</p>}



        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {/* Charlie (W-2 Fixed) */}
              {nominaData.charlieData && (
                <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: nominaData.charlieData.color || "var(--accent-color)" }} />
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {nominaData.charlieData.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-surface)", color: "var(--text-tertiary)" }}>
                        W-2
                      </span>
                    </div>
                    <span className="text-sm font-black" style={{ color: "var(--accent-color)" }}>
                      {fmt(nominaData.charlieData.netPayout)}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {es ? "Prod" : "Prod"}: {fmt(nominaData.charlieData.gross)}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {es ? "Salario" : "Salary"}: {fmt(nominaData.charlieData.commission)}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {es ? "Ded" : "Ded"}: -{fmt(nominaData.charlieData.retention)}
                    </span>
                  </div>
                </div>
              )}

              {/* Yvette (W-2 Variable) */}
              {nominaData.yvetteNet > 0 && nominaData.yvetteBarber && (
                <div className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: nominaData.yvetteBarber.color || "var(--accent-color)" }} />
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {nominaData.yvetteBarber.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-surface)", color: "var(--text-tertiary)" }}>
                        W-2 Var
                      </span>
                    </div>
                    <span className="text-sm font-black" style={{ color: "var(--accent-color)" }}>
                      {fmt(nominaData.yvetteNet)}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {es ? "Bruto" : "Gross"}: {fmt(nominaData.yvetteGross)}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {es ? "Ded" : "Ded"}: -{fmt(nominaData.yvetteGross - nominaData.yvetteNet)}
                    </span>
                  </div>
                </div>
              )}

              {/* Commission barbers */}
              {nominaData.commissionBarbers.map(b => (
                <div key={b.id} className="rounded-xl p-3" style={{ background: "var(--bg-surface-2)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: b.color || "var(--accent-color)" }} />
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {b.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-surface)", color: "var(--text-tertiary)" }}>
                        {(b.commRate * 100).toFixed(0)}%
                      </span>
                    </div>
                    <span className="text-sm font-black" style={{ color: "var(--accent-color)" }}>
                      {fmt(b.netPayout)}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-1 flex-wrap">
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {es ? "Prod" : "Prod"}: {fmt(b.gross)}
                    </span>
                    {b.digitalFee > 0 && (
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                        {es ? "Fee dig" : "Dig fee"}: -{fmt(b.digitalFee)}
                      </span>
                    )}
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      Com: {fmt(b.commission)}
                    </span>
                    {b.retention > 0 && (
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                        Ret: -{fmt(b.retention)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Summary rows */}
            <div className="mt-4 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {es ? "Total a pagar" : "Total payroll"}
                </span>
                <span className="text-lg font-black" style={{ color: "var(--text-primary)" }}>
                  {fmt(nominaData.totalPayouts)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: "var(--green)" }}>
                  {es ? "Retención antes de gastos" : "Retained before expenses"}
                </span>
                <span className="text-lg font-black" style={{ color: "var(--green)" }}>
                  {fmt(nominaData.businessRetention)}
                </span>
              </div>
            </div>
          </>
        )}
      </Card>
    ),
    appointments: (
      <Card>
        <SectionLabel icon={CalendarCheck} label={es ? `Citas ${periodNoun}` : `Appointments ${periodNoun}`} />
        <div className="flex items-end justify-between">
          <div>
            <p className="text-3xl font-black" style={{ color: "var(--text-primary)", letterSpacing: "-1px" }}>
              <AnimatedNumber value={totalAppts} />
            </p>
            <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              {es ? "citas agendadas (excl. canceladas)" : "scheduled (excl. cancelled)"}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 justify-end">
              {apptDiff > 0 ? (
                <TrendingUp size={14} style={{ color: "var(--green)" }} />
              ) : apptDiff < 0 ? (
                <TrendingDown size={14} style={{ color: "var(--red)" }} />
              ) : (
                <Minus size={14} style={{ color: "var(--text-tertiary)" }} />
              )}
              <span className="text-sm font-bold"
                style={{ color: apptDiff >= 0 ? "var(--green)" : "var(--red)" }}>
                {apptDiff >= 0 ? "+" : ""}{apptDiff} ({apptPctDiff >= 0 ? "+" : ""}{apptPctDiff.toFixed(0)}%)
              </span>
            </div>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)", opacity: 0.6 }}>
              vs. {comparisonLabel}: {lastYearAppts}
            </p>
          </div>
        </div>

        {/* Source breakdown — matched to Collections style: gray bars + beige for top */}
        <div className="mt-3 pt-3 space-y-2.5">
          {(() => {
            const sources = [
              { key: "acuity", label: "Acuity", count: sourceBreakdown.acuity },
              { key: "admin", label: "Admin", count: sourceBreakdown.admin },
              { key: "barber", label: es ? "Barberos" : "Barbers", count: sourceBreakdown.barber },
              { key: "web", label: "Web", count: sourceBreakdown.web },
              { key: "app", label: "App", count: sourceBreakdown.app },
            ];
            const topKey = [...sources].sort((a, b) => b.count - a.count)[0]?.key;
            return sources.map((s, idx) => {
              const ratio = totalAppts > 0 ? (s.count / totalAppts) * 100 : 0;
              const isTop = s.key === topKey && s.count > 0;
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {s.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <AnimatedNumber value={Math.round(ratio)} suffix="%" delay={idx * 100} className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }} />
                      <AnimatedNumber value={s.count} delay={idx * 100} className="text-sm font-bold" style={{ color: "var(--text-primary)" }} />
                    </div>
                  </div>
                  <AnimatedBar ratio={ratio} color={isTop ? BAR_ACCENT : BAR_GRAY} delay={idx * 100} />
                </div>
              );
            });
          })()}
        </div>
      </Card>
    ),
    payments: (
      <Card>
        <SectionLabel icon={CreditCard} label={es ? "Cobros por Método" : "Collections by Method"} />
        <p className="text-[11px] mb-3" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Incluye servicios + propinas" : "Includes services + tips"}
        </p>
        <div className="space-y-3">
          {(() => {
            const topPmKey = paymentMethods
              .map(pm => ({ key: pm.key, amt: paymentBreakdown[pm.key] || 0 }))
              .sort((a, b) => b.amt - a.amt)[0]?.key;
            return paymentMethods.map((pm, pmIdx) => {
              const amount = paymentBreakdown[pm.key] || 0;
              const ratio = totalCollected > 0 ? (amount / totalCollected) * 100 : 0;
              const isTop = pm.key === topPmKey && amount > 0;
              return (
                <div key={pm.key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {pm.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <AnimatedNumber value={Math.round(ratio)} suffix="%" delay={pmIdx * 100} className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }} />
                      <AnimatedCurrency cents={amount} delay={pmIdx * 100} className="text-sm font-bold" style={{ color: "var(--text-primary)" }} />
                    </div>
                  </div>
                  <AnimatedBar ratio={ratio} color={isTop ? BAR_ACCENT : BAR_GRAY} delay={pmIdx * 100} />
                </div>
              );
            });
          })()}
        </div>
        {/* Tips row */}
        {tipsThisWeek > 0 && (
          <div className="mt-3 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                <Coins size={12} className="inline-block mr-1 -mt-0.5" style={{ color: "var(--accent-color)" }} />
                {es ? "Propinas" : "Tips"}
              </span>
              <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                {fmt(tipsThisWeek)}
              </span>
            </div>
            <div className="flex gap-3 mt-1">
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {es ? "Efectivo" : "Cash"}: {fmt(tipsBreakdown.cash)}
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                Digital: {fmt(tipsBreakdown.digital)}
              </span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between mt-3 pt-3">
          <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            Total {es ? "cobrado" : "collected"}
          </span>
          <span className="text-lg font-black" style={{ color: "var(--text-primary)" }}>
            {fmt(totalCollected)}
          </span>
        </div>
        <p className="text-[10px] mt-1" style={{ color: "var(--text-tertiary)", opacity: 0.6 }}>
          {es
            ? `Producción ${fmt(productionThisWeek)} + Propinas ${fmt(tipsThisWeek)} = ${fmt(productionThisWeek + tipsThisWeek)}`
            : `Production ${fmt(productionThisWeek)} + Tips ${fmt(tipsThisWeek)} = ${fmt(productionThisWeek + tipsThisWeek)}`}
        </p>
      </Card>
    ),
    ranking: (
      <Card>
        <SectionLabel icon={Crown} label={es ? "Ranking de Barberos" : "Barber Ranking"} />
        <p className="text-[11px] mb-3" style={{ color: "var(--text-tertiary)" }}>
          {es ? "Aporte a la barbería" : "Shop contribution"}
        </p>
        {barberRanking.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {rankingError ? (es ? "No se pudo calcular el ranking." : "The ranking could not be calculated.") : (es ? "Sin datos en este período" : "No data in this period")}
          </p>
        ) : (
          <div className="space-y-3">
            {barberRanking.map((b, i) => {
              const leadingContribution = Math.max(0, barberRanking[0]?.total ?? 0);
              const topRatio = leadingContribution > 0 ? Math.max(0, Math.min(100, b.total / leadingContribution * 100)) : 0;
              return (
                <div key={b.id}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black"
                        style={{
                          background: i === 0 ? b.color : "var(--bg-surface-2)",
                          color: i === 0 ? "#fff" : "var(--text-secondary)",
                        }}>{i + 1}</span>
                      <span className="text-sm font-semibold min-w-0 break-words" style={{ color: "var(--text-primary)" }}>
                        {b.name}
                      </span>
                      {i === 0 && <Crown size={14} style={{ color: "#FFD700" }} />}
                    </div>
                    <AnimatedCurrency cents={b.total} delay={i * 100} className={`text-sm font-bold shrink-0 whitespace-nowrap ${b.total < 0 ? "text-destructive" : "text-foreground"}`} />
                  </div>
                  <AnimatedBar ratio={topRatio} color={b.color} delay={i * 100} />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    ),
    services: (
      <ShopServiceSummaryCard
        appointments={apptsThisWeekFull as any}
        transactions={txThisWeekFull as any}
        language={es ? "es" : "en"}
        period={period}
      />
    ),
  };

  return (
    <div className="pb-4">
      <div data-home-fixed-header className="sticky top-0 z-30" style={{ background: "var(--bg-base)" }}>
        <AdminHeader
          title={es ? "INICIO" : "HOME"}
          greeting={userFirstName}
          subtitle={
            es
              ? format(now, "EEEE, d 'de' MMMM", { locale: esLocale })
                  .replace(/^\w/, (c) => c.toUpperCase())
              : format(now, "EEEE, MMMM d")
          }
          es={es}
        />

        <HomePeriodBanner selection={selection} es={es} />
      </div>


      {loadError ? <div className="px-4 py-12 text-center space-y-3"><p className="text-sm text-muted-foreground">{es ? "No se pudo cargar el resumen." : "The summary could not be loaded."}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>{es ? "Reintentar" : "Retry"}</Button></div> : loading ? <div className="flex justify-center py-20" role="status" aria-label={es ? "Cargando resumen" : "Loading summary"}><Loader2 className="animate-spin text-primary" /></div> : <div className="px-4 pt-4">
      {isOwner && user?.id && <HomeCardLayout key={user.id} userId={user.id} es={es} cards={homeCards} />}
      </div>}
      <OperationalExpenseDialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen} defaultDate={format(selection.date, "yyyy-MM-dd")} es={es} onSaved={() => setReload(value => value + 1)} />
    </div>
  );
}
