import { FileText } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { buildUnifiedProduction, type RawAppointment, type RawTransaction } from "@/lib/unifiedProduction";
import { computeGatewayFee, type ProcessorKey } from "@/lib/gatewayFees";
import type { ProductSaleRow } from "@/hooks/useReportData";

function fmt(cents: number) {
  return "$" + (Math.abs(cents) / 100).toFixed(2);
}

interface BarberCard { name: string; color: string | null; gross: number; cash: number; digital: number; digitalFee: number; production: number; }
interface BarberPayout { name: string; payout: number; }
interface TipRow { name: string; tips: number; digitalTipTax: number; netTips: number; }
interface ExpenseRow { name: string; amount: number; }
interface ProductSummary { gross: number; cost: number; commission: number; margin: number; units: number; transactions: number; }

function useComputedData(barbers: any[], transactions: any[], appointments: any[], expenses: any[], settings: any, productSalesDetail: ProductSaleRow[]) {
  // Fallback only used when processor is unknown; real Stripe/PayPal/ATH rates applied per row
  const fallbackRate = settings?.digital_fee_rate || 0.10;

  // Single source of truth — no double counting
  const unifiedRows = buildUnifiedProduction(
    appointments as unknown as RawAppointment[],
    transactions as unknown as RawTransaction[]
  );

  const barberMap = new Map<string, {
    name: string; color: string | null; cash: number; digital: number;
    digitalFee: number; tipFee: number;
    employment_type: string; commission_rate: number | null; retention_rate: number | null; weekly_salary: number | null;
    tipsCash: number; tipsDigital: number;
  }>();

  barbers.forEach(b => {
    barberMap.set(b.id, {
      name: b.name, color: b.color, cash: 0, digital: 0,
      digitalFee: 0, tipFee: 0,
      employment_type: b.employment_type, commission_rate: b.commission_rate,
      retention_rate: b.retention_rate, weekly_salary: b.weekly_salary,
      tipsCash: 0, tipsDigital: 0,
    });
  });

  unifiedRows.forEach((r) => {
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

  const barberCards: BarberCard[] = [];
  const barberPayouts: BarberPayout[] = [];
  const tipRows: TipRow[] = [];
  let totalCommissionPayouts = 0;

  barberMap.forEach((entry) => {
    const digital = entry.digital;
    const digitalFee = entry.digitalFee;
    const production = entry.cash + digital - digitalFee;
    const gross = entry.cash + digital;

    if (entry.employment_type !== "w2_variable") {
      barberCards.push({ name: entry.name, color: entry.color, gross, cash: entry.cash, digital, digitalFee, production });
    }

    if (entry.employment_type === "commission") {
      const commRate = entry.commission_rate || 0.65;
      const retRate = entry.retention_rate || 0;
      const preNet = Math.round(production * commRate);
      const retention = Math.round(preNet * retRate);
      const subtotal = preNet - retention;
      const digitalTipTax = entry.tipFee;
      const totalTips = entry.tipsCash + entry.tipsDigital;
      const netTips = totalTips - digitalTipTax;
      // Shop pays the barber: commission earnings + net tips (tips are pass-through)
      const payout = subtotal + netTips;
      barberPayouts.push({ name: entry.name, payout });
      totalCommissionPayouts += payout;
      if (totalTips > 0) {
        tipRows.push({ name: entry.name, tips: totalTips, digitalTipTax, netTips });
      }
    } else if (entry.employment_type === "w2_fixed") {
      const payout = entry.weekly_salary || 57000;
      barberPayouts.push({ name: entry.name, payout });
    }
  });

  const charlieEntry = Array.from(barberMap.values()).find(e => e.employment_type === "w2_fixed");
  const charlieDigital = charlieEntry?.digital || 0;
  const charlieCash = charlieEntry?.cash || 0;
  const charlieDigitalFee = charlieEntry?.digitalFee || 0;
  const charlieProduction = charlieCash + charlieDigital - charlieDigitalFee;
  const charlieSalary = charlieEntry?.weekly_salary || 57000;
  const surplusA = charlieProduction - charlieSalary;
  const totalExpensesAmt = expenses.reduce((s: number, e: any) => s + (e.weekly_amount_cents || 0), 0);
  const surplusB = surplusA - totalExpensesAmt;
  const yvetteCap = settings?.yvette_weekly_cap_cents || 57000;
  const yvetteMinSurplus = settings?.yvette_min_surplus_cents || 30000;
  const yvettePayout: number = 0; // Yvette removed: surplus stays as shop income

  if (yvettePayout > 0) {
    const yvetteEntry = Array.from(barberMap.values()).find(e => e.employment_type === "w2_variable");
    if (yvetteEntry) {
      barberPayouts.push({ name: yvetteEntry.name, payout: yvettePayout });
    }
  }

  const totalGross = barberCards.reduce((s, b) => s + b.gross, 0);
  const totalCash = barberCards.reduce((s, b) => s + b.cash, 0);
  const totalDigital = barberCards.reduce((s, b) => s + b.digital, 0);
  const totalDigitalFee = barberCards.reduce((s, b) => s + b.digitalFee, 0);
  const totalProduction = barberCards.reduce((s, b) => s + b.production, 0);
  const expenseRows: ExpenseRow[] = expenses.map((e: any) => ({ name: e.name, amount: e.weekly_amount_cents }));
  const totalBarberPayouts = barberPayouts.reduce((s, b) => s + b.payout, 0);
  const totalTipsPaid = tipRows.reduce((s, t) => s + t.netTips, 0);
  const totalTipFeesRetained = tipRows.reduce((s, t) => s + t.digitalTipTax, 0);

  // Product P&L for the shop (aggregate only — line-item drill-down lives in the Shop tab).
  // Note: revenue, cost, and commission shown here are gross numbers from product_sales view.
  // Barber commissions for products are NOT in barberPayouts (those are service-only),
  // so we subtract them here as a separate shop expense.
  const productSummary: ProductSummary = (() => {
    const txIds = new Set<string>();
    let gross = 0, cost = 0, commission = 0, units = 0;
    for (const r of productSalesDetail) {
      gross += r.revenue_cents;
      cost += r.cost_cents;
      commission += r.commission_cents;
      units += r.quantity;
      txIds.add(r.transaction_id);
    }
    return { gross, cost, commission, margin: gross - cost - commission, units, transactions: txIds.size };
  })();

  // Net profit = service production + tip fees retained − service payouts − operating expenses
  //            + product margin (gross − cost − barber product commission)
  const netProfit =
    totalProduction + totalTipFeesRetained - totalBarberPayouts - totalExpensesAmt
    + productSummary.margin;

  return {
    barberCards, barberPayouts, tipRows, expenseRows,
    totalGross, totalCash, totalDigital, totalDigitalFee, totalProduction,
    totalTipsPaid, totalTipFeesRetained,
    totalExpenses: totalExpensesAmt, totalBarberPayouts, netProfit,
    surplusA, surplusB, yvettePayout, yvetteCap, yvetteMinSurplus,
    productSummary,
  };
}

function generateReport(data: ReturnType<typeof useComputedData>, rangeLabel: string, settings: any) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>El Cuadre - ${rangeLabel}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;padding:24px;max-width:600px;margin:auto;color:#111}
h1{font-size:20px;margin-bottom:4px}h2{font-size:14px;margin:16px 0 8px;text-transform:uppercase;letter-spacing:1px;color:#888}
.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:14px}
.row.neg{color:#b91c1c}.row.total{font-weight:700;font-size:18px;border-top:2px solid #111;border-bottom:none;padding-top:12px}
.green{color:#1a6e3f}.red{color:#b91c1c}.header{text-align:center;margin-bottom:24px}
.footer{text-align:center;margin-top:32px;font-size:11px;color:#aaa}
</style></head><body>
<div class="header"><h1>${settings?.shop_name || "Charlie's Barbershop"}</h1><p style="font-size:12px;color:#888">${settings?.legal_entity || "C&O Ventures LLC"} · ${settings?.city || ""}</p><p style="font-size:13px;margin-top:8px;font-weight:600">${rangeLabel}</p></div>
<h2>Producción por Barbero</h2>
${data.barberCards.map(b => `<div class="row"><span>● ${b.name}</span><span>${fmt(b.production)}</span></div>
<div style="padding-left:16px;font-size:12px;color:#666"><span>Efectivo: ${fmt(b.cash)}</span> · <span>Digital: ${fmt(b.digital)}</span> · <span>Fee: -${fmt(b.digitalFee)}</span></div>`).join("")}
<h2>Ingresos</h2>
<div class="row"><span>Producción Bruta</span><span>${fmt(data.totalGross)}</span></div>
<div class="row"><span>Efectivo</span><span>${fmt(data.totalCash)}</span></div>
<div class="row"><span>Digital (ATH/Stripe/PayPal)</span><span>${fmt(data.totalDigital)}</span></div>
<div class="row neg"><span>Cargo digital estimado</span><span>-${fmt(data.totalDigitalFee)}</span></div>
<div class="row"><span>Cargo real verificado</span><span style="color:#888">Pendiente</span></div>
<div class="row" style="font-weight:600"><span>Producción Neta</span><span>${fmt(data.totalProduction)}</span></div>
<h2>Pagos a Barberos (comisión + propinas)</h2>
${data.barberPayouts.map(b => `<div class="row neg"><span>${b.name}</span><span>-${fmt(b.payout)}</span></div>`).join("")}
${data.tipRows.length > 0 ? `<h2>Propinas (desglose)</h2>${data.tipRows.map(tr => `<div class="row neg"><span>${tr.name} — pagado</span><span>-${fmt(tr.netTips)}</span></div>${tr.digitalTipTax > 0 ? `<div class="row"><span>${tr.name} — fee retenido</span><span>+${fmt(tr.digitalTipTax)}</span></div>` : ''}`).join("")}` : ''}
<h2>Gastos Operativos</h2>
${data.expenseRows.map(e => `<div class="row neg"><span>${e.name}</span><span>-${fmt(e.amount)}</span></div>`).join("")}
<div class="row total"><span>GANANCIA NETA</span><span class="${data.netProfit >= 0 ? 'green' : 'red'}">${data.netProfit >= 0 ? '+' : '-'}${fmt(data.netProfit)}</span></div>

</body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden card-elevated">
      <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--divider)" }}>
        {title}
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  );
}

function Row({ label, value, negative, bold }: { label: string; value: string; negative?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between py-2" style={{ borderBottom: "1px solid var(--divider)" }}>
      <span className={`text-sm ${bold ? 'font-bold' : ''}`} style={{ color: "var(--text-primary)" }}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold' : 'font-semibold'}`} style={{ color: negative ? "var(--red)" : "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

interface CuadreContentProps {
  barbers: any[];
  transactions: any[];
  appointments: any[];
  expenses: any[];
  settings: any;
  rangeLabel: string;
  productSalesDetail?: ProductSaleRow[];
}

export function CuadreContent({ barbers, transactions, appointments, expenses, settings, rangeLabel, productSalesDetail = [] }: CuadreContentProps) {
  const { t } = useTranslation();
  const data = useComputedData(barbers, transactions, appointments, expenses, settings, productSalesDetail);
  

  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      <Section title={t("reports.production")}>
        {data.barberCards.map((b) => (
          <div key={b.name} className="rounded-xl p-4 card-elevated mb-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full" style={{ background: b.color || "var(--accent-color)" }} />
              <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{b.name}</span>
              <span className="ml-auto font-bold" style={{ color: "var(--text-primary)" }}>{fmt(b.production)}</span>
            </div>
            <div className="flex gap-4 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span>Efectivo: {fmt(b.cash)}</span>
              <span>Digital: {fmt(b.digital)}</span>
              <span>Fee: -{fmt(b.digitalFee)}</span>
            </div>
          </div>
        ))}
      </Section>

      <Section title={t("reports.income")}>
        <Row label="Producción Bruta" value={fmt(data.totalGross)} />
        <Row label="Efectivo" value={fmt(data.totalCash)} />
        <Row label="Digital (ATH/Stripe/PayPal)" value={fmt(data.totalDigital)} />
        <Row label="Cargo digital estimado" value={`-${fmt(data.totalDigitalFee)}`} negative />
        <Row label="Cargo real verificado" value="Pendiente" />
        <Row label="Producción Neta" value={fmt(data.totalProduction)} bold />
      </Section>

      <Section title={t("reports.barberPayouts")}>
        {data.barberPayouts.map((b) => (
          <Row key={b.name} label={b.name} value={`-${fmt(b.payout)}`} negative />
        ))}
        <div className="text-xs pt-2 pb-1" style={{ color: "var(--text-tertiary)" }}>
          Incluye comisión + propinas netas pagadas al barbero.
        </div>
      </Section>

      {data.tipRows.length > 0 && (
        <Section title="Propinas (desglose)">
          {data.tipRows.map((tr) => (
            <div key={tr.name}>
              <Row label={`${tr.name} — pagado al barbero`} value={`-${fmt(tr.netTips)}`} negative />
              {tr.digitalTipTax > 0 && (
                <Row label={`${tr.name} — fee digital retenido`} value={`+${fmt(tr.digitalTipTax)}`} />
              )}
            </div>
          ))}
        </Section>
      )}

      <Section title={t("reports.opExpenses")}>
        {data.expenseRows.map((e) => (
          <Row key={e.name} label={e.name} value={`-${fmt(e.amount)}`} negative />
        ))}
      </Section>

      {data.productSummary.gross > 0 && (
        <Section title="Productos (P&L)">
          <Row label={`Ventas (${data.productSummary.units} u · ${data.productSummary.transactions} tx)`} value={`+${fmt(data.productSummary.gross)}`} />
          <Row label="Costo de mercancía (COGS)" value={`-${fmt(data.productSummary.cost)}`} negative />
          <Row label="Comisión pagada al barbero" value={`-${fmt(data.productSummary.commission)}`} negative />
          <Row label="Margen de productos" value={`${data.productSummary.margin >= 0 ? '+' : '-'}${fmt(data.productSummary.margin)}`} bold />
          <div className="text-xs pt-2 pb-1" style={{ color: "var(--text-tertiary)" }}>
            Desglose por producto y transacción en la pestaña <strong>Shop</strong>.
          </div>
        </Section>
      )}

      <div className="rounded-xl p-4 card-elevated">
        <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
          {t("reports.netProfit")}
        </div>
        <div
          className="text-2xl font-black"
          style={{ color: data.netProfit >= 0 ? "var(--green)" : "var(--red)" }}
        >
          {data.netProfit >= 0 ? "+" : "-"}{fmt(data.netProfit)}
        </div>
      </div>

      <button
        onClick={() => generateReport(data, rangeLabel, settings)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
        style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
      >
        <FileText size={16} />
        {t("reports.generateReport")}
      </button>
    </div>
  );
}
