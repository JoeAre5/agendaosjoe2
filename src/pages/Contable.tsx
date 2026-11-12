import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { backToMenu } from "@/lib/navHelpers";
import { Copy, Check, Loader2 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { WeekBanner } from "@/components/WeekBanner";
import { useWeekSelector } from "@/hooks/useWeekSelector";
import { useReportData } from "@/hooks/useReportData";
import { buildUnifiedProduction, type RawAppointment, type RawTransaction } from "@/lib/unifiedProduction";
import { computeCommissionBonus } from "@/lib/commissionBonus";
import { computeGatewayFee, type ProcessorKey } from "@/lib/gatewayFees";

function fmt(cents: number) {
  return "$" + (Math.abs(cents) / 100).toFixed(2);
}

interface ProcBucket { subtotal: number; tip: number; subtotalFee: number; tipFee: number }
const newBucket = (): ProcBucket => ({ subtotal: 0, tip: 0, subtotalFee: 0, tipFee: 0 });

export default function Contable() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const week = useWeekSelector();
  const { barbers, transactions, appointments, expenses, settings, productCommissionByBarber, loading } = useReportData(week.weekStart, week.weekEnd, week.scope);
  const [copied, setCopied] = useState(false);

  // Same fallback used by NominaContent (only for unknown processors)
  const fallbackRate = settings?.digital_fee_rate || 0.10;

  // Single source of truth — same unified rows Nómina uses
  const unifiedRows = buildUnifiedProduction(
    appointments as unknown as RawAppointment[],
    transactions as unknown as RawTransaction[]
  );

  type Entry = {
    id: string; name: string; cash: number; digital: number;
    tipsCash: number; tipsDigital: number;
    digitalFee: number; tipFee: number;
    procs: Record<ProcessorKey, ProcBucket>;
    employment_type: string; commission_rate: number | null;
    retention_rate: number | null; weekly_salary: number | null;
    bonus_threshold_cents: number;
  };

  const barberMap = new Map<string, Entry>();
  barbers.forEach(b => barberMap.set(b.id, {
    id: b.id, name: b.name, cash: 0, digital: 0, tipsCash: 0, tipsDigital: 0,
    digitalFee: 0, tipFee: 0,
    procs: { stripe: newBucket(), paypal: newBucket(), ath_movil: newBucket(), cash: newBucket(), unknown: newBucket() },
    employment_type: b.employment_type, commission_rate: b.commission_rate,
    retention_rate: b.retention_rate, weekly_salary: b.weekly_salary,
    bonus_threshold_cents: b.bonus_threshold_cents || 0,
  }));

  unifiedRows.forEach((r) => {
    const e = barberMap.get(r.barber_id);
    if (!e) return;
    // Real per-row gateway fee — matches Nómina exactly
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
  });

  const entries = Array.from(barberMap.values());
  const totalCash = entries.reduce((s, b) => s + b.cash, 0);

  const weekStartDay = week.weekStart.getDate();
  const weekEndDay = week.weekEnd.getDate();

  const lines: string[] = [`Buenas, aquí el resumen de la semana de *${weekStartDay}-${weekEndDay}*`, ""];

  // Commission barbers — same math as NominaContent
  entries.filter(b => b.employment_type === "commission").forEach(b => {
    const gross = b.cash + b.digital;
    const production = gross - b.digitalFee;
    const baseRate = b.commission_rate || 0.65;
    const { effectiveRate } = computeCommissionBonus(baseRate, gross, b.bonus_threshold_cents);
    const retRate = b.retention_rate || 0;
    const preNet = Math.round(production * effectiveRate);
    const retention = Math.round(preNet * retRate);
    const subtotal = preNet - retention;
    const totalTips = b.tipsCash + b.tipsDigital;
    const netTips = totalTips - b.tipFee;
    const productCommission = productCommissionByBarber[b.id] || 0;
    const payout = subtotal + netTips + productCommission;

    lines.push(b.name);
    lines.push(`*Comisión: ${fmt(subtotal)}*`);
    if (totalTips > 0) {
      lines.push(`Propinas: ${fmt(netTips)}`);
    }
    if (productCommission > 0) {
      lines.push(`Productos: ${fmt(productCommission)}`);
    }
    lines.push(`*Total a pagar: ${fmt(payout)}*`);
    lines.push("");
  });

  // Charlie W-2 — same surplus math as Nómina
  const charlie = entries.find(b => b.employment_type === "w2_fixed");
  let surplusB = 0;
  if (charlie) {
    const w2Gross = charlie.weekly_salary || 57000;
    lines.push(charlie.name);
    lines.push(`*W-2: ${fmt(w2Gross)}*`);
    lines.push("");

    const charlieProduction = charlie.cash + charlie.digital - charlie.digitalFee;
    const totalExpenses = expenses.reduce((s, e) => s + e.weekly_amount_cents, 0);
    surplusB = charlieProduction - w2Gross - totalExpenses;
  }

  // Yvette W-2 Variable — same trigger as Nómina
  const yvetteCap = settings?.yvette_weekly_cap_cents || 57000;
  const yvetteMinSurplus = settings?.yvette_min_surplus_cents || 30000;
  const yvettePayout: number = 0; // Yvette removed: surplus stays as shop income
  if (yvettePayout > 0) {
    const yvetteName = entries.find(b => b.employment_type === "w2_variable")?.name || "Yvette";
    lines.push(yvetteName);
    lines.push(`*W-2: ${fmt(yvettePayout)}*`);
    lines.push("");
  }

  lines.push(`*Efectivo Recibido: ${fmt(totalCash)}*`);

  const message = lines.join("\n");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title="Para el Contable"
        onBack={() => navigate(backToMenu(searchParams))}
        actions={
          <button onClick={handleCopy} className="p-2 rounded-lg" style={{ background: "var(--accent-dim)" }}>
            {copied ? <Check size={18} style={{ color: "var(--green)" }} /> : <Copy size={18} style={{ color: "var(--accent-color)" }} />}
          </button>
        }
      />

      <WeekBanner label={week.label} scope={week.scope} onPrev={week.goPrev} onNext={week.goNext} onToday={week.goToday} onScopeChange={week.setScope} onPickDate={week.goToDate} showScopeToggle selectedDate={week.weekStart} />

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : (
        <div className="px-4 py-4 pb-24">
          <div className="rounded-xl p-4 card-elevated whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
            {message}
          </div>
          {copied && (
            <div className="text-center text-sm font-semibold mt-3" style={{ color: "var(--green)" }}>
              Copiado ✓
            </div>
          )}
          <p className="text-center text-xs mt-4" style={{ color: "var(--text-tertiary)" }}>
            Copia y pega en WhatsApp
          </p>
        </div>
      )}
    </div>
  );
}
