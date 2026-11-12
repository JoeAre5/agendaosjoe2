import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Loader2, FileText, FileSpreadsheet, FileType } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { buildPLReport } from "@/lib/plAggregator";
import { exportPLPdf, exportPLXlsx, exportPLCsv } from "@/lib/plExporter";

type PeriodKind = "week" | "month" | "year" | "custom";
type FormatKind = "pdf" | "xlsx" | "csv";

interface Props {
  open: boolean;
  onClose: () => void;
  currentWeekStart: Date;
  currentWeekEnd: Date;
}

const LS_KEY = "agendaOS.plExport.prefs";

function loadPrefs(): { kind: PeriodKind; fmt: FormatKind } | null {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; }
}
function savePrefs(kind: PeriodKind, fmt: FormatKind) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ kind, fmt })); } catch {}
}

export function ExportPLModal({ open, onClose, currentWeekStart, currentWeekEnd }: Props) {
  const prefs = loadPrefs();
  const [kind, setKind] = useState<PeriodKind>(prefs?.kind || "month");
  const [fmt, setFmt] = useState<FormatKind>(prefs?.fmt || "pdf");
  const [busy, setBusy] = useState(false);

  // Month/year selectors
  const now = new Date();
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month, -1 = previous
  const [year, setYear] = useState(now.getFullYear());
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));

  const range = useMemo<{ from: Date; to: Date; label: string }>(() => {
    if (kind === "week") {
      return {
        from: currentWeekStart,
        to: currentWeekEnd,
        label: `${format(currentWeekStart, "d MMM", { locale: es })} - ${format(currentWeekEnd, "d MMM yyyy", { locale: es })}`,
      };
    }
    if (kind === "month") {
      const d = addMonths(now, monthOffset);
      return {
        from: startOfMonth(d),
        to: endOfMonth(d),
        label: format(d, "MMMM yyyy", { locale: es }),
      };
    }
    if (kind === "year") {
      const d = new Date(year, 0, 1);
      return { from: startOfYear(d), to: endOfYear(d), label: String(year) };
    }
    // custom
    const f = new Date(customFrom + "T00:00:00-04:00");
    const t = new Date(customTo + "T23:59:59-04:00");
    return {
      from: f, to: t,
      label: `${format(f, "d MMM yyyy", { locale: es })} - ${format(t, "d MMM yyyy", { locale: es })}`,
    };
  }, [kind, monthOffset, year, customFrom, customTo, currentWeekStart, currentWeekEnd]);

  const monthOptions = useMemo(() => {
    const opts: Array<{ offset: number; label: string }> = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(now, i);
      opts.push({ offset: -i, label: format(d, "MMMM yyyy", { locale: es }) });
    }
    return opts;
  }, []);

  const yearOptions = useMemo(() => {
    const opts: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) opts.push(y);
    return opts;
  }, []);

  async function handleExport() {
    setBusy(true);
    try {
      savePrefs(kind, fmt);
      const report = await buildPLReport(range.from, range.to, range.label);
      if (report.weeks.length === 0) {
        toast.error("No hay datos en este rango");
        return;
      }
      if (fmt === "pdf") exportPLPdf(report);
      else if (fmt === "xlsx") await exportPLXlsx(report);
      else exportPLCsv(report);
      toast.success(`P&L exportado (${report.weeks.length} semana${report.weeks.length > 1 ? "s" : ""})`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error generando reporte: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar P&L</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Period kind chips */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
              Período
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(["week", "month", "year", "custom"] as PeriodKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className="py-2 px-2 rounded-lg text-xs font-semibold"
                  style={{
                    background: kind === k ? "var(--cta-bg)" : "var(--bg-elevated)",
                    color: kind === k ? "var(--cta-fg)" : "var(--text-secondary)",
                  }}
                >
                  {k === "week" ? "Semana" : k === "month" ? "Mes" : k === "year" ? "Año" : "Custom"}
                </button>
              ))}
            </div>
          </div>

          {/* Dependent selector */}
          {kind === "month" && (
            <select
              value={monthOffset}
              onChange={(e) => setMonthOffset(Number(e.target.value))}
              className="w-full p-2 rounded-lg text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
            >
              {monthOptions.map((o) => (
                <option key={o.offset} value={o.offset}>{o.label}</option>
              ))}
            </select>
          )}
          {kind === "year" && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full p-2 rounded-lg text-sm"
              style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {kind === "custom" && (
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--divider)", background: "var(--bg-elevated)" }}>
              <label className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Desde</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-transparent text-sm text-right outline-none flex-1 min-w-0"
                  style={{ color: "var(--text-primary)" }}
                />
              </label>
              <div className="h-px" style={{ background: "var(--divider)" }} />
              <label className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Hasta</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-transparent text-sm text-right outline-none flex-1 min-w-0"
                  style={{ color: "var(--text-primary)" }}
                />
              </label>
            </div>
          )}

          {/* Range preview */}
          <div className="px-3 py-2 rounded-lg text-center text-sm" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
            {range.label}
          </div>

          {/* Format chips */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
              Formato
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: "pdf" as FormatKind, label: "PDF", Icon: FileText },
                { id: "xlsx" as FormatKind, label: "Excel", Icon: FileSpreadsheet },
                { id: "csv" as FormatKind, label: "CSV", Icon: FileType },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFmt(opt.id)}
                  className="py-3 px-2 rounded-lg flex flex-col items-center gap-1"
                  style={{
                    background: fmt === opt.id ? "var(--cta-bg)" : "var(--bg-elevated)",
                    color: fmt === opt.id ? "var(--cta-fg)" : "var(--text-secondary)",
                  }}
                >
                  <opt.Icon size={18} />
                  <span className="text-xs font-semibold">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {busy ? "Generando..." : "Exportar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
