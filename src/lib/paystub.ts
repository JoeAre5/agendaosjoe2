/**
 * Paystub generators matching C&O Ventures LLC official formats.
 * Two types: Professional Services (commission) and W-2 (salaried).
 */

import { supabase } from "@/integrations/supabase/client";

interface CompanyInfo {
  legal_entity?: string;
  address?: string;
  city?: string;
}

interface SPPaystubData {
  name: string;
  professionalFees: number;
  retainedEarnings: number;
  netTips?: number;
  productCommission?: number;
  checkDate: string;
  checkNumber: string;
  company: CompanyInfo;
}

interface W2PaystubData {
  name: string;
  employeeId?: string;
  ssnLast4?: string;
  gross: number;
  socSec: number;
  medicare: number;
  stIncome: number;
  stDisIns: number;
  netCheck: number;
  payPeriodStart: string;
  payPeriodEnd: string;
  checkDate: string;
  checkNumber: string;
  salary: number;
  company: CompanyInfo;
}

function fmtDollars(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}

function fmtNeg(cents: number): string {
  return "-" + fmtDollars(cents);
}

/** Fetches the next check number from the database and increments the counter. */
export async function getNextCheckNumber(): Promise<string> {
  const { data, error } = await supabase.rpc("get_next_check_number");
  if (error) {
    console.error("Failed to get check number:", error);
    return "---";
  }
  return String(data).padStart(3, "0");
}

export function generateSPPaystub(data: SPPaystubData) {
  const netTips = data.netTips || 0;
  const productCommission = data.productCommission || 0;
  const checkAmount = (data.professionalFees - data.retainedEarnings + netTips + productCommission) / 100;
  const entity = data.company.legal_entity || "C & O VENTURES LLC";
  const addr = data.company.address || "PR 2 KM 93.3 BO MEMBRILLO";
  const city = data.company.city || "CAMUY, PR 00627";
  const cn = data.checkNumber;
  const memoParts = ["Servicios Profesionales"];
  if (netTips > 0) memoParts.push(`Propinas (${fmtDollars(netTips)})`);
  if (productCommission > 0) memoParts.push(`Comisión Productos (${fmtDollars(productCommission)})`);
  const memoText = memoParts.join(" + ");

  const stubMeta = `
    <div class="stub-meta">
      <div><span class="label">Número de Cheque</span> ${cn}</div>
      <div><span class="label">Fecha del Cheque</span> ${data.checkDate}</div>
      <div class="check-amount"><span class="label">Monto del Cheque</span> $${checkAmount.toFixed(2)}</div>
    </div>`;

  const tipsRow = netTips > 0
    ? `<tr><td>Propinas</td><td></td><td>${fmtDollars(netTips)}</td></tr>`
    : "";
  const productRow = productCommission > 0
    ? `<tr><td>Comisión de Productos</td><td></td><td>${fmtDollars(productCommission)}</td></tr>`
    : "";

  const stubTable = `
  <table>
    <tr><th>Descripción del Pago</th><th>Descuento</th><th>Monto Pagado</th></tr>
    <tr><td>Honorarios Profesionales</td><td></td><td>${fmtDollars(data.professionalFees)}</td></tr>
    <tr><td>Ganancias Retenidas</td><td></td><td>${fmtNeg(data.retainedEarnings)}</td></tr>
    ${tipsRow}
    ${productRow}
  </table>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Talonario - ${data.name} - Cheque #${cn}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;padding:0;color:#000;font-size:13px;background:#fff}
.section{padding:24px 32px;min-height:280px;border-bottom:1px dashed #999;page-break-inside:avoid}
.section:last-child{border-bottom:none}
.stub-header{display:flex;justify-content:space-between;margin-bottom:16px}
.stub-name{font-size:15px;font-weight:bold}
.stub-meta{text-align:right;font-size:12px;line-height:1.6}
.stub-meta .label{display:inline-block;min-width:120px;text-align:right;margin-right:8px}
.check-amount{font-size:14px;font-weight:bold;margin-top:4px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{text-align:left;border-bottom:2px solid #000;padding:4px 8px;font-size:12px}
th:last-child,td:last-child{text-align:right}
th:nth-child(2),td:nth-child(2){text-align:center}
td{padding:4px 8px;font-size:13px}
.company-block{font-size:12px;line-height:1.5;font-weight:bold}
.check-section{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
.amount-box{font-size:16px;font-weight:bold;margin:12px 0}
.payee{font-size:13px;font-weight:bold;margin:12px 0}
.memo{font-size:11px;color:#666;margin-top:4px}
@media print{.section{min-height:auto}}
</style></head><body>

<!-- Top Stub -->
<div class="section">
  <div class="stub-header">
    <div class="stub-name">${data.name}</div>
    ${stubMeta}
  </div>
  ${stubTable}
</div>

<!-- Middle — Check -->
<div class="section">
  <div class="check-section">
    <div class="company-block">
      ${entity}<br>${addr}<br>${city}<br>PUERTO RICO
    </div>
    <div>Número de Cheque &nbsp; ${cn}</div>
    <div>${data.checkDate}</div>
  </div>
  <div class="amount-box" style="text-align:center">${checkAmount.toFixed(2)}</div>
  <div class="payee">${data.name}</div>
  <div class="memo">Memo: ${memoText}</div>
</div>

<!-- Bottom Stub (copy) -->
<div class="section">
  <div class="stub-header">
    <div class="stub-name">${data.name}</div>
    ${stubMeta}
  </div>
  ${stubTable}
</div>

</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}

export function generateW2Paystub(data: W2PaystubData) {
  const entity = data.company.legal_entity || "C & O VENTURES LLC";
  const addr = data.company.address || "PR 2 KM 93.3 BO MEMBRILLO";
  const city = data.company.city || "CAMUY, PR 00627";
  const netDollars = fmtDollars(data.netCheck);
  const salaryDollars = fmtDollars(data.salary);
  const cn = data.checkNumber;

  const deductionRows = `
    <tr><td>Bruto</td><td>${fmtDollars(data.gross)}</td><td></td><td>Salario</td><td>${salaryDollars}</td></tr>
    <tr><td>Seg_Social</td><td>${fmtNeg(data.socSec)}</td><td></td><td></td><td></td></tr>
    <tr><td>MEDICARE</td><td>${fmtNeg(data.medicare)}</td><td></td><td></td><td></td></tr>
    <tr><td>Contrib_Estatal</td><td>${fmtNeg(data.stIncome)}</td><td></td><td></td><td></td></tr>
    <tr><td>Seg_Incapacidad</td><td>${fmtNeg(data.stDisIns)}</td><td></td><td></td><td></td></tr>`;

  const stubBlock = `
  <div class="stub-header">
    <div class="stub-name">${data.name}</div>
    <div class="stub-meta">
      <div><span class="label">ID Empleado:</span> ${data.employeeId || "—"}</div>
      <div><span class="label">Seg. Social #</span> xxx-xx-${data.ssnLast4 || "xxxx"}</div>
    </div>
  </div>
  <table>
    <tr><th></th><th>Este Cheque</th><th>Año a la Fecha</th><th></th><th>Total</th></tr>
    ${deductionRows}
  </table>
  <div class="net-row">
    <div><strong>Cheque Neto:</strong> <strong>$${netDollars}</strong></div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px">
      <div>
        <div>Período Inicio: ${data.payPeriodStart}</div>
        <div>Período Fin: ${data.payPeriodEnd}</div>
      </div>
      <div style="text-align:right">
        <div>Total: ${salaryDollars}</div>
        <div>Fecha del Cheque: ${data.checkDate}</div>
        <div>Semanas en Período: 1</div>
      </div>
    </div>
  </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Talonario W-2 - ${data.name} - Cheque #${cn}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;padding:0;color:#000;font-size:13px;background:#fff}
.section{padding:24px 32px;min-height:280px;border-bottom:1px dashed #999;page-break-inside:avoid}
.section:last-child{border-bottom:none}
.stub-header{display:flex;justify-content:space-between;margin-bottom:12px}
.stub-name{font-size:15px;font-weight:bold}
.stub-meta{text-align:right;font-size:12px;line-height:1.6}
.stub-meta .label{display:inline-block;min-width:100px;text-align:right;margin-right:8px}
table{width:100%;border-collapse:collapse;margin-top:4px}
th{text-align:left;border-bottom:1px solid #000;padding:3px 6px;font-size:11px}
th:nth-child(2),td:nth-child(2),th:last-child,td:last-child{text-align:right}
td{padding:3px 6px;font-size:12px;border-left:1px solid #ddd}
td:first-child{border-left:none}
tr:first-child td{border-top:1px solid #ddd}
.net-row{margin-top:12px;padding-top:8px;border-top:1px solid #000;font-size:13px}
.company-block{font-size:12px;line-height:1.5;font-weight:bold;border:1px solid #000;padding:8px}
.check-section{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
.amount-box{font-size:16px;font-weight:bold;margin:10px 0}
.payee{font-size:12px;font-weight:bold;margin:8px 0}
.not-deposit{font-style:italic;font-size:11px;color:#666;margin-top:12px}
@media print{.section{min-height:auto}}
</style></head><body>

<!-- Top Stub -->
<div class="section">
  ${stubBlock}
</div>

<!-- Middle — Check -->
<div class="section">
  <div class="check-section">
    <div class="company-block">
      ${entity}<br>${addr}<br>${city}<br>PUERTO RICO
    </div>
    <div>Número de Cheque &nbsp; ${cn}</div>
    <div>${data.checkDate}</div>
  </div>
  <div class="amount-box" style="text-align:center">${netDollars}</div>
  <div class="payee">${data.name}</div>
  <div class="not-deposit">No Para Depósito</div>
</div>

<!-- Bottom Stub (copy) -->
<div class="section">
  ${stubBlock}
  <div style="text-align:right;margin-top:8px;font-size:11px">Número de Cheque &nbsp; ${cn}</div>
</div>

</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
}
