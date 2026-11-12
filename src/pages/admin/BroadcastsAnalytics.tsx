/**
 * Admin → Broadcast analytics. Aggregate delivery + open rates across sent
 * broadcasts and list per-broadcast metrics. Uses broadcasts + broadcast_receipts.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Send, Eye, AlertTriangle } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { supabase } from "@/integrations/supabase/client";
import { usePreferences } from "@/hooks/usePreferences";

interface Row {
  id: string;
  title_es: string;
  title_en: string;
  sent_at: string | null;
  audience_count: number;
  delivered_count: number;
  failed_count: number;
  opened_count: number;
}

function fmtPct(num: number, denom: number) {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)}%`;
}

function fmtDate(iso: string | null, es: boolean) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(es ? "es-PR" : "en-US", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

export default function BroadcastsAnalytics() {
  const navigate = useNavigate();
  const { language } = usePreferences();
  const es = language === "es";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: broadcasts } = await supabase
        .from("broadcasts")
        .select("id,title_es,title_en,sent_at,audience_count,delivered_count,failed_count")
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(100);
      const ids = (broadcasts ?? []).map((b) => b.id);
      const opened = new Map<string, number>();
      if (ids.length > 0) {
        const { data: receipts } = await supabase
          .from("broadcast_receipts")
          .select("broadcast_id, opened_at")
          .in("broadcast_id", ids)
          .not("opened_at", "is", null);
        for (const r of receipts ?? []) {
          opened.set(r.broadcast_id, (opened.get(r.broadcast_id) ?? 0) + 1);
        }
      }
      if (!cancelled) {
        setRows((broadcasts ?? []).map((b) => ({
          ...b,
          opened_count: opened.get(b.id) ?? 0,
        })));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.audience += r.audience_count;
        acc.delivered += r.delivered_count;
        acc.failed += r.failed_count;
        acc.opened += r.opened_count;
        return acc;
      },
      { audience: 0, delivered: 0, failed: 0, opened: 0 },
    );
  }, [rows]);

  return (
    <div className="min-h-screen mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)" }}>
      <SubpageHeader
        title={es ? "Analítica" : "Analytics"}
        subtitle={es ? "Entregas y aperturas de tus broadcasts." : "Delivery and open rates for your broadcasts."}
        onBack={() => navigate("/admin/broadcasts")}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : (
        <div className="px-4 pb-12 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: es ? "Entrega" : "Delivery", value: fmtPct(totals.delivered, totals.audience), Icon: Send },
              { label: es ? "Apertura" : "Open rate", value: fmtPct(totals.opened, totals.delivered), Icon: Eye },
              { label: es ? "Errores" : "Failures", value: fmtPct(totals.failed, totals.audience), Icon: AlertTriangle },
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
            {rows.length === 0 ? (
              <div className="p-6 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
                {es ? "Aún no has enviado broadcasts." : "No broadcasts sent yet."}
              </div>
            ) : rows.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <div className="h-px mx-4" style={{ background: "var(--divider)" }} />}
                <div className="px-4 py-3">
                  <div className="text-sm font-bold truncate" style={{ color: "var(--text-primary)" }}>
                    {es ? r.title_es : r.title_en}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    {fmtDate(r.sent_at, es)} · {r.audience_count} {es ? "destinatarios" : "recipients"}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    <div><span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtPct(r.delivered_count, r.audience_count)}</span> · {es ? "entrega" : "delivered"}</div>
                    <div><span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{fmtPct(r.opened_count, r.delivered_count)}</span> · {es ? "abierto" : "opened"}</div>
                    <div><span className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{r.failed_count}</span> · {es ? "errores" : "failed"}</div>
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
