/**
 * Client retention math. Pure functions — no React, no Supabase.
 *
 * Vocabulary:
 * - "visit" = completed appointment only (cancelled / no-show / future are ignored upstream).
 * - "interval" = day gap between consecutive completed visits. Client's first visit is
 *   never counted as an interval.
 * - "cadence" = the client's natural time between visits. We prefer the MEDIAN once we
 *   have >=3 intervals (extreme long gaps distort the mean); fall back to the average
 *   for 1–2 intervals.
 */

export const MS_PER_DAY = 86_400_000;

export interface RawApptForRetention {
  id: string;
  client_id: string | null;
  client_name: string | null;
  barber_id: string | null;
  starts_at: string;
  status: string;
  price_cents: number;
  amount_paid_cents: number;
}

export type RetentionStatus =
  | "healthy"
  | "due_soon"
  | "overdue"
  | "at_risk"
  | "lost"
  | "insufficient_history";

export type FrequencyBucket =
  | "weekly"
  | "biweekly"
  | "triweekly"
  | "monthly"
  | "bimonthly"
  | "infrequent";

export const FREQUENCY_BUCKETS: FrequencyBucket[] = [
  "weekly",
  "biweekly",
  "triweekly",
  "monthly",
  "bimonthly",
  "infrequent",
];

export const FREQUENCY_LABEL_ES: Record<FrequencyBucket, string> = {
  weekly: "Semanal",
  biweekly: "Cada 2 semanas",
  triweekly: "Cada 3 semanas",
  monthly: "Mensual",
  bimonthly: "Cada 2 meses",
  infrequent: "76+ días",
};

export const FREQUENCY_LABEL_EN: Record<FrequencyBucket, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  triweekly: "Every 3 weeks",
  monthly: "Monthly",
  bimonthly: "Every 2 months",
  infrequent: "76+ days",
};

export const STATUS_LABEL_ES: Record<RetentionStatus, string> = {
  healthy: "Al día",
  due_soon: "Próximo",
  overdue: "Vencido",
  at_risk: "En riesgo",
  lost: "Perdido",
  insufficient_history: "Historial corto",
};

export const STATUS_LABEL_EN: Record<RetentionStatus, string> = {
  healthy: "Healthy",
  due_soon: "Due Soon",
  overdue: "Overdue",
  at_risk: "At Risk",
  lost: "Lost",
  insufficient_history: "Insufficient History",
};

export const STATUS_COLOR: Record<RetentionStatus, string> = {
  healthy: "#22c55e",
  due_soon: "#3b82f6",
  overdue: "#f59e0b",
  at_risk: "#f97316",
  lost: "#ef4444",
  insufficient_history: "#6b7280",
};

export const FREQUENCY_COLOR: Record<FrequencyBucket, string> = {
  weekly: "#22c55e",
  biweekly: "#3b82f6",
  triweekly: "#eab308",
  monthly: "#f59e0b",
  bimonthly: "#f97316",
  infrequent: "#6b7280",
};

// ------------------------------ core math ------------------------------

export function computeIntervals(dates: Date[]): number[] {
  if (dates.length < 2) return [];
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const out: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const d = (sorted[i].getTime() - sorted[i - 1].getTime()) / MS_PER_DAY;
    if (d > 0) out.push(d);
  }
  return out;
}

export function averageInterval(intervals: number[]): number {
  if (!intervals.length) return 0;
  return intervals.reduce((s, n) => s + n, 0) / intervals.length;
}

export function medianInterval(intervals: number[]): number {
  if (!intervals.length) return 0;
  const s = [...intervals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

/** Personal cadence: median once we have ≥3 intervals, else average. 0 if none. */
export function cadenceDays(intervals: number[]): number {
  if (!intervals.length) return 0;
  return intervals.length >= 3 ? medianInterval(intervals) : averageInterval(intervals);
}

export function expectedReturnDate(lastVisit: Date, cadence: number): Date | null {
  if (!cadence || cadence <= 0) return null;
  return new Date(lastVisit.getTime() + cadence * MS_PER_DAY);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/**
 * Coefficient-of-variation based consistency, mapped to 0..1 where 1 = very consistent.
 * cv = stdev / mean. score = clamp(1 - cv, 0, 1).
 */
export function consistencyScore(intervals: number[]): number {
  if (intervals.length < 2) return 0;
  const mean = averageInterval(intervals);
  if (mean <= 0) return 0;
  const variance =
    intervals.reduce((s, n) => s + (n - mean) ** 2, 0) / intervals.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(1, 1 - cv));
}

export function frequencyBucket(cadence: number): FrequencyBucket | null {
  if (!cadence || cadence <= 0) return null;
  if (cadence <= 10) return "weekly";
  if (cadence <= 17) return "biweekly";
  if (cadence <= 24) return "triweekly";
  if (cadence <= 45) return "monthly";
  if (cadence <= 75) return "bimonthly";
  return "infrequent";
}

// ------------------------------ per-client aggregates ------------------------------

export interface ClientHistory {
  clientId: string;
  clientName: string;
  visits: Date[];               // completed only, ascending
  intervals: number[];
  cadence: number;              // days; 0 if insufficient
  avg: number;
  median: number;
  consistency: number;          // 0..1
  lastVisit: Date | null;
  expected: Date | null;
  daysSinceLast: number;        // relative to "now"
  daysFromExpected: number;     // + overdue, - early. 0 if no expected date
  status: RetentionStatus;
  lifetimeVisits: number;
  lifetimeSpendCents: number;
  primaryBarberId: string | null;
  perBarber: Map<string, Date[]>;  // barberId -> visits with that barber
  avgTicketCents: number;
  bucket: FrequencyBucket | null;
}

export function statusFor(
  lastVisit: Date | null,
  cadence: number,
  now: Date
): RetentionStatus {
  if (!lastVisit) return "insufficient_history";
  const daysSince = daysBetween(lastVisit, now);
  if (!cadence || cadence <= 0) {
    // No cadence yet: fallback threshold is 91+ days
    return daysSince >= 91 ? "lost" : "insufficient_history";
  }
  const diff = daysSince - cadence; // + overdue, - early
  if (daysSince >= 91 && diff > 0) return "lost";
  if (diff >= cadence * 0.5) return "at_risk";
  if (diff > 0) return "overdue";
  if (diff >= -3) return "due_soon";
  return "healthy";
}

export function buildClientHistory(
  clientId: string,
  clientName: string,
  appts: RawApptForRetention[],
  now: Date
): ClientHistory {
  const sorted = [...appts].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  );
  const visits = sorted.map((a) => new Date(a.starts_at));
  const intervals = computeIntervals(visits);
  const cadence = cadenceDays(intervals);
  const avg = averageInterval(intervals);
  const median = medianInterval(intervals);
  const consistency = consistencyScore(intervals);
  const lastVisit = visits.length ? visits[visits.length - 1] : null;
  const expected = lastVisit ? expectedReturnDate(lastVisit, cadence) : null;
  const daysSinceLast = lastVisit ? daysBetween(lastVisit, now) : 0;
  const daysFromExpected = expected ? daysBetween(expected, now) : 0;
  const status = statusFor(lastVisit, cadence, now);

  const perBarber = new Map<string, Date[]>();
  const barberCounts = new Map<string, number>();
  const barberLast = new Map<string, number>();
  let spend = 0;
  for (const a of sorted) {
    const paid = a.amount_paid_cents || a.price_cents || 0;
    spend += paid;
    if (a.barber_id) {
      if (!perBarber.has(a.barber_id)) perBarber.set(a.barber_id, []);
      perBarber.get(a.barber_id)!.push(new Date(a.starts_at));
      barberCounts.set(a.barber_id, (barberCounts.get(a.barber_id) || 0) + 1);
      const t = new Date(a.starts_at).getTime();
      if (t > (barberLast.get(a.barber_id) || 0)) barberLast.set(a.barber_id, t);
    }
  }
  let primaryBarberId: string | null = null;
  let bestCount = -1;
  let bestLast = 0;
  barberCounts.forEach((count, bid) => {
    const last = barberLast.get(bid) || 0;
    if (count > bestCount || (count === bestCount && last > bestLast)) {
      primaryBarberId = bid;
      bestCount = count;
      bestLast = last;
    }
  });

  const lifetimeVisits = sorted.length;
  const avgTicketCents = lifetimeVisits ? Math.round(spend / lifetimeVisits) : 0;

  return {
    clientId,
    clientName,
    visits,
    intervals,
    cadence,
    avg,
    median,
    consistency,
    lastVisit,
    expected,
    daysSinceLast,
    daysFromExpected,
    status,
    lifetimeVisits,
    lifetimeSpendCents: spend,
    primaryBarberId,
    perBarber,
    avgTicketCents,
    bucket: frequencyBucket(cadence),
  };
}

/** Recompute a client's cadence + status using only visits with a specific barber. */
export function historyForBarber(
  base: ClientHistory,
  barberId: string,
  now: Date
): ClientHistory | null {
  const barberVisits = base.perBarber.get(barberId);
  if (!barberVisits || !barberVisits.length) return null;
  const sorted = [...barberVisits].sort((a, b) => a.getTime() - b.getTime());
  const intervals = computeIntervals(sorted);
  const cadence = cadenceDays(intervals);
  const avg = averageInterval(intervals);
  const median = medianInterval(intervals);
  const consistency = consistencyScore(intervals);
  const lastVisit = sorted[sorted.length - 1];
  const expected = expectedReturnDate(lastVisit, cadence);
  const daysSinceLast = daysBetween(lastVisit, now);
  const daysFromExpected = expected ? daysBetween(expected, now) : 0;
  const status = statusFor(lastVisit, cadence, now);
  // Approximate per-barber spend by proportion.
  const proportion = sorted.length / Math.max(1, base.lifetimeVisits);
  return {
    ...base,
    visits: sorted,
    intervals,
    cadence,
    avg,
    median,
    consistency,
    lastVisit,
    expected,
    daysSinceLast,
    daysFromExpected,
    status,
    lifetimeVisits: sorted.length,
    lifetimeSpendCents: Math.round(base.lifetimeSpendCents * proportion),
    avgTicketCents: sorted.length
      ? Math.round(base.lifetimeSpendCents * proportion / sorted.length)
      : 0,
    primaryBarberId: barberId,
    bucket: frequencyBucket(cadence),
  };
}

// ------------------------------ shop / barber aggregates ------------------------------

export interface RetentionAggregate {
  scopeId: string | "shop";
  totalClients: number;
  activeClients: number;              // visit within selected window
  returningClients: number;           // >=2 completed visits
  returningRate: number;              // 0..1
  overdueClients: number;
  atRiskClients: number;
  lostClients: number;
  onTimeClients: number;              // healthy or due_soon
  typicalReturnDays: number;          // median of client cadences
  avgReturnDays: number;              // avg of client cadences
  score: number;                      // 0..100
  bucketCounts: Record<FrequencyBucket, number>;
  statusCounts: Record<RetentionStatus, number>;
  histories: ClientHistory[];         // clients included in this scope
}

export function aggregate(
  histories: ClientHistory[],
  windowStart: Date | null // null = all time; only affects "active" definition
): RetentionAggregate {
  const bucketCounts: Record<FrequencyBucket, number> = {
    weekly: 0, biweekly: 0, triweekly: 0, monthly: 0, bimonthly: 0, infrequent: 0,
  };
  const statusCounts: Record<RetentionStatus, number> = {
    healthy: 0, due_soon: 0, overdue: 0, at_risk: 0, lost: 0, insufficient_history: 0,
  };
  const cadences: number[] = [];
  let active = 0;
  let returning = 0;
  let overdue = 0;
  let atRisk = 0;
  let lost = 0;
  let onTime = 0;

  for (const h of histories) {
    if (h.bucket) bucketCounts[h.bucket]++;
    statusCounts[h.status]++;
    if (h.cadence > 0) cadences.push(h.cadence);
    if (h.lifetimeVisits >= 2) returning++;
    if (h.status === "overdue") overdue++;
    if (h.status === "at_risk") atRisk++;
    if (h.status === "lost") lost++;
    if (h.status === "healthy" || h.status === "due_soon") onTime++;
    if (windowStart) {
      if (h.lastVisit && h.lastVisit >= windowStart) active++;
    } else if (h.lastVisit) {
      active++;
    }
  }

  const totalClients = histories.length;
  const eligible = Math.max(1, totalClients); // avoid /0
  const returningRate = returning / eligible;
  const onTimeRate = onTime / eligible;
  const lostRate = lost / eligible;
  const avgConsistency =
    histories.reduce((s, h) => s + h.consistency, 0) / eligible;

  const typicalReturnDays = cadences.length ? medianInterval(cadences) : 0;
  const avgReturnDays = cadences.length ? averageInterval(cadences) : 0;

  // Retention Score (0..100): 35 returning, 25 consistency, 25 on-time, 15 loss inverse
  const score = Math.round(
    35 * returningRate +
    25 * avgConsistency +
    25 * onTimeRate +
    15 * (1 - lostRate)
  );

  return {
    scopeId: "shop",
    totalClients,
    activeClients: active,
    returningClients: returning,
    returningRate,
    overdueClients: overdue,
    atRiskClients: atRisk,
    lostClients: lost,
    onTimeClients: onTime,
    typicalReturnDays,
    avgReturnDays,
    score: Math.max(0, Math.min(100, score)),
    bucketCounts,
    statusCounts,
    histories,
  };
}

/**
 * Range presets applied to the report. All-time keeps full history but caps
 * "active clients" definition at the entire span so it degenerates gracefully.
 */
export type RetentionRange = "90d" | "6m" | "12m" | "all";

export function rangeStart(range: RetentionRange, now: Date): Date | null {
  const d = new Date(now);
  switch (range) {
    case "90d": d.setDate(d.getDate() - 90); return d;
    case "6m":  d.setMonth(d.getMonth() - 6); return d;
    case "12m": d.setMonth(d.getMonth() - 12); return d;
    case "all": return null;
  }
}

export const RANGE_LABEL_ES: Record<RetentionRange, string> = {
  "90d": "Últimos 90 días",
  "6m": "Últimos 6 meses",
  "12m": "Últimos 12 meses",
  "all": "Todo el historial",
};
export const RANGE_LABEL_EN: Record<RetentionRange, string> = {
  "90d": "Last 90 Days",
  "6m": "Last 6 Months",
  "12m": "Last 12 Months",
  "all": "All Time",
};
