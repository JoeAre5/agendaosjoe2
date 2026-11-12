import { useMemo } from "react";
import { buildUnifiedProduction, type RawAppointment, type RawTransaction, type UnifiedRow } from "@/lib/unifiedProduction";

interface Appointment {
  id: string;
  service_name: string;
  starts_at: string;
  status: string;
  paid: boolean;
  price_cents: number;
  tip_cents: number;
  amount_paid_cents: number;
  payment_method: string | null;
  notes: string | null;
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
  barberId: string;
  appointments: Appointment[];
  transactions: Transaction[];
  language: "es" | "en";
}

function fmt(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

/**
 * Per-barber service summary for the selected week.
 * Groups appointment-source production by `service_name` (case-insensitive),
 * and bundles loose transactions (walk-ins / product-only) into a single
 * "Walk-in / Otros" row so the grand total reconciles with the paystub's
 * "Producción bruta" line.
 */
export function ServiceSummaryCard({ barberId, appointments, transactions, language }: Props) {
  const { rows, walkInTotal, walkInCount, grandTotal } = useMemo(() => {
    // Index appointment by id for service_name lookup
    const apptById = new Map<string, Appointment>();
    for (const a of appointments) apptById.set(a.id, a);

    const unified: UnifiedRow[] = buildUnifiedProduction(
      appointments as unknown as RawAppointment[],
      transactions as unknown as RawTransaction[]
    ).filter((r) => r.barber_id === barberId);

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
    return { rows, walkInTotal, walkInCount, grandTotal };
  }, [barberId, appointments, transactions, language]);

  if (rows.length === 0 && walkInCount === 0) {
    return (
      <div className="rounded-xl p-4 card-elevated">
        <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
          {language === "es" ? "Resumen de Servicios" : "Service Summary"}
        </div>
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {language === "es" ? "Sin servicios esta semana." : "No services this week."}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 card-elevated space-y-1">
      <div className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
        {language === "es" ? "Resumen de Servicios" : "Service Summary"}
      </div>

      {rows.map((row) => (
        <div key={row.display} className="flex justify-between items-baseline py-1.5">
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
              style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
            >
              {row.count}×
            </span>
            <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
              {row.display}
            </span>
          </div>
          <span className="text-sm font-semibold tabular-nums shrink-0 pl-3" style={{ color: "var(--text-primary)" }}>
            {fmt(row.total)}
          </span>
        </div>
      ))}

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
          <span className="text-sm font-semibold tabular-nums shrink-0 pl-3" style={{ color: "var(--text-primary)" }}>
            {fmt(walkInTotal)}
          </span>
        </div>
      )}

      <div className="divider-hairline flex justify-between items-baseline pt-3 mt-1">
        <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
          {language === "es" ? "Producción Total" : "Total Production"}
        </span>
        <span className="text-lg font-black tabular-nums" style={{ color: "var(--accent-color)" }}>
          {fmt(grandTotal)}
        </span>
      </div>
    </div>
  );
}
