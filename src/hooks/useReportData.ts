import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ReportScope } from "./useWeekSelector";
import { buildUnifiedProduction, type RawAppointment, type RawTransaction, type UnifiedRow } from "@/lib/unifiedProduction";

interface Barber {
  id: string;
  name: string;
  color: string | null;
  employment_type: string;
  commission_rate: number | null;
  retention_rate: number | null;
  weekly_salary: number | null;
  bonus_threshold_cents: number;
  employee_id: string | null;
  ssn_last4: string | null;
}

interface Transaction {
  id: string;
  barber_id: string;
  appointment_id: string | null;
  payment_method: string;
  subtotal_cents: number;
  tip_cents: number;
  total_cents: number;
  status: string;
  created_at: string;
}

interface Appointment {
  id: string;
  barber_id: string;
  price_cents: number;
  tip_cents: number;
  amount_paid_cents: number;
  paid: boolean;
  payment_method: string | null;
  notes: string | null;
  starts_at: string;
  status: string;
  service_name: string;
}

interface Expense {
  id: string;
  name: string;
  weekly_amount_cents: number;
  is_fixed: boolean;
  sort_order: number;
}

interface ShopSettings {
  shop_name: string;
  legal_entity: string;
  owner_name: string;
  digital_fee_rate: number;
  yvette_weekly_cap_cents: number;
  yvette_min_surplus_cents: number;
  address: string | null;
  city: string;
}

interface ProductCommissionRow {
  barber_id: string;
  commission_cents: number;
  appointment_id: string | null;
}

export interface ProductSaleRow {
  item_id: string;
  transaction_id: string;
  appointment_id: string | null;
  created_at: string;
  barber_id: string | null;
  barber_name: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  revenue_cents: number;
  cost_cents: number;
  commission_cents: number;
  profit_cents: number;
  eligible_for_commission: boolean;
  /** Sales channel: 'pos' = in-store walk-in/POS, 'public_booking' = online mini-shop. */
  source: "pos" | "public_booking" | string;
}

export function useReportData(weekStart: Date, weekEnd: Date, scope: ReportScope) {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [productCommissions, setProductCommissions] = useState<ProductCommissionRow[]>([]);
  const [productSalesDetail, setProductSalesDetail] = useState<ProductSaleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const wsISO = weekStart.toISOString();
  const weISO = weekEnd.toISOString();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);

      const dateFilter = scope === "week";

      const [bRes, tRes, aRes, eRes, sRes, pcRes] = await Promise.all([
        // SECURITY: Sensitive payroll columns are not directly readable; fetch via SECURITY DEFINER RPC.
        (supabase.rpc as any)("get_barbers_payroll"),
        (() => {
          let q = supabase.from("transactions").select("id,barber_id,payment_method,subtotal_cents,tip_cents,total_cents,status,created_at,appointment_id,type").eq("status", "completed");
          if (dateFilter) q = q.gte("created_at", wsISO).lte("created_at", weISO);
          return q;
        })(),
        (() => {
          // NOTE: do NOT filter out cancelled here — buildUnifiedProduction handles it
          // and we want the raw set available for components that need it.
          let q = supabase.from("appointments").select("id,barber_id,price_cents,tip_cents,amount_paid_cents,paid,payment_method,notes,starts_at,status,service_name,client_name,duplicate_dismissed_at");
          if (dateFilter) q = q.gte("starts_at", wsISO).lte("starts_at", weISO);
          return q;
        })(),
        supabase.from("expenses").select("id,name,weekly_amount_cents,is_fixed,sort_order").eq("is_active", true).order("sort_order"),
        // Sensitive financial cols (digital_fee_rate, yvette_*) come from owner-only RPC.
        // Operational cols (shop_name, legal_entity, owner_name, address, city) come from the safe view.
        Promise.all([
          supabase.from("shop_settings_public" as any).select("shop_name,legal_entity,owner_name,address,city").limit(1).single(),
          (supabase.rpc as any)("get_shop_financial_config"),
        ]).then(([pub, fin]: any) => ({
          data: pub.data ? { ...(pub.data as object), ...(((fin.data as any[]) || [])[0] || {}) } : null,
          error: pub.error || fin.error,
        })),
        // Product commission rows tied to appointments only (per business rule).
        // We pull transaction_id + commission so we can later JOIN to transactions.appointment_id client-side.
        // Product sales: now we pull the full detail (name, qty, revenue, cost, commission, eligibility)
        // for both Nómina drill-down and the Shop tab. Commission filtering happens client-side.
        (() => {
          let q = supabase.from("product_sales").select("item_id,transaction_id,created_at,barber_id,barber_name,product_id,product_name,quantity,unit_price_cents,revenue_cents,cost_cents,commission_cents,profit_cents,eligible_for_commission,source");
          if (dateFilter) q = q.gte("created_at", wsISO).lte("created_at", weISO);
          return q;
        })(),
      ]);

      if (cancelled) return;
      const barbersData = (bRes.data as Barber[]) || [];
      const txData = (tRes.data as Transaction[]) || [];
      setBarbers(barbersData);
      setTransactions(txData);
      setAppointments((aRes.data as Appointment[]) || []);
      setExpenses((eRes.data as Expense[]) || []);
      setSettings(sRes.data as ShopSettings | null);

      // Build appointment map (transaction_id -> appointment_id) for both lists.
      const txAppt = new Map<string, string | null>();
      txData.forEach((t) => txAppt.set(t.id, t.appointment_id));
      const commissionBarberIds = new Set(
        barbersData.filter((b) => b.employment_type === "commission").map((b) => b.id)
      );

      const rawSales = ((pcRes.data as any[]) || []);

      // Detail list (every product sale this week, regardless of barber type or appointment tie).
      // The Shop tab and the Nómina accordion both need this raw view.
      const detail: ProductSaleRow[] = rawSales.map((r) => ({
        item_id: r.item_id,
        transaction_id: r.transaction_id,
        appointment_id: txAppt.get(r.transaction_id) ?? null,
        created_at: r.created_at,
        barber_id: r.barber_id ?? null,
        barber_name: r.barber_name ?? null,
        product_id: r.product_id ?? null,
        product_name: r.product_name ?? "—",
        quantity: r.quantity ?? 0,
        unit_price_cents: r.unit_price_cents ?? 0,
        revenue_cents: r.revenue_cents ?? 0,
        cost_cents: r.cost_cents ?? 0,
        commission_cents: r.commission_cents ?? 0,
        profit_cents: r.profit_cents ?? 0,
        eligible_for_commission: r.eligible_for_commission !== false,
        source: r.source || "pos",
      }));
      setProductSalesDetail(detail);

      // Aggregated commission rows (only commission-type barbers + appointment-tied sales).
      const pcRows = rawSales
        // Online (mini-shop) sales never count toward barber commission, regardless of barber_id.
        .filter((r) => (r.source || "pos") !== "public_booking")
        .filter((r) => r.barber_id && commissionBarberIds.has(r.barber_id))
        .filter((r) => txAppt.get(r.transaction_id) != null)
        .map((r) => ({
          barber_id: r.barber_id as string,
          commission_cents: (r.commission_cents as number) || 0,
          appointment_id: txAppt.get(r.transaction_id) || null,
        }));
      setProductCommissions(pcRows);

      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [wsISO, weISO, scope]);

  // Unified rows — single source of truth, no double-counting
  const unifiedRows: UnifiedRow[] = useMemo(
    () => buildUnifiedProduction(appointments as unknown as RawAppointment[], transactions as unknown as RawTransaction[]),
    [appointments, transactions]
  );

  // Aggregate product commission per barber (already filtered to commission-type + appointment-tied)
  const productCommissionByBarber: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of productCommissions) {
      out[r.barber_id] = (out[r.barber_id] || 0) + r.commission_cents;
    }
    return out;
  }, [productCommissions]);

  // Per-barber detailed product sales for the Nómina accordion (only appointment-tied, commission-type).
  const productSalesByBarber: Record<string, ProductSaleRow[]> = useMemo(() => {
    const out: Record<string, ProductSaleRow[]> = {};
    const commissionBarberIds = new Set(
      barbers.filter((b) => b.employment_type === "commission").map((b) => b.id)
    );
    for (const r of productSalesDetail) {
      if (!r.barber_id || !commissionBarberIds.has(r.barber_id)) continue;
      if (!r.appointment_id) continue; // appointment-tied only for nómina
      if (!out[r.barber_id]) out[r.barber_id] = [];
      out[r.barber_id].push(r);
    }
    return out;
  }, [productSalesDetail, barbers]);

  return {
    barbers, transactions, appointments, expenses, settings, loading,
    unifiedRows, productCommissionByBarber,
    productSalesDetail, productSalesByBarber,
  };
}
