import { useMemo } from "react";
import { Trophy, Scissors } from "lucide-react";
import { buildUnifiedProduction, type RawAppointment, type RawTransaction, type UnifiedRow } from "@/lib/unifiedProduction";

interface Appointment {
  id: string;
  service_name?: string | null;
  starts_at: string;
  status: string;
  paid?: boolean;
  price_cents: number;
  tip_cents: number;
  amount_paid_cents: number;
  payment_method: string | null;
  notes?: string | null;
  barber_id: string;
}

interface Transaction {
  id: string;
  barber_id: string;
  appointment_id: string | null;
  created_at: string;
  status: string;
  payment_method: string;
  subtotal_cents: number;
  tip_cents: number;
  total_cents: number;
}

interface Props {
  appointments: Appointment[];
  transactions: Transaction[];
  language: "es" | "en";
  period?: "day" | "week" | "month";
}

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/**
 * Shop-wide service summary for the selected week (all barbers combined).
 * Groups appointment-source production by service_name (case-insensitive),
 * bundles loose transactions as "Walk-in / Otros" so the grand total reconciles
 * with the shop's total weekly production. Highlights the top revenue service
 * as the "Service of the Week".
 */
export function ShopServiceSummaryCard({ appointments, transactions, language, period = "week" }: Props) {
  const { rows, walkInTotal, walkInCount, grandTotal, topService } = useMemo(() => {
    const apptById = new Map<string, Appointment>();
    for (const a of appointments) apptById.set(a.id, a);

    const unified: UnifiedRow[] = buildUnifiedProduction(
      appointments as unknown as RawAppointment[],
      transactions as unknown as RawTransaction[],
    );

    const groups = new Map<string, { display: string; count: number; total: number }>();
    let walkInTotal = 0;
    let walkInCount = 0;
    let grandTotal = 0;

    for (const r of unified) {
      grandTotal += r.subtotal_cents;
      if (r.source === "appointment") {
        const apptId = r.id.replace(/^appt:/, "");
        const appt = apptById.get(apptId);
        const raw = (appt?.service_name || "").trim();
        const display = raw || (language === "es" ? "Servicio sin nombre" : "Unnamed service");
        const key = display.toLowerCase();
        const existing = groups.get(key);
        if (existing) {
          existing.count += 1;
          existing.total += r.subtotal_cents;
        } else {
          groups.set(key, { display, count: 1, total: r.subtotal_cents });
        }
      } else {
        walkInCount += 1;
        walkInTotal += r.subtotal_cents;
      }
    }

    const rows = Array.from(groups.values()).sort((a, b) => b.total - a.total);
    // "Service of the week" = highest revenue named service (excludes walk-ins)
    const topService = rows[0] || null;
    return { rows, walkInTotal, walkInCount, grandTotal, topService };
  }, [appointments, transactions, language]);

  const empty = rows.length === 0 && walkInCount === 0;

  return (
    <div className="rounded-2xl p-5 mb-4 card-elevated">
      <div className="flex items-center gap-2 mb-3">
        <Scissors size={16} style={{ color: "var(--accent-color)" }} />
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--text-tertiary)", letterSpacing: "0.5px" }}
        >
          {language === "es" ? "Servicios de la Barbería" : "Shop Services"}
        </span>
      </div>

      {empty ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          {language === "es" ? "Sin servicios en este período." : "No services in this period."}
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {rows.map((row, i) => {
              const isTop = i === 0;
              return (
                <div key={row.display} className="flex justify-between items-baseline py-1.5">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        background: isTop ? "var(--accent-color)" : "var(--accent-dim)",
                        color: isTop ? "var(--bg-base)" : "var(--accent-color)",
                      }}
                    >
                      {row.count}×
                    </span>
                    <span
                      className="text-sm truncate"
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: isTop ? 700 : 400,
                      }}
                    >
                      {row.display}
                    </span>
                  </div>
                  <span
                    className="text-sm font-semibold tabular-nums shrink-0 pl-3"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {fmt(row.total)}
                  </span>
                </div>
              );
            })}

            {walkInCount > 0 && (
              <div className="flex justify-between items-baseline py-1.5">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span
                    className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
                  >
                    {walkInCount}×
                  </span>
                  <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                    {language === "es" ? "Walk-in / Otros" : "Walk-in / Other"}
                  </span>
                </div>
                <span
                  className="text-sm font-semibold tabular-nums shrink-0 pl-3"
                  style={{ color: "var(--text-primary)" }}
                >
                  {fmt(walkInTotal)}
                </span>
              </div>
            )}
          </div>

          {/* Grand total — should match Producción Semanal */}
          <div className="divider-hairline flex justify-between items-baseline pt-3 mt-2">
            <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {language === "es" ? "Producción Total" : "Total Production"}
            </span>
            <span className="text-lg font-black tabular-nums" style={{ color: "var(--accent-color)" }}>
              {fmt(grandTotal)}
            </span>
          </div>

          {/* Service of the Week highlight */}
          {topService && (
            <div className="card-portal-hero mt-4 p-3 rounded-xl flex items-start gap-2 relative overflow-hidden">
              <Trophy size={16} className="shrink-0 mt-0.5 relative z-[1]" style={{ color: "var(--portal-hero-fg)" }} />
              <div className="min-w-0 relative z-[1]">
                <div
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--portal-hero-fg-muted)", letterSpacing: "0.5px" }}
                >
                  {language === "es" ? ({ day: "Servicio del día", week: "Servicio de la semana", month: "Servicio del mes" }[period]) : ({ day: "Service of the Day", week: "Service of the Week", month: "Service of the Month" }[period])}
                </div>
                <div className="text-sm font-bold mt-0.5" style={{ color: "var(--portal-hero-fg)" }}>
                  {topService.display}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--portal-hero-fg-muted)" }}>
                  {topService.count}×{" "}
                  {language === "es" ? "citas · " : "appointments · "}
                  <span className="font-semibold" style={{ color: "var(--portal-hero-fg)" }}>
                    {fmt(topService.total)}
                  </span>{" "}
                 
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
