import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Package } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { supabase } from "@/integrations/supabase/client";
import { WeekBanner } from "@/components/WeekBanner";
import { useWeekSelector } from "@/hooks/useWeekSelector";
import { useTranslation } from "@/hooks/useTranslation";
import { usePreferences } from "@/hooks/usePreferences";

interface SaleRow {
  item_id: string;
  transaction_id: string;
  created_at: string;
  barber_id: string | null;
  barber_name: string | null;
  product_id: string | null;
  product_name: string;
  quantity: number;
  revenue_cents: number;
  cost_cents: number;
  commission_cents: number;
  profit_cents: number;
}

const fmt = (c: number) => "$" + (c / 100).toFixed(2);

export default function Profit() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { language } = usePreferences();
  const week = useWeekSelector();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    let q = supabase.from("product_sales")
      .select("item_id, transaction_id, created_at, barber_id, barber_name, product_id, product_name, quantity, revenue_cents, cost_cents, commission_cents, profit_cents")
      .order("created_at", { ascending: false });
    if (week.scope === "week") {
      q = q
        .gte("created_at", week.weekStart.toISOString())
        .lte("created_at", new Date(week.weekEnd.getTime() + 86400000 - 1).toISOString());
    }
    q.then(({ data }) => {
      setRows((data as SaleRow[]) || []);
      setLoading(false);
    });
  }, [week.weekStart, week.weekEnd, week.scope]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.revenue += r.revenue_cents;
        acc.cost += r.cost_cents;
        acc.commission += r.commission_cents;
        acc.profit += r.profit_cents;
        acc.units += r.quantity;
        return acc;
      },
      { revenue: 0, cost: 0, commission: 0, profit: 0, units: 0 }
    );
  }, [rows]);

  // Group by product
  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; units: number; revenue: number; cost: number; commission: number; profit: number }>();
    rows.forEach((r) => {
      const key = r.product_id || r.product_name;
      const existing = map.get(key) || { name: r.product_name, units: 0, revenue: 0, cost: 0, commission: 0, profit: 0 };
      existing.units += r.quantity;
      existing.revenue += r.revenue_cents;
      existing.cost += r.cost_cents;
      existing.commission += r.commission_cents;
      existing.profit += r.profit_cents;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  // Group by barber (commission summary)
  const byBarber = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; commission: number }>();
    rows.forEach((r) => {
      if (!r.barber_id) return;
      const existing = map.get(r.barber_id) || { name: r.barber_name || "—", revenue: 0, commission: 0 };
      existing.revenue += r.revenue_cents;
      existing.commission += r.commission_cents;
      map.set(r.barber_id, existing);
    });
    return Array.from(map.values()).filter((b) => b.commission > 0).sort((a, b) => b.commission - a.commission);
  }, [rows]);

  return (
    <div className="min-h-screen pb-8" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title={language === "es" ? "Ganancia de Productos" : "Product Profit"}
        onBack={() => navigate("/admin?tab=menu")}
      />

      <WeekBanner
        label={week.label}
        scope={week.scope}
        onPrev={week.goPrev}
        onNext={week.goNext}
        onToday={week.goToday}
        onScopeChange={week.setScope}
        onPickDate={week.goToDate}
        showScopeToggle
        selectedDate={week.weekStart}
      />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 px-4">
          <Package size={48} style={{ color: "var(--text-tertiary)" }} />
          <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
            {language === "es" ? "Sin ventas de productos en este período." : "No product sales in this period."}
          </p>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-4 pb-24">
          {/* Summary card */}
          <div className="rounded-xl p-4 card-elevated space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
              {language === "es" ? "Resumen" : "Summary"}
            </div>
            <Row label={language === "es" ? "Unidades vendidas" : "Units sold"} value={String(totals.units)} />
            <Row label={language === "es" ? "Ingresos" : "Revenue"} value={fmt(totals.revenue)} />
            <Row label={language === "es" ? "Costo" : "Cost"} value={`-${fmt(totals.cost)}`} negative />
            {totals.commission > 0 && (
              <Row label={language === "es" ? "Comisión barberos" : "Barber commission"} value={`-${fmt(totals.commission)}`} negative />
            )}
            <div className="pt-2" style={{ borderTop: "1px solid var(--divider)" }}>
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                {language === "es" ? "Ganancia Neta" : "Net Profit"}
              </div>
              <div className="text-2xl font-black" style={{ color: "var(--accent-color)" }}>
                {fmt(totals.profit)}
              </div>
            </div>
          </div>

          {/* Per-product breakdown */}
          <div className="rounded-xl p-4 card-elevated">
            <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
              {language === "es" ? "Por producto" : "By product"}
            </div>
            <div className="space-y-3">
              {byProduct.map((p) => (
                <div key={p.name} className="pb-3" style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {p.name}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      ×{p.units}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span>{fmt(p.revenue)} - {fmt(p.cost)}{p.commission > 0 ? ` - ${fmt(p.commission)}` : ""}</span>
                    <span className="font-bold" style={{ color: "var(--accent-color)" }}>{fmt(p.profit)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Per-barber commission */}
          {byBarber.length > 0 && (
            <div className="rounded-xl p-4 card-elevated">
              <div className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-tertiary)" }}>
                {language === "es" ? "Comisión por barbero" : "Commission by barber"}
              </div>
              <div className="space-y-2">
                {byBarber.map((b) => (
                  <Row key={b.name} label={`${b.name} (${fmt(b.revenue)})`} value={fmt(b.commission)} />
                ))}
              </div>
              <div className="mt-3 pt-2 text-[11px] italic" style={{ color: "var(--text-tertiary)", borderTop: "1px solid var(--divider)" }}>
                {language === "es"
                  ? "Nota: las comisiones por productos aún no se suman a la nómina del barbero."
                  : "Note: product commissions are not yet added to barber payroll."}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex justify-between py-1.5">
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: negative ? "var(--red)" : "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
