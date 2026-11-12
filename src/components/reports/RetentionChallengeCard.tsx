import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2, Minus, TrendingDown, TrendingUp, UserRoundCheck, Users } from "lucide-react";
import type { useHomePeriod } from "@/hooks/useHomePeriod";
import { useOutreachData } from "@/hooks/useOutreachData";
import { trendPct } from "@/lib/outreach";
import { AnimatedNumber } from "@/components/tabs/AnimatedStats";

type Selection = ReturnType<typeof useHomePeriod>;

const LABELS = {
  es: {
    pending: { day: "Clientes pendientes hoy", week: "Clientes pendientes esta semana", month: "Clientes pendientes este mes" },
    reactivated: { day: "Reactivados hoy", week: "Reactivados esta semana", month: "Reactivados este mes" },
  },
  en: {
    pending: { day: "Pending clients today", week: "Pending clients this week", month: "Pending clients this month" },
    reactivated: { day: "Reactivated today", week: "Reactivated this week", month: "Reactivated this month" },
  },
} as const;

/** Home challenge card: pending clients first, reactivations second. */
export function RetentionChallengeCard({ selection, es }: { selection: Selection; es: boolean }) {
  const navigate = useNavigate();
  const { period, start, end, comparisonStart, comparisonEnd, date } = selection;
  const data = useOutreachData({ start, end, comparisonStart, comparisonEnd });
  const L = es ? LABELS.es : LABELS.en;
  const pending = data.pending.length;
  const reactivated = data.credits.length;
  // For pending, fewer is better.
  const pPct = trendPct(pending, data.pendingComparison);
  const rPct = trendPct(reactivated, data.creditsComparison);
  const diff = data.pendingComparison === null ? null : pending - data.pendingComparison;
  const better = diff !== null && diff < 0;
  const worse = diff !== null && diff > 0;
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <button
      type="button"
      onClick={() => {
        const q = new URLSearchParams({ homePeriod: period, homeDate: ymd(date) });
        navigate(`/admin/retencion/outreach?${q.toString()}`);
      }}
      className="w-full text-left rounded-2xl p-5 mb-4 card-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${L.pending[period]}: ${pending}. ${es ? "Abrir Reactivación" : "Open Reactivation"}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <Users size={16} style={{ color: "var(--accent-color)" }} />
        <span className="text-xs font-bold uppercase tracking-wider flex-1" style={{ color: "var(--text-tertiary)", letterSpacing: "0.5px" }}>
          {es ? "Reto de reactivación" : "Reactivation challenge"}
        </span>
        <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
      </div>
      {data.loading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin" size={20} style={{ color: "var(--accent-color)" }} /></div>
      ) : data.error ? (
        <p className="text-xs text-muted-foreground">{es ? "No se pudo cargar la retención. Toca para reintentar." : "Could not load retention. Tap to retry."}</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-3xl font-black" style={{ color: "var(--text-primary)", letterSpacing: "-1px" }}>
                <AnimatedNumber value={pending} />
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>{L.pending[period]}</p>
            </div>
            <div className="text-right shrink-0">
              {diff === null ? (
                <p className="text-[10px] max-w-[130px]" style={{ color: "var(--text-tertiary)" }}>
                  {es ? "Comparativo no disponible" : "Comparison unavailable"}
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-1 justify-end">
                    {better ? <TrendingDown size={16} style={{ color: "var(--green)" }} />
                      : worse ? <TrendingUp size={16} style={{ color: "var(--red)" }} />
                      : <Minus size={16} style={{ color: "var(--text-tertiary)" }} />}
                    <span className="text-sm font-bold" style={{ color: better ? "var(--green)" : worse ? "var(--red)" : "var(--text-tertiary)" }}>
                      {pPct === null ? `${diff > 0 ? "+" : ""}${diff}` : `${pPct > 0 ? "+" : ""}${pPct.toFixed(1)}%`}
                    </span>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)", opacity: 0.7 }}>
                    vs. {data.pendingComparison} {es ? "en el período comparable" : "in comparable period"}
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between gap-3 border-t border-border">
            <div className="flex items-center gap-2 min-w-0">
              <UserRoundCheck size={16} style={{ color: "var(--green)" }} />
              <span className="text-sm font-semibold text-foreground">{L.reactivated[period]}</span>
            </div>
            <div className="text-right">
              <span className="text-lg font-black" style={{ color: reactivated > 0 ? "var(--green)" : "var(--text-primary)" }}>{reactivated}</span>
              <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                {data.creditsComparison === null
                  ? (es ? "Sin historial comparable" : "No comparable history")
                  : `vs. ${data.creditsComparison}${rPct === null ? "" : ` (${rPct > 0 ? "+" : ""}${rPct.toFixed(0)}%)`}`}
              </p>
            </div>
          </div>
        </>
      )}
    </button>
  );
}
