/**
 * P&L exporters — PDF, Excel (.xlsx), and CSV.
 * Friendly, plain-language layout (3rd–5th grade reading level).
 * All run client-side. Files are downloaded via Blob URLs.
 *
 * Operating expenses come from operational_expenses (same allocation as Home).
 * The report mirrors the weekly accountant WhatsApp message: payouts per
 * barber + collection breakdown by payment method.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import type { PLReport } from "./plAggregator";

const fmt = (c: number) => "$" + (Math.abs(c) / 100).toFixed(2);
const signed = (c: number) => (c < 0 ? "-" : "") + fmt(c);
const pct = (part: number, total: number) =>
  total > 0 ? ((part / total) * 100).toFixed(1) + "%" : "0.0%";

function safeName(periodLabel: string): string {
  return periodLabel.replace(/[^\w-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

// ─────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────
export function exportPLPdf(report: PLReport) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(report.shopName, pageWidth / 2, 52, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`${report.legalEntity} · ${report.city}`, pageWidth / 2, 68, { align: "center" });
  doc.setTextColor(0);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Resumen Semanal`, pageWidth / 2, 92, { align: "center" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  doc.text(report.periodLabel, pageWidth / 2, 108, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    `${report.weeks.length} semana${report.weeks.length === 1 ? "" : "s"} · Generado ${new Date().toLocaleDateString("es-PR")}`,
    pageWidth / 2, 122, { align: "center" }
  );
  doc.setTextColor(0);

  const t = report.totals;
  let cursorY = 150;

  // ─── SECTION 1: Pago por barbero ───
  doc.setFillColor(245, 245, 245);
  doc.rect(40, cursorY, pageWidth - 80, 22, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40);
  doc.text("PAGO POR BARBERO", 50, cursorY + 15);
  cursorY += 22;

  const barberIds = Object.keys(t.barberPayoutsByBarber);
  autoTable(doc, {
    startY: cursorY,
    head: [["Barbero", "Producción", "Total a pagar"]],
    body: barberIds.map((id) => [
      t.barberPayoutsByBarber[id].name,
      fmt(t.productionByBarber[id] || 0),
      fmt(t.barberPayoutsByBarber[id].payout || 0),
    ]),
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold", fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 110 },
      2: { halign: "right", cellWidth: 110, fontStyle: "bold" },
    },
    margin: { left: 40, right: 40 },
  });
  cursorY = (doc as any).lastAutoTable.finalY + 18;

  // ─── SECTION 2: Métodos de pago (3 cols con %) ───
  if (cursorY > 600) { doc.addPage(); cursorY = 60; }
  doc.setFillColor(245, 245, 245);
  doc.rect(40, cursorY, pageWidth - 80, 22, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40);
  doc.text("MÉTODO DE PAGO", 50, cursorY + 15);
  cursorY += 22;

  const pm = t.paymentMethodBreakdown;
  const pmRows: Array<[string, number]> = [
    ["Efectivo", pm.cash],
    ["ATH Móvil", pm.ath_movil],
    ["PayPal", pm.paypal],
    ["Stripe (Tarjeta)", pm.stripe],
    ["Otros", pm.other],
  ];

  autoTable(doc, {
    startY: cursorY,
    head: [["Método", "Monto", "% del total"]],
    body: [
      ...pmRows.map(([label, amt]) => [label, fmt(amt), pct(amt, pm.total)]),
      ["TOTAL COBRADO", fmt(pm.total), "100.0%"],
    ],
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold", fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 110 },
      2: { halign: "right", cellWidth: 110 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === pmRows.length) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [240, 240, 240];
      }
    },
    margin: { left: 40, right: 40 },
  });
  cursorY = (doc as any).lastAutoTable.finalY + 18;

  // ─── SECTION 3: Resumen del negocio ───
  if (cursorY > 600) { doc.addPage(); cursorY = 60; }
  doc.setFillColor(245, 245, 245);
  doc.rect(40, cursorY, pageWidth - 80, 22, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(40);
  doc.text("RESUMEN DEL NEGOCIO", 50, cursorY + 15);
  cursorY += 22;

  autoTable(doc, {
    startY: cursorY,
    head: [["Concepto", "TOTAL"]],
    body: [
      ["Producción limpia", fmt(t.production)],
      ["Cargo digital estimado", "-" + fmt(t.digitalFee)],
      ["Cargo real verificado", "Pendiente"],
      ["Tarifa de procesamiento de propinas", fmt(t.totalTipFeesRetained)],
      ["Pagos a barberos", "-" + fmt(t.totalBarberPayouts)],
      ["Ganancia de productos", signed(t.productMargin)],
      ...report.expenseRows.map((e) => ["Gasto: " + e.title, "-" + fmt(e.period_cents)]),
      ["Total gastos operativos", "-" + fmt(t.totalExpenses)],
      ["GANANCIA FINAL", signed(t.netProfit)],
    ],
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold", fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 140 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === 7 + report.expenseRows.length) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [232, 245, 233];
      }
    },
    margin: { left: 40, right: 40 },
  });
  cursorY = (doc as any).lastAutoTable.finalY + 20;

  // ─── Footer note ───
  if (cursorY < 720) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(130);
    doc.text(
      "Las propinas se pagan netas luego de descontar la tarifa digital estimada. El cargo digital es ESTIMADO por la aplicación (ATH 2.25%, Stripe 2.9%+$0.30, PayPal 3.49%+$0.49). El cargo real verificado se completa al cuadrar con los reportes oficiales de cada procesador.",
      40, cursorY, { maxWidth: pageWidth - 80 }
    );
    doc.setTextColor(0);
  }

  // Page footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `${report.shopName} · Powered by Renova360™ · Página ${i} / ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: "center" }
    );
  }

  doc.save(`Resumen_${safeName(report.periodLabel)}.pdf`);
}

// ─────────────────────────────────────────────────────────────
// Excel
// ─────────────────────────────────────────────────────────────
export async function exportPLXlsx(report: PLReport) {
  const wb = new ExcelJS.Workbook();
  const moneyFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
  const pctFmt = '0.0%';
  const t = report.totals;
  const pm = t.paymentMethodBreakdown;

  const applyMoney = (ws: ExcelJS.Worksheet, r: number, c: number) => {
    const cell = ws.getCell(r, c);
    if (typeof cell.value === "number") cell.numFmt = moneyFmt;
  };

  // Resumen sheet
  const ws = wb.addWorksheet("Resumen");
  ws.addRow([report.shopName]);
  ws.addRow([`${report.legalEntity} · ${report.city}`]);
  ws.addRow([`Resumen Semanal — ${report.periodLabel}`]);
  ws.addRow([]);

  ws.addRow(["PAGO POR BARBERO"]);
  ws.addRow(["Barbero", "Producción", "Total a pagar"]);
  const barberIds = Object.keys(t.barberPayoutsByBarber);
  barberIds.forEach((id) => {
    const row = ws.addRow([
      t.barberPayoutsByBarber[id].name,
      (t.productionByBarber[id] || 0) / 100,
      (t.barberPayoutsByBarber[id].payout || 0) / 100,
    ]);
    row.getCell(2).numFmt = moneyFmt;
    row.getCell(3).numFmt = moneyFmt;
  });
  ws.addRow([]);

  ws.addRow(["MÉTODO DE PAGO"]);
  ws.addRow(["Método", "Monto", "% del total"]);
  const pmRows: Array<[string, number]> = [
    ["Efectivo", pm.cash],
    ["ATH Móvil", pm.ath_movil],
    ["PayPal", pm.paypal],
    ["Stripe (Tarjeta)", pm.stripe],
    ["Otros", pm.other],
  ];
  pmRows.forEach(([label, amt]) => {
    const row = ws.addRow([label, amt / 100, pm.total > 0 ? amt / pm.total : 0]);
    row.getCell(2).numFmt = moneyFmt;
    row.getCell(3).numFmt = pctFmt;
  });
  const totalRow = ws.addRow(["TOTAL COBRADO", pm.total / 100, 1]);
  totalRow.getCell(2).numFmt = moneyFmt;
  totalRow.getCell(3).numFmt = pctFmt;
  totalRow.font = { bold: true };
  ws.addRow([]);

  ws.addRow(["RESUMEN DEL NEGOCIO"]);
  const biz: Array<[string, number]> = [
    ["Producción limpia", t.production],
    ["Cargo digital estimado", -t.digitalFee],
    ["Pagos a barberos", -t.totalBarberPayouts],
    ["Ganancia de productos", t.productMargin],
    ...report.expenseRows.map((e) => ["Gasto: " + e.title, -e.period_cents] as [string, number]),
    ["Total gastos operativos", -t.totalExpenses],
    ["GANANCIA FINAL", t.netProfit],
  ];
  biz.forEach(([label, amt], i) => {
    const row = ws.addRow([label, amt / 100]);
    row.getCell(2).numFmt = moneyFmt;
    if (i === biz.length - 1) row.font = { bold: true };
  });
  const pendingRow = ws.addRow(["Cargo real verificado", "Pendiente"]);
  pendingRow.getCell(2).font = { italic: true, color: { argb: "FF888888" } };

  ws.columns = [{ width: 32 }, { width: 16 }, { width: 16 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `Resumen_${safeName(report.periodLabel)}.xlsx`);
}

// ─────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────
export function exportPLCsv(report: PLReport) {
  const t = report.totals;
  const pm = t.paymentMethodBreakdown;
  const lines: string[] = [];
  const money = (c: number) => (c / 100).toFixed(2);

  lines.push(`# ${report.shopName} — ${report.periodLabel}`);
  lines.push("");
  lines.push("# PAGO POR BARBERO");
  lines.push("Barbero,Produccion,Total a pagar");
  Object.keys(t.barberPayoutsByBarber).forEach((id) => {
    const b = t.barberPayoutsByBarber[id];
    lines.push([b.name, money(t.productionByBarber[id] || 0), money(b.payout || 0)].join(","));
  });
  lines.push("");
  lines.push("# METODO DE PAGO");
  lines.push("Metodo,Monto,% del total");
  const pmRows: Array<[string, number]> = [
    ["Efectivo", pm.cash],
    ["ATH Movil", pm.ath_movil],
    ["PayPal", pm.paypal],
    ["Stripe (Tarjeta)", pm.stripe],
    ["Otros", pm.other],
  ];
  pmRows.forEach(([label, amt]) => {
    const p = pm.total > 0 ? ((amt / pm.total) * 100).toFixed(1) + "%" : "0.0%";
    lines.push([label, money(amt), p].join(","));
  });
  lines.push(["TOTAL COBRADO", money(pm.total), "100.0%"].join(","));
  lines.push("");
  lines.push("# RESUMEN DEL NEGOCIO");
  lines.push("Concepto,Total");
  lines.push(`Produccion limpia,${money(t.production)}`);
  lines.push(`Cargo digital estimado,-${money(t.digitalFee)}`);
  lines.push(`Cargo real verificado,Pendiente`);
  lines.push(`Pagos a barberos,-${money(t.totalBarberPayouts)}`);
  lines.push(`Ganancia de productos,${money(t.productMargin)}`);
  const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  report.expenseRows.forEach((e) => lines.push(`${csvCell("Gasto: " + e.title)},-${money(e.period_cents)}`));
  lines.push(`Total gastos operativos,-${money(t.totalExpenses)}`);
  lines.push(`GANANCIA FINAL,${money(t.netProfit)}`);

  const csv = lines.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `Resumen_${safeName(report.periodLabel)}.csv`);
}
