import { useMemo, useState } from "react";
import { Download, Package, Scissors, Globe } from "lucide-react";
import { buildUnifiedProduction, type RawAppointment, type RawTransaction } from "@/lib/unifiedProduction";
import type { ProductSaleRow } from "@/hooks/useReportData";

function fmt(cents: number) {
  return "$" + (Math.abs(cents) / 100).toFixed(2);
}

type ChannelFilter = "all" | "pos" | "online";

interface ShopContentProps {
  barbers: any[];
  transactions: any[];
  appointments: any[];
  productSalesDetail: ProductSaleRow[];
  rangeLabel: string;
}

interface ServiceRow { name: string; count: number; revenue: number; }
interface ProductRow { name: string; units: number; transactions: number; revenue: number; commission: number; cost: number; margin: number; }

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden card-elevated">
      <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--divider)" }}>
        {icon}
        <span>{title}</span>
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  );
}

export function ShopContent({ barbers, transactions, appointments, productSalesDetail, rangeLabel }: ShopContentProps) {
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

  // Online-sale KPI is computed from the unfiltered set so the badge always
  // reflects the full week regardless of the active filter chip.
  const onlineSales = useMemo(
    () => productSalesDetail.filter((r) => r.source === "public_booking"),
    [productSalesDetail]
  );
  const onlineUnits = onlineSales.reduce((s, r) => s + r.quantity, 0);
  const onlineRevenue = onlineSales.reduce((s, r) => s + r.revenue_cents, 0);

  // Apply the active channel filter to product views below.
  const filteredDetail = useMemo(() => {
    if (channelFilter === "all") return productSalesDetail;
    if (channelFilter === "online") return productSalesDetail.filter((r) => r.source === "public_booking");
    return productSalesDetail.filter((r) => r.source !== "public_booking");
  }, [productSalesDetail, channelFilter]);

  // Service breakdown by service_name (only counted, paid appointments — same source as production)
  const serviceRows: ServiceRow[] = useMemo(() => {
    const unified = buildUnifiedProduction(
      appointments as unknown as RawAppointment[],
      transactions as unknown as RawTransaction[]
    );
    // Build service_name lookup from appointments
    const apptName = new Map<string, string>();
    appointments.forEach((a: any) => apptName.set(a.id, a.service_name || "Servicio"));

    const map = new Map<string, ServiceRow>();
    for (const r of unified) {
      // Only "appointment" rows have a clean service name; loose tx grouped as "Walk-in / otro"
      const name =
        r.source === "appointment" && r.id.startsWith("appt:")
          ? apptName.get(r.id.slice(5)) || "Servicio"
          : "Walk-in / otro";
      const cur = map.get(name) || { name, count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += r.subtotal_cents;
      map.set(name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [appointments, transactions]);

  const totalServiceCount = serviceRows.reduce((s, r) => s + r.count, 0);
  const totalServiceRevenue = serviceRows.reduce((s, r) => s + r.revenue, 0);

  // Product aggregate by product_name
  const productRows: ProductRow[] = useMemo(() => {
    const map = new Map<string, ProductRow>();
    for (const r of filteredDetail) {
      const cur = map.get(r.product_name) || { name: r.product_name, units: 0, transactions: 0, revenue: 0, commission: 0, cost: 0, margin: 0 };
      cur.units += r.quantity;
      cur.transactions += 1;
      cur.revenue += r.revenue_cents;
      cur.commission += r.commission_cents;
      cur.cost += r.cost_cents;
      cur.margin = cur.revenue - cur.cost - cur.commission;
      map.set(r.product_name, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filteredDetail]);

  const totalProductUnits = productRows.reduce((s, r) => s + r.units, 0);
  const totalProductRevenue = productRows.reduce((s, r) => s + r.revenue, 0);
  const totalProductCommission = productRows.reduce((s, r) => s + r.commission, 0);
  const totalProductCost = productRows.reduce((s, r) => s + r.cost, 0);
  const totalProductMargin = totalProductRevenue - totalProductCost - totalProductCommission;

  // Chronological per-transaction list of product sales (for audit trail)
  const txList = useMemo(() => {
    return [...filteredDetail].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [filteredDetail]);

  function exportCSV() {
    const header = ["fecha", "canal", "barbero", "producto", "cantidad", "precio_unitario", "venta", "costo", "comision", "margen", "elegible_comision", "transaccion_id", "cita_id"];
    const lines = [header.join(",")];
    for (const r of txList) {
      const row = [
        r.created_at,
        r.source === "public_booking" ? "online" : "pos",
        (r.barber_name || "").replace(/,/g, " "),
        r.product_name.replace(/,/g, " "),
        r.quantity,
        (r.unit_price_cents / 100).toFixed(2),
        (r.revenue_cents / 100).toFixed(2),
        (r.cost_cents / 100).toFixed(2),
        (r.commission_cents / 100).toFixed(2),
        (r.profit_cents / 100).toFixed(2),
        r.eligible_for_commission ? "si" : "no",
        r.transaction_id,
        r.appointment_id || "",
      ];
      lines.push(row.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shop-${rangeLabel.replace(/[^a-z0-9]/gi, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      {/* Top-line summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-4 card-elevated">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Servicios</div>
          <div className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{totalServiceCount}</div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{fmt(totalServiceRevenue)}</div>
        </div>
        <div className="rounded-xl p-4 card-elevated">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Productos</div>
          <div className="text-xl font-black" style={{ color: "var(--text-primary)" }}>{totalProductUnits}</div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{fmt(totalProductRevenue)} · margen {fmt(totalProductMargin)}</div>
        </div>
      </div>

      {/* Online-sales KPI — always reflects the full week (not affected by filter) */}
      {onlineSales.length > 0 && (
        <div
          className="rounded-xl p-3 flex items-center gap-3 card-elevated"
          style={{ borderLeft: "3px solid var(--green, #10b981)" }}
        >
          <Globe size={16} className="icon-bold" style={{ color: "var(--green, #10b981)" }} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              Ventas online (mini-shop)
            </div>
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {onlineSales.length} tx · {onlineUnits} u · {fmt(onlineRevenue)}
            </div>
          </div>
          <div className="text-[10px] text-right leading-tight" style={{ color: "var(--text-tertiary)" }}>
            sin comisión<br />de barbero
          </div>
        </div>
      )}

      {/* Channel filter */}
      <div className="flex items-center gap-2 text-[12px]">
        <span style={{ color: "var(--text-tertiary)" }}>Canal:</span>
        {([
          { key: "all", label: "Todos" },
          { key: "pos", label: "POS / tienda" },
          { key: "online", label: "Online" },
        ] as { key: ChannelFilter; label: string }[]).map((opt) => {
          const active = channelFilter === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setChannelFilter(opt.key)}
              className="px-2.5 py-1 rounded-full font-semibold transition-all"
              style={{
                background: active ? "var(--cta-bg)" : "var(--bg-surface-2)",
                color: active ? "var(--cta-fg)" : "var(--text-secondary)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Top servicios */}
      <Section title="Top servicios" icon={<Scissors size={12} />}>
        {serviceRows.length === 0 && (
          <div className="text-sm py-4 text-center" style={{ color: "var(--text-tertiary)" }}>Sin servicios este período.</div>
        )}
        {serviceRows.map((r) => {
          const pct = totalServiceRevenue > 0 ? (r.revenue / totalServiceRevenue) * 100 : 0;
          return (
            <div key={r.name} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.name}</div>
                <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{r.count} unidad{r.count !== 1 ? "es" : ""} · {pct.toFixed(0)}%</div>
              </div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{fmt(r.revenue)}</div>
            </div>
          );
        })}
      </Section>

      {/* Top productos */}
      <Section title="Top productos" icon={<Package size={12} />}>
        {productRows.length === 0 && (
          <div className="text-sm py-4 text-center" style={{ color: "var(--text-tertiary)" }}>Sin ventas de productos este período.</div>
        )}
        {productRows.map((r) => (
          <div key={r.name} className="py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{r.name}</div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{fmt(r.revenue)}</div>
            </div>
            <div className="flex justify-between text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              <span>{r.units} u · {r.transactions} tx</span>
              <span>com {fmt(r.commission)} · costo {fmt(r.cost)} · margen <strong style={{ color: r.margin >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(r.margin)}</strong></span>
            </div>
          </div>
        ))}
        {productRows.length > 0 && (
          <div className="flex justify-between pt-3 pb-1 text-xs font-bold" style={{ color: "var(--text-primary)" }}>
            <span>TOTAL</span>
            <span>{fmt(totalProductRevenue)} · margen {fmt(totalProductMargin)}</span>
          </div>
        )}
      </Section>

      {/* Audit trail: every product transaction */}
      {txList.length > 0 && (
        <Section title={`Auditoría — ${txList.length} ventas de productos`}>
          <div className="max-h-80 overflow-y-auto -mx-4 px-4">
            {txList.map((r) => {
              const date = new Date(r.created_at);
              const dateLabel = date.toLocaleString("es-PR", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
                timeZone: "America/Puerto_Rico",
              });
              const isOnline = r.source === "public_booking";
              return (
                <div key={r.item_id} className="py-2 text-[12px]" style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex justify-between items-center gap-2">
                    <span className="flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                      <span className="truncate">{r.product_name} × {r.quantity}</span>
                      {isOnline && (
                        <span
                          className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                          style={{ background: "var(--green, #10b981)", color: "#fff" }}
                        >
                          <Globe size={9} className="icon-extrabold" /> Online
                        </span>
                      )}
                    </span>
                    <span className="shrink-0" style={{ color: "var(--text-primary)", fontWeight: 600 }}>{fmt(r.revenue_cents)}</span>
                  </div>
                  <div className="flex justify-between text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    <span>
                      {dateLabel} ·{" "}
                      {isOnline
                        ? "Online sale (sin barbero)"
                        : `${r.barber_name || "—"} ${r.appointment_id ? "· cita" : "· walk-in"}`}
                    </span>
                    <span>
                      {isOnline
                        ? <span style={{ color: "var(--text-tertiary)" }}>sin comisión</span>
                        : (r.eligible_for_commission
                            ? `com ${fmt(r.commission_cents)}`
                            : <span style={{ color: "var(--text-tertiary)" }}>sin comisión</span>)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <button
        onClick={exportCSV}
        disabled={txList.length === 0}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-50"
        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
      >
        <Download size={16} />
        Exportar CSV
      </button>
    </div>
  );
}
