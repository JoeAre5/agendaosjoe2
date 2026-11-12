import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowUpRight, ArrowDownRight, TrendingUp, Users, Clock,
  AlertTriangle, Ban, Award, Search, ChevronRight, Info,
} from "lucide-react";
import { AnimatedNumber, AnimatedCurrency, AnimatedBar } from "@/components/tabs/AnimatedStats";
import { useRetentionData } from "@/hooks/useRetentionData";
import { useTranslation } from "@/hooks/useTranslation";
import {
  aggregate, historyForBarber, rangeStart, FREQUENCY_BUCKETS,
  FREQUENCY_LABEL_ES, FREQUENCY_LABEL_EN, FREQUENCY_COLOR,
  STATUS_LABEL_ES, STATUS_LABEL_EN, STATUS_COLOR,
  RANGE_LABEL_ES, RANGE_LABEL_EN,
  type ClientHistory, type FrequencyBucket, type RetentionRange, type RetentionStatus,
} from "@/lib/retention";

const RANGES: RetentionRange[] = ["90d", "6m", "12m", "all"];

function fmtDays(n: number): string {
  if (!n || n <= 0) return "-";
  return `${Math.round(n)}d`;
}
function fmtDate(d: Date | null): string {
  if (!d) return "-";
  return d.toLocaleDateString("es-PR", { month: "short", day: "numeric", year: "numeric" });
}
function fmtCents(c: number): string {
  return "$" + (c / 100).toFixed(2);
}

export function RetentionContent() {
  const { language } = useTranslation();
  const isES = language === "es";
  const navigate = useNavigate();
  const { loading, error, histories, barbers, now } = useRetentionData();

  const [range, setRange] = useState<RetentionRange>("12m");
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RetentionStatus | "all">("all");
  const [sortKey, setSortKey] = useState<"last" | "overdue" | "visits" | "spend" | "name">("overdue");

  const windowStart = useMemo(() => rangeStart(range, now), [range, now]);
  const barberById = useMemo(() => {
    const m = new Map<string, typeof barbers[number]>();
    barbers.forEach((b) => m.set(b.id, b));
    return m;
  }, [barbers]);

  // Rescope every client to selected barber (or leave shop-wide)
  const scopedHistories: ClientHistory[] = useMemo(() => {
    let base = histories;
    if (selectedBarberId) {
      base = histories
        .map((h) => historyForBarber(h, selectedBarberId, now))
        .filter((h): h is ClientHistory => h !== null);
    }
    if (windowStart) {
      // Include only clients whose last visit falls in the window OR who are lost/at_risk
      base = base.filter((h) =>
        (h.lastVisit && h.lastVisit >= windowStart) ||
        h.status === "lost" || h.status === "at_risk"
      );
    }
    return base;
  }, [histories, selectedBarberId, windowStart, now]);

  const shop = useMemo(() => aggregate(scopedHistories, windowStart), [scopedHistories, windowStart]);

  // Per-barber aggregates (always across all clients, filtered to that barber only)
  const barberAggs = useMemo(() => {
    return barbers
      .filter((b) => b.is_active)
      .map((b) => {
        const rescoped = histories
          .map((h) => historyForBarber(h, b.id, now))
          .filter((h): h is ClientHistory => h !== null);
        const agg = aggregate(rescoped, windowStart);
        return { barber: b, agg };
      })
      .sort((a, b) => b.agg.score - a.agg.score);
  }, [barbers, histories, windowStart, now]);

  // Prior-period comparison for KPI trends (overdue delta)
  const prior = useMemo(() => {
    if (!windowStart) return null;
    const spanMs = now.getTime() - windowStart.getTime();
    const priorEnd = windowStart;
    const priorStart = new Date(windowStart.getTime() - spanMs);
    const priorHistories = histories.filter((h) =>
      h.lastVisit && h.lastVisit >= priorStart && h.lastVisit < priorEnd
    );
    return aggregate(priorHistories, priorStart);
  }, [histories, windowStart, now]);

  // ---------- Recovery revenue: sum of each overdue client's own avg ticket ----------
  const recoverableCents = useMemo(() => {
    return scopedHistories
      .filter((h) => h.status === "overdue" || h.status === "at_risk")
      .reduce((s, h) => s + (h.avgTicketCents || 0), 0);
  }, [scopedHistories]);

  const oldestInactive = useMemo(() => {
    const lost = scopedHistories
      .filter((h) => h.lastVisit && (h.status === "lost" || h.status === "at_risk"))
      .sort((a, b) => (a.lastVisit!.getTime() - b.lastVisit!.getTime()));
    return lost[0] || null;
  }, [scopedHistories]);

  // ---------- Filtered / sorted client table ----------
  const tableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = scopedHistories;
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (q) rows = rows.filter((r) => r.clientName.toLowerCase().includes(q));
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case "last":    return (b.lastVisit?.getTime() || 0) - (a.lastVisit?.getTime() || 0);
        case "overdue": return b.daysFromExpected - a.daysFromExpected;
        case "visits":  return b.lifetimeVisits - a.lifetimeVisits;
        case "spend":   return b.lifetimeSpendCents - a.lifetimeSpendCents;
        case "name":    return a.clientName.localeCompare(b.clientName);
      }
    });
    return rows.slice(0, 200);
  }, [scopedHistories, search, statusFilter, sortKey]);

  // ---------- Smart Insights (deterministic) ----------
  const insights = useMemo(() => {
    const out: string[] = [];
    // Strongest loyalty barber
    if (barberAggs.length) {
      const top = barberAggs[0];
      out.push(
        isES
          ? `${top.barber.name} tiene la retención más alta con una tendencia típica de ${fmtDays(top.agg.typicalReturnDays)}.`
          : `${top.barber.name} has the strongest retention with a typical return time of ${fmtDays(top.agg.typicalReturnDays)}.`
      );
    }
    // Overdue + recoverable
    const overdueCount = shop.overdueClients + shop.atRiskClients;
    if (overdueCount > 0) {
      out.push(
        isES
          ? `${overdueCount} clientes están vencidos y representan aproximadamente ${fmtCents(recoverableCents)} en ingresos recuperables.`
          : `${overdueCount} clients are overdue and represent approximately ${fmtCents(recoverableCents)} in recoverable revenue.`
      );
    }
    // Most common cadence
    const topBucket = FREQUENCY_BUCKETS.reduce<{ b: FrequencyBucket; n: number } | null>((best, b) => {
      const n = shop.bucketCounts[b];
      return !best || n > best.n ? { b, n } : best;
    }, null);
    if (topBucket && topBucket.n > 0) {
      const label = isES ? FREQUENCY_LABEL_ES[topBucket.b] : FREQUENCY_LABEL_EN[topBucket.b];
      out.push(
        isES
          ? `La tendencia más común es ${label.toLowerCase()} (${topBucket.n} clientes).`
          : `The most common cadence is ${label.toLowerCase()} (${topBucket.n} clients).`
      );
    }
    // Trend vs prior window
    if (prior && prior.lostClients >= 0) {
      const delta = shop.lostClients - prior.lostClients;
      if (delta !== 0) {
        out.push(
          isES
            ? `Los clientes perdidos ${delta > 0 ? "subieron" : "bajaron"} en ${Math.abs(delta)} vs. el período anterior.`
            : `Lost clients ${delta > 0 ? "increased" : "decreased"} by ${Math.abs(delta)} vs. the prior period.`
        );
      }
    }
    return out;
  }, [barberAggs, shop, prior, recoverableCents, isES]);

  if (error) {
    return (
      <div className="px-4 py-10 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
        {isES ? "No se pudo cargar la retención completa. Intenta de nuevo." : "Could not load complete retention. Try again."}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-4 py-10 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
        {isES ? "Cargando datos de retención…" : "Loading retention data…"}
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate("/admin/retencion/outreach")}
          className="w-full flex items-center justify-between rounded-xl px-4 py-3 card-elevated"
        >
          <span className="text-sm font-bold text-foreground">{isES ? "Reactivación" : "Reactivation"}</span>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {isES ? "Clientes pendientes y reactivaciones" : "Pending clients and reactivations"} →
          </span>
        </button>
      </div>
      {/* --------- Range selector --------- */}
      <div className="flex flex-wrap gap-1.5 px-4 pt-4 mb-4">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors"
            style={{
              background: range === r ? "var(--accent-color)" : "var(--bg-surface-2)",
              color: range === r ? "var(--bg-base)" : "var(--text-secondary)",
              border: "0.5px solid var(--card-border)",
            }}
          >
            {isES ? RANGE_LABEL_ES[r] : RANGE_LABEL_EN[r]}
          </button>
        ))}
        {selectedBarberId && (
          <button
            onClick={() => setSelectedBarberId(null)}
            className="px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "0.5px solid var(--card-border)" }}
          >
            {barberById.get(selectedBarberId)?.name || "-"} ×
          </button>
        )}
      </div>


      {/* --------- KPI cards --------- */}
      <div className="grid grid-cols-2 gap-3 px-4 mb-4">
        <KpiCard
          icon={<Clock size={14} />}
          label={isES ? "Tendencia típica" : "Typical Return Time"}
          value={<AnimatedNumber value={Math.round(shop.typicalReturnDays)} suffix={isES ? " d" : "d"} className="text-2xl font-bold" style={{ color: "var(--text-primary)" }} />}
          micro={isES ? "Mediana entre visitas completadas." : "Median time between completed visits."}
        />
        <KpiCard
          icon={<Users size={14} />}
          label={isES ? "Clientes activos" : "Active Clients"}
          value={<AnimatedNumber value={shop.activeClients} className="text-2xl font-bold" style={{ color: "var(--text-primary)" }} />}
          micro={isES ? "Con visita en el período seleccionado." : "With a visit in the selected period."}
        />
        <KpiCard
          icon={<TrendingUp size={14} />}
          label={isES ? "% Recurrentes" : "Returning Rate"}
          value={<AnimatedNumber value={Math.round(shop.returningRate * 100)} suffix="%" className="text-2xl font-bold" style={{ color: "var(--text-primary)" }} />}
          micro={isES ? "Clientes con 2+ visitas completadas." : "Clients with 2+ completed visits."}
        />
        <KpiCard
          icon={<AlertTriangle size={14} />}
          label={isES ? "Vencidos" : "Overdue Clients"}
          value={<AnimatedNumber value={shop.overdueClients + shop.atRiskClients} className="text-2xl font-bold" style={{ color: (shop.overdueClients + shop.atRiskClients) > 0 ? "#f59e0b" : "var(--text-primary)" }} />}
          micro={isES ? "Pasaron su fecha esperada de retorno." : "Past their personal expected return."}
          onClick={() => setStatusFilter("overdue")}
        />
        <KpiCard
          icon={<Ban size={14} />}
          label={isES ? "Perdidos" : "Lost Clients"}
          value={<AnimatedNumber value={shop.lostClients} className="text-2xl font-bold" style={{ color: shop.lostClients > 0 ? "#ef4444" : "var(--text-primary)" }} />}
          micro={isES ? "Sin visita hace 91+ días." : "No completed visit for 91+ days."}
          onClick={() => setStatusFilter("lost")}
        />
        <KpiCard
          icon={<Award size={14} />}
          label={isES ? "Retention Score" : "Retention Score"}
          value={
            <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              <AnimatedNumber value={shop.score} />/100
            </span>
          }
          micro={isES ? "Lealtad general (recurrencia + consistencia + puntualidad)." : "Overall loyalty (returning + consistency + on-time)."}
        />
      </div>

      {/* --------- Barber Retention Ranking --------- */}
      <SectionCard title={isES ? "Ranking de retención por barbero" : "Barber Retention Ranking"}>
        <div className="divide-y" style={{ borderColor: "var(--divider)" }}>
          {barberAggs.map(({ barber, agg }, idx) => {
            const trend = prior
              ? agg.typicalReturnDays - (prior ? prior.typicalReturnDays : agg.typicalReturnDays)
              : 0;
            const isSelected = selectedBarberId === barber.id;
            return (
              <button
                key={barber.id}
                onClick={() => setSelectedBarberId(isSelected ? null : barber.id)}
                className="w-full flex items-center gap-3 py-2.5 text-left transition-colors"
                style={{ background: isSelected ? "var(--bg-surface-2)" : "transparent", borderColor: "var(--divider)" }}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{ background: barber.color || "#666", color: "#fff" }}>
                  {barber.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{barber.name}</span>
                    <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>#{idx + 1}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    <span>{fmtDays(agg.typicalReturnDays)} {isES ? "prom." : "avg"}</span>
                    <span>·</span>
                    <span>{agg.activeClients} {isES ? "activos" : "active"}</span>
                    <span>·</span>
                    <span>{Math.round(agg.returningRate * 100)}% {isES ? "recur." : "return."}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{agg.score}</span>
                    <span className="text-[9px] font-semibold" style={{ color: "var(--text-tertiary)" }}>/100</span>
                  </div>
                  <div className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                    {isES ? "score" : "score"}
                  </div>
                  {trend !== 0 && (
                    <div className="text-[10px] flex items-center gap-0.5" style={{ color: trend < 0 ? "#22c55e" : "#ef4444" }}>
                      {trend < 0 ? <ArrowDownRight size={10} /> : <ArrowUpRight size={10} />}
                      {Math.abs(Math.round(trend))}d
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {!barberAggs.length && (
            <div className="py-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
              {isES ? "Sin datos de barberos." : "No barber data."}
            </div>
          )}
        </div>
      </SectionCard>

      {/* --------- Visit Frequency Distribution --------- */}
      <SectionCard
        title={isES ? "Distribución de frecuencia" : "Visit Frequency Distribution"}
        subtitle={isES ? "Distribución de clientes por intervalo promedio de visita." : "Distribution of clients by their average visit interval."}
      >
        {(() => {
          const total = FREQUENCY_BUCKETS.reduce((s, b) => s + shop.bucketCounts[b], 0) || 1;
          return (
            <div className="space-y-2.5">
              {FREQUENCY_BUCKETS.map((b, idx) => {
                const count = shop.bucketCounts[b];
                const pct = (count / total) * 100;
                return (
                  <div key={b}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {isES ? FREQUENCY_LABEL_ES[b] : FREQUENCY_LABEL_EN[b]}
                      </span>
                      <div className="flex items-center gap-2">
                        <AnimatedNumber value={Math.round(pct)} suffix="%" delay={idx * 60}
                          className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }} />
                        <AnimatedNumber value={count} delay={idx * 60}
                          className="text-[12px] font-bold" style={{ color: "var(--text-primary)" }} />
                      </div>
                    </div>
                    <AnimatedBar ratio={pct} color={FREQUENCY_COLOR[b]} delay={idx * 60} />
                  </div>
                );
              })}
            </div>
          );
        })()}
      </SectionCard>

      {/* --------- Retention Health --------- */}
      <SectionCard title={isES ? "Salud de retención" : "Retention Health"}>
        <div className="grid grid-cols-2 gap-2">
          {(["healthy", "due_soon", "overdue", "at_risk", "lost", "insufficient_history"] as RetentionStatus[]).map((s) => {
            const count = shop.statusCounts[s];
            const pct = shop.totalClients ? Math.round((count / shop.totalClients) * 100) : 0;
            const revenue = scopedHistories
              .filter((h) => h.status === s)
              .reduce((sum, h) => sum + h.avgTicketCents, 0);
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="rounded-lg p-3 text-left transition-transform active:scale-[0.98]"
                style={{ background: "var(--bg-surface-2)", border: "0.5px solid var(--card-border)" }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                    {isES ? STATUS_LABEL_ES[s] : STATUS_LABEL_EN[s]}
                  </span>
                </div>
                <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{count}</div>
                <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                  {pct}% · {fmtCents(revenue)}
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* --------- Recovery Opportunities --------- */}
      <SectionCard title={isES ? "Oportunidades de recuperación" : "Recovery Opportunities"}>
        <div className="space-y-1.5">
          <RecoveryRow
            label={isES ? "Clientes vencidos" : "Overdue clients"}
            value={String(shop.overdueClients + shop.atRiskClients)}
            onClick={() => setStatusFilter("overdue")}
          />
          <RecoveryRow
            label={isES ? "Ingreso recuperable estimado" : "Estimated recoverable revenue"}
            value={fmtCents(recoverableCents)}
          />
          {oldestInactive && (
            <RecoveryRow
              label={isES ? "Cliente inactivo más antiguo" : "Oldest inactive client"}
              value={`${oldestInactive.clientName} · ${oldestInactive.daysSinceLast}d`}
              onClick={() => navigate(`/admin/clients?open=${encodeURIComponent(oldestInactive.clientName)}`)}
            />
          )}
          <RecoveryRow
            label={isES ? "Clientes perdidos" : "Lost clients"}
            value={String(shop.lostClients)}
            onClick={() => setStatusFilter("lost")}
          />
        </div>
      </SectionCard>

      {/* --------- Client table --------- */}
      <SectionCard title={isES ? "Clientes" : "Clients"}>
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isES ? "Buscar cliente…" : "Search client…"}
              className="w-full pl-8 pr-3 py-1.5 rounded-md text-[12px]"
              style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "0.5px solid var(--card-border)" }}
            />
          </div>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as any)}
            className="px-2 py-1.5 rounded-md text-[11px]"
            style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "0.5px solid var(--card-border)" }}
          >
            <option value="overdue">{isES ? "Días vencido" : "Days overdue"}</option>
            <option value="last">{isES ? "Última visita" : "Last visit"}</option>
            <option value="visits">{isES ? "Visitas" : "Visits"}</option>
            <option value="spend">{isES ? "Gastado" : "Spent"}</option>
            <option value="name">{isES ? "Nombre" : "Name"}</option>
          </select>
          {statusFilter !== "all" && (
            <button
              onClick={() => setStatusFilter("all")}
              className="px-2 py-1.5 rounded-md text-[10px] font-semibold flex items-center gap-1"
              style={{ background: STATUS_COLOR[statusFilter] + "22", color: STATUS_COLOR[statusFilter], border: `0.5px solid ${STATUS_COLOR[statusFilter]}55` }}
            >
              {isES ? STATUS_LABEL_ES[statusFilter] : STATUS_LABEL_EN[statusFilter]} ×
            </button>
          )}
        </div>

        <div className="divide-y" style={{ borderColor: "var(--divider)" }}>
          {tableRows.map((r) => {
            const barber = r.primaryBarberId ? barberById.get(r.primaryBarberId) : null;
            const isOverdue = r.status === "overdue" || r.status === "at_risk";
            const isLost = r.status === "lost";
            return (
              <button
                key={r.clientId}
                onClick={() => navigate(`/admin/clients?open=${encodeURIComponent(r.clientName)}`)}
                className="w-full flex items-center gap-2 py-2 text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{r.clientName}</span>
                    {barber && (
                      <span className="text-[9px] px-1 rounded font-bold" style={{ background: (barber.color || "#666") + "22", color: barber.color || "var(--text-secondary)" }}>
                        {barber.name.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] flex items-center gap-1.5 mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    <span>{r.lifetimeVisits} {isES ? "visitas" : "visits"}</span>
                    <span>·</span>
                    <span>{fmtCents(r.lifetimeSpendCents)}</span>
                    <span>·</span>
                    <span>{isES ? "cada" : "every"} {fmtDays(r.cadence)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: STATUS_COLOR[r.status] + "22", color: STATUS_COLOR[r.status] }}>
                    {isES ? STATUS_LABEL_ES[r.status] : STATUS_LABEL_EN[r.status]}
                  </span>
                  <span className="text-[10px] mt-0.5" style={{ color: isLost || isOverdue ? "#f59e0b" : "var(--text-tertiary)" }}>
                    {r.expected
                      ? (r.daysFromExpected > 0
                          ? (isES ? `${r.daysFromExpected}d vencido` : `${r.daysFromExpected}d overdue`)
                          : (isES ? `en ${-r.daysFromExpected}d` : `in ${-r.daysFromExpected}d`))
                      : fmtDate(r.lastVisit)}
                  </span>
                </div>
                <ChevronRight size={12} style={{ color: "var(--text-tertiary)" }} />
              </button>
            );
          })}
          {!tableRows.length && (
            <div className="py-6 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
              {isES ? "No hay clientes que coincidan." : "No matching clients."}
            </div>
          )}
        </div>
      </SectionCard>

      {/* --------- Smart Insights --------- */}
      <SectionCard title={isES ? "Insights" : "Smart Insights"}>
        <div className="space-y-2">
          {insights.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="flex items-start gap-2 text-[12px]"
              style={{ color: "var(--text-secondary)" }}
            >
              <Info size={12} className="mt-0.5 shrink-0" style={{ color: "var(--accent-color)" }} />
              <span>{line}</span>
            </motion.div>
          ))}
          {!insights.length && (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {isES ? "Aún no hay suficientes datos." : "Not enough data yet."}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------- helpers ----------------

function KpiCard({
  icon, label, value, micro, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  micro: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg p-3 text-left transition-transform active:scale-[0.98]"
      style={{ background: "var(--bg-surface)", border: "0.5px solid var(--card-border)" }}
    >
      <div className="flex items-center gap-1.5 mb-1" style={{ color: "var(--text-tertiary)" }}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div>{value}</div>
      <div className="text-[10px] mt-1 leading-tight" style={{ color: "var(--text-tertiary)" }}>{micro}</div>
    </button>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      className="mx-4 mb-3 rounded-xl p-4"
      style={{ background: "var(--bg-surface)", border: "0.5px solid var(--card-border)" }}
    >
      <div className="mb-3">
        <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{title}</div>
        {subtitle && <div className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function RecoveryRow({ label, value, onClick }: { label: string; value: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="w-full flex items-center justify-between py-2 text-left"
      style={{ borderBottom: "0.5px solid var(--divider)" }}
    >
      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>{value}</span>
        {onClick && <ChevronRight size={12} style={{ color: "var(--text-tertiary)" }} />}
      </div>
    </button>
  );
}
