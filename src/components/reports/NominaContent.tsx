import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { generateSPPaystub, generateW2Paystub, getNextCheckNumber } from "@/lib/paystub";
import { buildUnifiedProduction, type RawAppointment, type RawTransaction } from "@/lib/unifiedProduction";
import { computeGatewayFee, type ProcessorKey } from "@/lib/gatewayFees";
import { computeCommissionBonus } from "@/lib/commissionBonus";
import type { ProductSaleRow } from "@/hooks/useReportData";

function fmt(cents: number) {
  return "$" + (Math.abs(cents) / 100).toFixed(2);
}

function PayRow({ label, value, negative, highlight }: { label: string; value: string; negative?: boolean; highlight?: boolean }) {
  const color = highlight
    ? "var(--green, #16a34a)"
    : negative
    ? "var(--red)"
    : "var(--text-primary)";
  return (
    <div className="flex justify-between py-1.5">
      <span
        className="text-sm"
        style={{ color: highlight ? "var(--green, #16a34a)" : "var(--text-secondary)", fontWeight: highlight ? 700 : 400 }}
      >
        {label}
      </span>
      <span className="text-sm font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

interface NominaContentProps {
  barbers: any[];
  transactions: any[];
  appointments: any[];
  expenses: any[];
  settings: any;
  rangeLabel: string;
  productCommissionByBarber?: Record<string, number>;
  productSalesByBarber?: Record<string, ProductSaleRow[]>;
}

/** Collapsible product breakdown shown inside each commission-barber card. */
function ProductBreakdown({ rows }: { rows: ProductSaleRow[] }) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  // Group identical product names so we show one row per product (qty totals).
  const grouped = new Map<string, { name: string; qty: number; revenue: number; commission: number }>();
  for (const r of rows) {
    const key = r.product_name;
    const cur = grouped.get(key) || { name: key, qty: 0, revenue: 0, commission: 0 };
    cur.qty += r.quantity;
    cur.revenue += r.revenue_cents;
    cur.commission += r.commission_cents;
    grouped.set(key, cur);
  }
  const items = Array.from(grouped.values()).sort((a, b) => b.commission - a.commission);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[11px] font-semibold tracking-wide"
        style={{ color: "var(--text-tertiary)" }}
      >
        <ChevronDown size={12} style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.18s" }} />
        {open ? "Ocultar detalle" : "Ver detalle"} ({items.length})
      </button>
      {open && (
        <div className="mt-1.5 pl-4 space-y-1" style={{ borderLeft: "1px solid var(--divider)" }}>
          {items.map((it) => (
            <div key={it.name} className="flex justify-between text-[11px]" style={{ color: "var(--text-secondary)" }}>
              <span>{it.name} × {it.qty} <span style={{ color: "var(--text-tertiary)" }}>· {fmt(it.revenue)}</span></span>
              <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>+{fmt(it.commission)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Per-processor accumulator: subtotal, tip, and the actual fee charged on each row. */
interface ProcBucket {
  subtotal: number;
  tip: number;
  subtotalFee: number;
  tipFee: number;
}

function newBucket(): ProcBucket {
  return { subtotal: 0, tip: 0, subtotalFee: 0, tipFee: 0 };
}

export function NominaContent({ barbers, transactions, appointments, expenses, settings, rangeLabel, productCommissionByBarber = {}, productSalesByBarber = {} }: NominaContentProps) {
  // Fallback rate only used when processor is unknown (real Stripe/PayPal/ATH rates are per-row)
  const fallbackRate = settings?.digital_fee_rate || 0.10;

  // Unified rows: appointments (paid OR with receipt) + loose transactions, no double-counting
  const unifiedRows = buildUnifiedProduction(
    appointments as unknown as RawAppointment[],
    transactions as unknown as RawTransaction[]
  );

  const barberMap = new Map<string, {
    id: string; name: string; cash: number; digital: number; tipsCash: number; tipsDigital: number;
    digitalFee: number; tipFee: number;
    procs: Record<ProcessorKey, ProcBucket>;
    employment_type: string; commission_rate: number | null; retention_rate: number | null; weekly_salary: number | null;
    bonus_threshold_cents: number;
    employee_id: string | null; ssn_last4: string | null;
  }>();
  barbers.forEach(b => barberMap.set(b.id, {
    id: b.id, name: b.name, cash: 0, digital: 0, tipsCash: 0, tipsDigital: 0,
    digitalFee: 0, tipFee: 0,
    procs: { stripe: newBucket(), paypal: newBucket(), ath_movil: newBucket(), cash: newBucket(), unknown: newBucket() },
    employment_type: b.employment_type, commission_rate: b.commission_rate,
    retention_rate: b.retention_rate, weekly_salary: b.weekly_salary,
    bonus_threshold_cents: b.bonus_threshold_cents || 0,
    employee_id: b.employee_id || null, ssn_last4: b.ssn_last4 || null,
  }));

  unifiedRows.forEach((r) => {
    const e = barberMap.get(r.barber_id);
    if (!e) return;

    // Real per-row fee: % of (subtotal+tip) + flat per transaction
    // We attribute the % fee proportionally to subtotal vs tip, and the flat fee to subtotal.
    const subFee = computeGatewayFee(r.subtotal_cents, r.processor, fallbackRate);
    const tipFee = r.tip_cents > 0
      ? computeGatewayFee(r.subtotal_cents + r.tip_cents, r.processor, fallbackRate) - subFee
      : 0;

    if (r.pm === "digital") {
      e.digital += r.subtotal_cents;
      e.digitalFee += subFee;
    } else {
      e.cash += r.subtotal_cents;
    }
    if (r.tip_cents > 0) {
      if (r.pm === "digital") {
        e.tipsDigital += r.tip_cents;
        e.tipFee += Math.max(0, tipFee);
      } else {
        e.tipsCash += r.tip_cents;
      }
    }

    const bucket = e.procs[r.processor];
    bucket.subtotal += r.subtotal_cents;
    bucket.tip += r.tip_cents;
    bucket.subtotalFee += subFee;
    bucket.tipFee += Math.max(0, tipFee);
  });

  const commissionBarbers = Array.from(barberMap.values()).filter(b => b.employment_type === "commission");
  const charlieEntry = Array.from(barberMap.values()).find(b => b.employment_type === "w2_fixed");

  const commissionData = commissionBarbers.map(b => {
    const gross = b.cash + b.digital;
    const digitalFee = b.digitalFee;
    const production = b.cash + b.digital - digitalFee;
    const baseRate = b.commission_rate || 0.65;
    const bonus = computeCommissionBonus(baseRate, gross, b.bonus_threshold_cents);
    const commRate = bonus.effectiveRate;
    const retRate = b.retention_rate || 0;
    const preNet = Math.round(production * commRate);
    const retention = Math.round(preNet * retRate);
    const subtotal = preNet - retention;
    const totalTips = b.tipsCash + b.tipsDigital;
    const digitalTipTax = b.tipFee;
    const netTips = totalTips - digitalTipTax;
    const productCommission = productCommissionByBarber[b.id] || 0;
    // Payout = service commission + net tips + appointment-tied product commission
    const payout = subtotal + netTips + productCommission;
    return {
      id: b.id, name: b.name, gross, digitalFee, production,
      commRate, baseRate, bonusActive: bonus.bonusActive, thresholdCents: bonus.thresholdCents,
      retRate, preNet, retention, subtotal, totalTips, digitalTipTax, netTips, productCommission, payout,
    };
  });

  const charlieGross = charlieEntry ? charlieEntry.cash + charlieEntry.digital : 0;
  const charlieDigitalFee = charlieEntry ? charlieEntry.digitalFee : 0;
  const charlieProduction = charlieGross - charlieDigitalFee;
  const charlieW2Gross = charlieEntry?.weekly_salary || 57000;
  const charlieSS = Math.round(charlieW2Gross * 0.062);
  const charlieMedicare = Math.round(charlieW2Gross * 0.0145);
  const charliePR = Math.round(charlieW2Gross * 0.04);
  const charlieSINOT = Math.round(charlieW2Gross * 0.003);
  const charlieNet = charlieW2Gross - charlieSS - charlieMedicare - charliePR - charlieSINOT;

  const surplusA = charlieProduction - charlieW2Gross;
  const totalExpenses = expenses.reduce((s, e) => s + e.weekly_amount_cents, 0);
  const surplusB = surplusA - totalExpenses;
  const yvetteCap = settings?.yvette_weekly_cap_cents || 57000;
  const yvetteMinSurplus = settings?.yvette_min_surplus_cents || 30000;
  const yvettePayout: number = 0; // Yvette removed: surplus stays as shop income

  const company = { legal_entity: settings?.legal_entity, address: settings?.address, city: settings?.city };


  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
        Pool 1 — Comisión
      </div>
      {commissionData.map((b) => (
        <div key={b.name} className="rounded-xl p-4 card-elevated space-y-2">
          <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{b.name}</div>

          {/* Producción */}
          <PayRow label="Producción bruta" value={fmt(b.gross)} />
          {b.digitalFee > 0 && (
            <PayRow label="Cuota digital" value={`-${fmt(b.digitalFee)}`} negative />
          )}
          <PayRow label="Producción neta" value={fmt(b.production)} />

          {/* Comisión — green when bonus tier active */}
          <PayRow
            highlight={b.bonusActive}
            label={
              b.bonusActive
                ? `Comisión ${(b.commRate * 100).toFixed(0)}% ✨ (bonificación +5%)${b.retRate > 0 ? ` (menos ${(b.retRate * 100).toFixed(0)}% retención)` : ''}`
                : `Comisión ${(b.commRate * 100).toFixed(0)}%${b.retRate > 0 ? ` (menos ${(b.retRate * 100).toFixed(0)}% retención)` : ''}`
            }
            value={fmt(b.subtotal)}
          />
          {b.bonusActive && (
            <div className="text-[11px] -mt-1 pl-1" style={{ color: "var(--green, #16a34a)" }}>
              Tasa subió de {(b.baseRate * 100).toFixed(0)}% a {(b.commRate * 100).toFixed(0)}% esta semana.
            </div>
          )}

          {/* Propinas — una sola línea neta */}
          {b.totalTips > 0 && (
            <>
              <PayRow label="Propinas" value={`+${fmt(b.netTips)}`} />
              {b.digitalTipTax > 0 && (
                <div className="text-[11px] -mt-1 pl-1" style={{ color: "var(--text-tertiary)" }}>
                  Propinas brutas {fmt(b.totalTips)} menos cuota digital de {fmt(b.digitalTipTax)} cobrada por el procesador.
                </div>
              )}
            </>
          )}

          {/* Comisión de productos vendidos en citas */}
          {b.productCommission > 0 && (
            <>
              <PayRow label="Comisión de productos" value={`+${fmt(b.productCommission)}`} />
              <div className="text-[11px] -mt-1 pl-1" style={{ color: "var(--text-tertiary)" }}>
                Solo productos vendidos dentro de citas.
              </div>
              <ProductBreakdown rows={productSalesByBarber[b.id] || []} />
            </>
          )}

          <div className="divider-hairline pt-2">
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Pago Neto (Comisión + Propinas{b.productCommission > 0 ? " + Productos" : ""})</div>
            <div className="text-xl font-black" style={{ color: "var(--accent-color)" }}>{fmt(b.payout)}</div>
          </div>
          <button
            onClick={async () => {
              const checkNumber = await getNextCheckNumber();
              generateSPPaystub({
                name: b.name,
                professionalFees: b.preNet,
                retainedEarnings: b.retention,
                netTips: b.netTips,
                productCommission: b.productCommission,
                checkDate: rangeLabel,
                checkNumber,
                company,
              });
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-xs mt-2"
            style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
          >
            <FileText size={14} /> Generar Talonario
          </button>
        </div>
      ))}

      <div className="text-xs font-semibold uppercase tracking-wider mb-2 mt-6" style={{ color: "var(--text-tertiary)" }}>
        Pool 2 — W-2
      </div>

      {charlieEntry && (
        <div className="rounded-xl p-4 card-elevated space-y-2">
          <div className="font-semibold" style={{ color: "var(--text-primary)" }}>{charlieEntry.name} — W-2 Fijo</div>
          <PayRow label="Producción bruta" value={fmt(charlieGross)} />
          <PayRow label="Cuota digital" value={`-${fmt(charlieDigitalFee)}`} negative />
          <PayRow label="Producción neta" value={fmt(charlieProduction)} />
          <PayRow label="W-2 Bruto" value={fmt(charlieW2Gross)} />
          <PayRow label="Seg. Social 6.2%" value={`-${fmt(charlieSS)}`} negative />
          <PayRow label="Medicare 1.45%" value={`-${fmt(charlieMedicare)}`} negative />
          <PayRow label="Contrib. Estatal 4%" value={`-${fmt(charliePR)}`} negative />
          <PayRow label="Seg. Incapacidad 0.3%" value={`-${fmt(charlieSINOT)}`} negative />
          <div className="divider-hairline pt-2">
            <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Cheque Neto</div>
            <div className="text-xl font-black" style={{ color: "var(--accent-color)" }}>{fmt(charlieNet)}</div>
          </div>

          <div className="text-xs font-semibold uppercase tracking-wider mt-3" style={{ color: "var(--text-tertiary)" }}>Gastos</div>
          {expenses.map((e) => (
            <PayRow key={e.id} label={e.name} value={`-${fmt(e.weekly_amount_cents)}`} negative />
          ))}

          <button
            onClick={async () => {
              const checkNumber = await getNextCheckNumber();
              generateW2Paystub({
                name: charlieEntry.name,
                employeeId: charlieEntry.employee_id || undefined,
                ssnLast4: charlieEntry.ssn_last4 || undefined,
                gross: charlieW2Gross,
                socSec: charlieSS,
                medicare: charlieMedicare,
                stIncome: charliePR,
                stDisIns: charlieSINOT,
                netCheck: charlieNet,
                payPeriodStart: rangeLabel.split("–")[0]?.trim() || rangeLabel,
                payPeriodEnd: rangeLabel.split("–")[1]?.trim() || rangeLabel,
                checkDate: rangeLabel,
                checkNumber,
                salary: charlieW2Gross,
                company,
              });
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-xs mt-2"
            style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
          >
            <FileText size={14} /> Generar Talonario W-2
          </button>
        </div>
      )}

      {yvettePayout > 0 && (() => {
        const yvetteW2Gross = yvettePayout;
        const yvetteSS = Math.round(yvetteW2Gross * 0.062);
        const yvetteMedicare = Math.round(yvetteW2Gross * 0.0145);
        const yvettePR = Math.round(yvetteW2Gross * 0.04);
        const yvetteSINOT = Math.round(yvetteW2Gross * 0.003);
        const yvetteNet = yvetteW2Gross - yvetteSS - yvetteMedicare - yvettePR - yvetteSINOT;
        const yvetteBarber = Array.from(barberMap.values()).find(e => e.employment_type === "w2_variable");
        const yvetteName = yvetteBarber?.name || "Yvette";
        // employee data comes from barberMap entry
        return (
          <div className="rounded-xl p-4 card-elevated space-y-2">
            <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {yvetteName} — W-2 Variable
            </div>
            <PayRow label="W-2 Bruto" value={fmt(yvetteW2Gross)} />
            <PayRow label="Seg. Social 6.2%" value={`-${fmt(yvetteSS)}`} negative />
            <PayRow label="Medicare 1.45%" value={`-${fmt(yvetteMedicare)}`} negative />
            <PayRow label="Contrib. Estatal 4%" value={`-${fmt(yvettePR)}`} negative />
            <PayRow label="Seg. Incapacidad 0.3%" value={`-${fmt(yvetteSINOT)}`} negative />
            <div className="divider-hairline pt-2">
              <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>Cheque Neto</div>
              <div className="text-xl font-black" style={{ color: "var(--accent-color)" }}>{fmt(yvetteNet)}</div>
            </div>
            <button
              onClick={async () => {
                const checkNumber = await getNextCheckNumber();
                generateW2Paystub({
                  name: yvetteName,
                  employeeId: yvetteBarber?.employee_id || undefined,
                  ssnLast4: yvetteBarber?.ssn_last4 || undefined,
                  gross: yvetteW2Gross,
                  socSec: yvetteSS,
                  medicare: yvetteMedicare,
                  stIncome: yvettePR,
                  stDisIns: yvetteSINOT,
                  netCheck: yvetteNet,
                  payPeriodStart: rangeLabel.split("–")[0]?.trim() || rangeLabel,
                  payPeriodEnd: rangeLabel.split("–")[1]?.trim() || rangeLabel,
                  checkDate: rangeLabel,
                  checkNumber,
                  salary: yvetteW2Gross,
                  company,
                });
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-xs mt-2"
              style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
            >
              <FileText size={14} /> Generar Talonario W-2
            </button>
          </div>
        );
      })()}
    </div>
  );
}
