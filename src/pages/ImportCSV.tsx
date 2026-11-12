import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Trash2, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

interface CSVRow {
  [key: string]: string;
}

function parseCSV(text: string): CSVRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
      current += char;
    }
    values.push(current.trim());
    const row: CSVRow = {};
    headers.forEach((h, i) => { row[h] = values[i] || ""; });
    return row;
  });
}

const REQUIRED_COLS = ["Start Time", "Calendar", "Appointment Price", "Amount Paid Online", "Paid?"];

export default function ImportCSV() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CSVRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["csv-imports"],
    queryFn: async () => {
      const { data } = await supabase.from("csv_imports").select("*").order("created_at", { ascending: false }).limit(20);
      return data || [];
    },
  });

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setRows(parsed);
      // Validate columns
      if (parsed.length > 0) {
        const cols = Object.keys(parsed[0]);
        const missing = REQUIRED_COLS.filter(c => !cols.includes(c));
        if (missing.length > 0) {
          setError(`Columnas faltantes: ${missing.join(", ")}`);
        }
      }
    };
    reader.readAsText(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) handleFile(f);
  }, [handleFile]);

  const handleImport = async () => {
    if (!file || rows.length === 0 || error) return;
    setImporting(true);
    let imported = 0;
    let skipped = 0;

    // We need barbers to map Calendar name → barber_id
    const { data: barbers } = await supabase.from("barbers_public").select("id,name").eq("is_active", true);
    const barberMap = new Map((barbers || []).map(b => [b.name.toLowerCase(), b.id]));

    for (const row of rows) {
      try {
        const calendarName = row["Calendar"] || "";
        const barberId = barberMap.get(calendarName.toLowerCase());
        if (!barberId) { skipped++; continue; }

        const startTime = new Date(row["Start Time"]);
        const endTime = new Date(row["End Time"] || startTime);
        const priceCents = Math.round(parseFloat(row["Appointment Price"] || "0") * 100);
        const amountPaidOnline = Math.round(parseFloat(row["Amount Paid Online"] || "0") * 100);
        const isPaid = (row["Paid?"] || "").toLowerCase() === "yes";
        const clientName = row["First Name"] ? `${row["First Name"]} ${row["Last Name"] || ""}`.trim() : "Walk-in";
        const serviceName = row["Type"] || "Service";
        const duration = parseInt(row["Duration"] || "30", 10);
        const acuityId = parseInt(row["ID"] || "0", 10);

        if (!acuityId) { skipped++; continue; }

        const paymentMethod = amountPaidOnline > 0 ? "stripe" : "cash";

        const { error: upsertErr } = await supabase.from("appointments").upsert({
          acuity_id: acuityId,
          barber_id: barberId,
          client_name: clientName,
          client_email: row["Email"] || null,
          client_phone: row["Phone"] || null,
          service_name: serviceName,
          starts_at: startTime.toISOString(),
          ends_at: endTime.toISOString(),
          duration_minutes: duration,
          price_cents: priceCents,
          amount_paid_cents: isPaid ? priceCents : amountPaidOnline,
          paid: isPaid,
          payment_method: paymentMethod,
          status: "scheduled",
        }, { onConflict: "acuity_id" });

        if (upsertErr) { skipped++; } else { imported++; }
      } catch {
        skipped++;
      }
    }

    // Log import
    await supabase.from("csv_imports").insert({
      filename: file.name,
      rows_total: rows.length,
      rows_imported: imported,
      rows_skipped: skipped,
      imported_by: user?.id || null,
      status: imported > 0 ? "success" : "error",
    });

    setResult({ imported, skipped });
    setImporting(false);
    refetchHistory();
  };

  const handleClear = () => {
    setFile(null);
    setRows([]);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        title={t("reports.importCSV")}
        onBack={() => navigate("/admin?tab=menu")}
      />

      <div className="px-4 pb-24 space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 py-10 rounded-xl cursor-pointer"
          style={{ border: "2px dashed var(--divider)", background: "var(--bg-surface)" }}
        >
          <Upload size={32} style={{ color: "var(--text-tertiary)" }} />
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {file ? file.name : "Selecciona Archivo CSV"}
          </span>
          {file && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{rows.length} filas</span>}
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        {/* Required fields */}
        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Campos requeridos: {REQUIRED_COLS.join(", ")}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-lg" style={{ background: "rgba(185,28,28,0.1)", color: "var(--red)" }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {result && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-lg" style={{ background: "rgba(26,110,63,0.1)", color: "var(--green)" }}>
            <CheckCircle size={16} /> {result.imported} importadas, {result.skipped} omitidas
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleImport}
            disabled={!file || !!error || importing || rows.length === 0}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm disabled:opacity-40"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : null}
            Importar
          </button>
          <button
            onClick={handleClear}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm"
            style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
          >
            <Trash2 size={14} /> Limpiar
          </button>
        </div>

        {/* History */}
        {history && history.length > 0 && (
          <div className="rounded-xl overflow-hidden card-elevated">
            <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)", borderBottom: "1px solid var(--divider)" }}>
              Historial de Importaciones
            </div>
            {history.map((h: any) => (
              <div key={h.id} className="px-4 py-3 flex justify-between" style={{ borderBottom: "1px solid var(--divider)" }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{h.filename}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{format(new Date(h.created_at), "d MMM yyyy, h:mm a")}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold" style={{ color: h.status === "success" ? "var(--green)" : "var(--red)" }}>
                    {h.rows_imported}/{h.rows_total}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{h.rows_skipped} omitidas</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
