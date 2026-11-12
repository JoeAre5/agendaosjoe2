/**
 * Multi-week P&L aggregator
 * Splits an arbitrary [from, to] range into Saturday-to-Friday weeks
 * (the shop's accounting week) and computes per-week financials, plus
 * grand totals for export.
 *
 * Reuses the same math as `CuadreContent.useComputedData` so totals
 * always match what the user sees in the Cuadre tab.
 */
import { expenseContributions, type ExpenseDefinition } from "@/lib/operationalExpenses";
import { startOfWeek, endOfWeek, addWeeks, format, isBefore, isAfter } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { computeGatewayFee } from "./gatewayFees";
import {
  buildUnifiedProduction,
  type RawAppointment,
  type RawTransaction,
} from "./unifiedProduction";

const fmtCents = (c: number) => "$" + (Math.abs(c) / 100).toFixed(2);

export interface WeekFinancials {
  /** "YYYY-MM-DD" Saturday start */
  weekStart: string;
  /** "YYYY-MM-DD" Friday end */
  weekEnd: string;
  /** Human label e.g. "1 nov - 7 nov" */
  label: string;

  // Income
  gross: number;
  cash: number;
  digital: number;
  digitalFee: number;
  production: number;

  // Per-barber production (id -> production cents)
  productionByBarber: Record<string, number>;

  // Payouts
  barberPayouts: Array<{ barber_id: string; name: string; payout: number }>;
  totalBarberPayouts: number;

  // Tips
  totalTips: number;
  totalTipFeesRetained: number;
  totalTipsPaid: number;

  // Expenses (operating)
  totalExpenses: number;

  // Products
  productGross: number;
  productCost: number;
  productCommission: number;
  productMargin: number;
  productUnits: number;
  productTransactions: number;

  // Payment method breakdown (cents collected gross incl. tips, by method)
  paymentMethodBreakdown: {
    cash: number;
    ath_movil: number;
    paypal: number;
    stripe: number;
    other: number;
    total: number;
  };

  // Net
  netProfit: number;
}

export interface PLReport {
  /** ISO from date */
  from: string;
  /** ISO to date */
  to: string;
  /** Human label e.g. "Octubre 2026" or "1 oct - 31 oct 2026" */
  periodLabel: string;
  /** Per-week breakdown, oldest first */
  weeks: WeekFinancials[];
  /** Grand totals (sum of weeks) */
  totals: Omit<WeekFinancials, "weekStart" | "weekEnd" | "label" | "productionByBarber" | "barberPayouts"> & {
    productionByBarber: Record<string, number>;
    barberPayoutsByBarber: Record<string, { name: string; payout: number }>;
  };
  /** Operating expenses (operational_expenses, Home allocation) for the exact range */
  expenseRows: Array<{ id: string; title: string; frequency: string; period_cents: number }>;
  /** Barber metadata (id -> {name, color}) for labelling columns */
  barberInfo: Record<string, { name: string; color: string | null }>;
  shopName: string;
  legalEntity: string;
  city: string;
}

interface ComputeInputs {
  barbers: any[];
  transactions: any[];
  appointments: any[];
  expenses: any[];
  settings: any;
  productSalesDetail: any[];
}

/** Pure computation for one week — mirrors useComputedData in CuadreContent. */
function computeWeek(inp: ComputeInputs): Omit<WeekFinancials, "weekStart" | "weekEnd" | "label"> {
  const fallbackRate = inp.settings?.digital_fee_rate || 0.10;

  const unifiedRows = buildUnifiedProduction(
    inp.appointments as RawAppointment[],
    inp.transactions as RawTransaction[]
  );

  type Entry = {
    name: string; color: string | null; cash: number; digital: number;
    digitalFee: number; tipFee: number;
    employment_type: string; commission_rate: number | null;
    retention_rate: number | null; weekly_salary: number | null;
    tipsCash: number; tipsDigital: number;
  };
  const barberMap = new Map<string, Entry>();
  inp.barbers.forEach((b) => {
    barberMap.set(b.id, {
      name: b.name, color: b.color, cash: 0, digital: 0,
      digitalFee: 0, tipFee: 0,
      employment_type: b.employment_type, commission_rate: b.commission_rate,
      retention_rate: b.retention_rate, weekly_salary: b.weekly_salary,
      tipsCash: 0, tipsDigital: 0,
    });
  });

  const pmBreakdown = { cash: 0, ath_movil: 0, paypal: 0, stripe: 0, other: 0, total: 0 };

  unifiedRows.forEach((r) => {
    // Payment method tally (gross collected incl tips) — independent of barber filter
    const collected = r.total_cents;
    pmBreakdown.total += collected;
    if (r.processor === "cash") pmBreakdown.cash += collected;
    else if (r.processor === "ath_movil") pmBreakdown.ath_movil += collected;
    else if (r.processor === "paypal") pmBreakdown.paypal += collected;
    else if (r.processor === "stripe") pmBreakdown.stripe += collected;
    else pmBreakdown.other += collected;

    const entry = barberMap.get(r.barber_id);
    if (!entry) return;
    const subFee = computeGatewayFee(r.subtotal_cents, r.processor, fallbackRate);
    const tipFee = r.tip_cents > 0
      ? computeGatewayFee(r.subtotal_cents + r.tip_cents, r.processor, fallbackRate) - subFee
      : 0;
    if (r.pm === "digital") {
      entry.digital += r.subtotal_cents;
      entry.digitalFee += subFee;
    } else {
      entry.cash += r.subtotal_cents;
    }
    if (r.tip_cents > 0) {
      if (r.pm === "digital") {
        entry.tipsDigital += r.tip_cents;
        entry.tipFee += Math.max(0, tipFee);
      } else {
        entry.tipsCash += r.tip_cents;
      }
    }
  });

  const productionByBarber: Record<string, number> = {};
  const barberPayouts: Array<{ barber_id: string; name: string; payout: number }> = [];
  let totalGross = 0, totalCash = 0, totalDigital = 0, totalDigitalFee = 0;
  let totalProduction = 0, totalBarberPayouts = 0;
  let totalTipsPaid = 0, totalTipFeesRetained = 0, totalTips = 0;

  // Track Charlie (w2_fixed) production for Yvette surplus calc
  let charlieEntry: Entry | null = null;

  barberMap.forEach((entry, barberId) => {
    const digital = entry.digital;
    const digitalFee = entry.digitalFee;
    const production = entry.cash + digital - digitalFee;
    const gross = entry.cash + digital;

    if (entry.employment_type !== "w2_variable") {
      totalGross += gross;
      totalCash += entry.cash;
      totalDigital += digital;
      totalDigitalFee += digitalFee;
      totalProduction += production;
      productionByBarber[barberId] = production;
    }

    if (entry.employment_type === "commission") {
      const commRate = entry.commission_rate || 0.65;
      const retRate = entry.retention_rate || 0;
      const preNet = Math.round(production * commRate);
      const retention = Math.round(preNet * retRate);
      const subtotal = preNet - retention;
      const totalTipsB = entry.tipsCash + entry.tipsDigital;
      const netTips = totalTipsB - entry.tipFee;
      const payout = subtotal + netTips;
      barberPayouts.push({ barber_id: barberId, name: entry.name, payout });
      totalBarberPayouts += payout;
      totalTipsPaid += netTips;
      totalTipFeesRetained += entry.tipFee;
      totalTips += totalTipsB;
    } else if (entry.employment_type === "w2_fixed") {
      const payout = entry.weekly_salary || 57000;
      barberPayouts.push({ barber_id: barberId, name: entry.name, payout });
      totalBarberPayouts += payout;
      charlieEntry = entry;
    }
  });

  // Yvette surplus rule
  const charlieDigital = charlieEntry?.digital || 0;
  const charlieCash = charlieEntry?.cash || 0;
  const charlieDigitalFee = charlieEntry?.digitalFee || 0;
  const charlieProduction = charlieCash + charlieDigital - charlieDigitalFee;
  const charlieSalary = charlieEntry?.weekly_salary || 57000;
  const surplusA = charlieProduction - charlieSalary;
  const totalExpensesAmt = inp.expenses.reduce(
    (s: number, e: any) => s + (e.period_cents || 0), 0
  );
  const surplusB = surplusA - totalExpensesAmt;
  const yvetteCap = inp.settings?.yvette_weekly_cap_cents || 57000;
  const yvetteMinSurplus = inp.settings?.yvette_min_surplus_cents || 30000;
  const yvettePayout = 0; void surplusB; void yvetteCap; void yvetteMinSurplus;
  // Yvette removed: Charlie keeps fixed salary; surplus stays as shop income.

  // Products
  let productGross = 0, productCost = 0, productCommission = 0, productUnits = 0;
  const txIds = new Set<string>();
  for (const r of inp.productSalesDetail) {
    productGross += r.revenue_cents || 0;
    productCost += r.cost_cents || 0;
    productCommission += r.commission_cents || 0;
    productUnits += r.quantity || 0;
    txIds.add(r.transaction_id);
  }
  const productMargin = productGross - productCost - productCommission;

  // Export-only: operating expenses come from operational_expenses (same allocation as Home).
  const netProfit =
    totalProduction + totalTipFeesRetained - totalBarberPayouts + productMargin - totalExpensesAmt;

  return {
    gross: totalGross,
    cash: totalCash,
    digital: totalDigital,
    digitalFee: totalDigitalFee,
    production: totalProduction,
    productionByBarber,
    barberPayouts,
    totalBarberPayouts,
    totalTips,
    totalTipFeesRetained,
    totalTipsPaid,
    totalExpenses: totalExpensesAmt,
    productGross, productCost, productCommission, productMargin,
    productUnits, productTransactions: txIds.size,
    paymentMethodBreakdown: pmBreakdown,
    netProfit,
  };
}

/** Split a range into Saturday-to-Friday weeks that intersect [from, to]. */
export function splitIntoWeeks(from: Date, to: Date): Array<{ start: Date; end: Date }> {
  const out: Array<{ start: Date; end: Date }> = [];
  let cursor = startOfWeek(from, { weekStartsOn: 6 });
  while (!isAfter(cursor, to)) {
    const wEnd = endOfWeek(cursor, { weekStartsOn: 6 });
    out.push({ start: cursor, end: wEnd });
    cursor = addWeeks(cursor, 1);
  }
  return out;
}

/** Build a complete P&L report for the range [from, to]. */
export async function buildPLReport(
  from: Date,
  to: Date,
  periodLabel: string
): Promise<PLReport> {
  const fromISO = from.toISOString();
  const toISO = to.toISOString();

  // Paginate: the API caps responses at 1000 rows, which silently truncated
  // multi-month/annual reports.
  const fetchAll = async (build: () => any): Promise<{ data: any[] }> => {
    const out: any[] = [];
    const size = 1000;
    for (let i = 0; ; i += size) {
      const { data, error } = await build().range(i, i + size - 1);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < size) break;
    }
    return { data: out };
  };

  const [bRes, tRes, aRes, eRes, sRes, pcRes] = await Promise.all([
    (supabase.rpc as any)("get_barbers_payroll"),
    fetchAll(() => supabase.from("transactions")
      .select("id,barber_id,payment_method,subtotal_cents,tip_cents,total_cents,status,created_at,appointment_id,type")
      .eq("status", "completed")
      .gte("created_at", fromISO).lte("created_at", toISO).order("id")),
    fetchAll(() => supabase.from("appointments")
      .select("id,barber_id,price_cents,tip_cents,amount_paid_cents,paid,payment_method,notes,starts_at,status,service_name")
      .gte("starts_at", fromISO).lte("starts_at", toISO).order("id")),
    (async () => {
      const { data: ctx, error: ctxErr } = await supabase.rpc("get_home_expense_context");
      const shopId = (ctx as any[])?.[0]?.shop_id;
      if (ctxErr || !shopId) throw ctxErr ?? new Error("No expense context");
      return fetchAll(() => supabase.from("operational_expenses").select("*")
        .eq("shop_id", shopId).eq("is_active", true).order("expense_date").order("id"));
    })(),
    Promise.all([
      supabase.from("shop_settings_public" as any).select("shop_name,legal_entity,owner_name,address,city").limit(1).single(),
      (supabase.rpc as any)("get_shop_financial_config"),
    ]).then(([pub, fin]: any) => ({
      data: pub.data ? { ...(pub.data as object), ...(((fin.data as any[]) || [])[0] || {}) } : null,
    })),
    fetchAll(() => supabase.from("product_sales")
      .select("item_id,transaction_id,created_at,barber_id,barber_name,product_id,product_name,quantity,unit_price_cents,revenue_cents,cost_cents,commission_cents,profit_cents,eligible_for_commission,source")
      .gte("created_at", fromISO).lte("created_at", toISO).order("item_id")),
  ]);

  const barbers = (bRes.data as any[]) || [];
  const allTx = (tRes.data as any[]) || [];
  const allAppts = (aRes.data as any[]) || [];
  const expenseDefs = ((eRes as any).data as ExpenseDefinition[]) || [];
  const settings = sRes.data as any;
  const allProductSales = (pcRes.data as any[]) || [];

  const weeks = splitIntoWeeks(from, to);
  const weekRows: WeekFinancials[] = weeks.map(({ start, end }) => {
    const sISO = start.toISOString();
    const eISO = end.toISOString();
    const wTx = allTx.filter((t) => t.created_at >= sISO && t.created_at <= eISO);
    const wAppts = allAppts.filter((a) => a.starts_at >= sISO && a.starts_at <= eISO);
    const wProducts = allProductSales.filter((p) => p.created_at >= sISO && p.created_at <= eISO);

    const computed = computeWeek({
      barbers, transactions: wTx, appointments: wAppts,
      expenses: expenseContributions(expenseDefs, start < from ? from : start, end > to ? to : end),
      settings, productSalesDetail: wProducts,
    });

    return {
      weekStart: format(start, "yyyy-MM-dd"),
      weekEnd: format(end, "yyyy-MM-dd"),
      label: `${format(start, "d MMM")} - ${format(end, "d MMM")}`,
      ...computed,
    };
  });

  // Grand totals
  const productionByBarber: Record<string, number> = {};
  const barberPayoutsByBarber: Record<string, { name: string; payout: number }> = {};
  const barberInfo: Record<string, { name: string; color: string | null }> = {};
  barbers.forEach((b) => { barberInfo[b.id] = { name: b.name, color: b.color }; });

  const acc = {
    gross: 0, cash: 0, digital: 0, digitalFee: 0, production: 0,
    totalBarberPayouts: 0, totalTips: 0, totalTipFeesRetained: 0, totalTipsPaid: 0,
    totalExpenses: 0, productGross: 0, productCost: 0, productCommission: 0,
    productMargin: 0, productUnits: 0, productTransactions: 0, netProfit: 0,
  };
  const pmTotal = { cash: 0, ath_movil: 0, paypal: 0, stripe: 0, other: 0, total: 0 };
  weekRows.forEach((w) => {
    (Object.keys(acc) as (keyof typeof acc)[]).forEach((k) => {
      (acc as any)[k] += (w as any)[k] || 0;
    });
    (Object.keys(pmTotal) as (keyof typeof pmTotal)[]).forEach((k) => {
      pmTotal[k] += w.paymentMethodBreakdown[k] || 0;
    });
    Object.entries(w.productionByBarber).forEach(([id, v]) => {
      productionByBarber[id] = (productionByBarber[id] || 0) + v;
    });
    w.barberPayouts.forEach((p) => {
      if (!barberPayoutsByBarber[p.barber_id]) {
        barberPayoutsByBarber[p.barber_id] = { name: p.name, payout: 0 };
      }
      barberPayoutsByBarber[p.barber_id].payout += p.payout;
    });
  });

  return {
    from: fromISO,
    to: toISO,
    periodLabel,
    weeks: weekRows,
    totals: { ...acc, paymentMethodBreakdown: pmTotal, productionByBarber, barberPayoutsByBarber },
    expenseRows: expenseContributions(expenseDefs, from, to)
      .map((e) => ({ id: e.id, title: e.title, frequency: e.frequency, period_cents: e.period_cents })),
    barberInfo,
    shopName: settings?.shop_name || "Charlie's Barbershop",
    legalEntity: settings?.legal_entity || "C&O Ventures LLC",
    city: settings?.city || "",
  };
}

export { fmtCents };
