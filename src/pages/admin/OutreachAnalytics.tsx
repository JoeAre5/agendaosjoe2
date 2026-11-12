/**
 * Admin → Outreach analytics. Aggregates email_send_log by status + template.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";

import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";

interface LogRow {
  id: string;
  template_name: string;
  status: string;
  created_at: string;
}

function fmtPct(num: number, denom: number) {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}

export default function OutreachAnalytics() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("email_send_log")
        .select("id, template_name, status, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (!cancelled) {
        setRows((data ?? []) as LogRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totals = useMemo(() => {
    const t = { total: rows.length, sent: 0, failed: 0, byTemplate: new Map<string, { sent: number; failed: number }>() };
    for (const r of rows) {
      const ok = r.status === "sent" || r.status === "delivered";
      if (ok) t.sent++; else if (r.status === "failed" || r.status === "error") t.failed++;
      const cur = t.byTemplate.get(r.template_name) ?? { sent: 0, failed: 0 };
      if (ok) cur.sent++; else if (r.status === "failed" || r.status === "error") cur.failed++;
      t.byTemplate.set(r.template_name, cur);
    }
    return t;
  }, [rows]);

  const tmplRows = useMemo(
    () => Array.from(totals.byTemplate.entries())
      .map(([name, v]) => ({ name, ...v, total: v.sent + v.failed }))
      .sort((a, b) => b.total - a.total),
    [totals],
  );

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Analítica" : "Analytics"}
        subtitle={es ? "Últimos 30 días de envíos transaccionales." : "Last 30 days of transactional sends."}
        onBack={() => navigate("/admin/outreach")}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : (
        <div className="px-4 pb-12 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: es ? "Total" : "Total", value: String(totals.total), Icon: Mail },
              { label: es ? "Éxito" : "Success", value: fmtPct(totals.sent, totals.total), Icon: CheckCircle2 },
              { label: es ? "Errores" : "Failures", value: fmtPct(totals.failed, totals.total), Icon: AlertTriangle },
            ].map(({ label, value, Icon }) => (
              <div key={label} className="rounded-xl p-3 card-elevated">
                <Icon size={14} style={{ color: "var(--text-tertiary)" }} className="icon-bold" />
                <div className="mt-1.5 text-lg font-black tabular-nums" style={{ color: "var(--text-primary)" }}>
                  {value}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl overflow-hidden card-elevated">
            {tmplRows.length === 0 ? (
              <div className="p-6 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                {es ? "Sin envíos en los últimos 30 días." : "No sends in the last 30 days."}
              </div>
            ) : tmplRows.map((r, i) => (
              <div key={r.name}>
                {i > 0 && <div className="h-px mx-4" style={{ background: "var(--divider)" }} />}
                <div className="px-4 py-3">
                  <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {r.name}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {r.total} {es ? "envíos" : "sends"} · <span className="tabular-nums">{fmtPct(r.sent, r.total)}</span> {es ? "éxito" : "success"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
