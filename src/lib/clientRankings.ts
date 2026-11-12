export type ClientRankingMetrics = {
  total_visits: number;
  total_spent_cents: number;
};

export const RECOGNITION_WINDOW_DAYS = 90;

export type RecentTransaction = { client_id: string | null; total_cents: number; created_at: string };

export type VisitAppointment = {
  id: string;
  starts_at: string;
  status: string | null;
  client_id?: string | null;
  client_name?: string | null;
  barber_id: string;
};

export type SpendingAppointment = VisitAppointment & { price_cents: number };
export type ProductTransaction = {
  id: string;
  client_id: string | null;
  created_at: string;
  status: string;
  type: string;
  subtotal_cents: number;
  transaction_items: { id: string; item_type: string; total_cents: number }[];
};

/** Recognition only: never add service payments to an appointment's price. */
export function productPurchaseCents(tx: ProductTransaction): number {
  if (tx.status !== "completed") return 0;
  const items = [...new Map(tx.transaction_items.map(item => [item.id, item])).values()];
  const products = items.filter(item => item.item_type === "product");
  if (products.length) return products.reduce((sum, item) => sum + item.total_cents, 0);
  // Legacy product-only receipts have an unambiguous subtotal, excluding tips.
  return tx.type === "product" && items.length === 0 ? tx.subtotal_cents : 0;
}

export function sumAppointmentPrices(rows: readonly SpendingAppointment[], now = new Date(), since?: number): number {
  return selectVisitAppointments(rows, now, since).reduce((sum, a) => sum + a.price_cents, 0);
}

/** 90-day VIP value, independent of payment status on appointments. */
export function aggregateRecognitionSpending(
  appointments: readonly SpendingAppointment[], products: readonly ProductTransaction[],
  clients: readonly { id: string; first_name: string; last_name: string | null }[], now = new Date(),
): Map<string, number> {
  const since = now.getTime() - RECOGNITION_WINDOW_DAYS * 86_400_000;
  const out = new Map<string, number>();
  for (const a of selectVisitAppointments(appointments, now, since)) {
    const ids = a.client_id ? [a.client_id] : clients.filter(c =>
      `${c.first_name}${c.last_name ? " " + c.last_name : ""}` === a.client_name).map(c => c.id);
    for (const id of ids) out.set(id, (out.get(id) ?? 0) + a.price_cents);
  }
  const seen = new Set<string>();
  for (const tx of products) {
    const at = new Date(tx.created_at).getTime();
    if (!tx.client_id || !Number.isFinite(at) || at < since || at > now.getTime() || seen.has(tx.id)) continue;
    seen.add(tx.id);
    const cents = productPurchaseCents(tx);
    if (cents) out.set(tx.client_id, (out.get(tx.client_id) ?? 0) + cents);
  }
  return out;
}

/** Complete, deterministically ordered reads; never publish a partial history. */
export async function fetchAppointmentPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await load(from, from + 999);
    if (error || !data) throw new Error(error?.message ?? "Incomplete appointment history");
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

/** One visit per ID, independent of payment and balance. */
export function selectVisitAppointments<T extends VisitAppointment>(
  rows: readonly T[], now = new Date(), since?: number, barberId?: string | null,
): T[] {
  const seen = new Set<string>();
  return rows.filter(a => {
    const start = new Date(a.starts_at).getTime();
    if (a.status === "cancelled" || !Number.isFinite(start) || start > now.getTime() ||
      (since !== undefined && start < since) || (barberId && a.barber_id !== barberId) || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

export function aggregateAppointmentVisits(
  rows: readonly VisitAppointment[],
  clients: readonly { id: string; first_name: string; last_name: string | null }[],
  now = new Date(), barberId?: string | null,
): Map<string, number> {
  const out = new Map<string, number>();
  const since = now.getTime() - RECOGNITION_WINDOW_DAYS * 86_400_000;
  for (const a of selectVisitAppointments(rows, now, since, barberId)) {
    // Retain the existing exact-name fallback only where no client ID exists.
    const ids = a.client_id ? [a.client_id] : clients.filter(c =>
      `${c.first_name}${c.last_name ? " " + c.last_name : ""}` === a.client_name).map(c => c.id);
    for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/** Earliest future start, plus optional expiry from the rolling 90-day window. */
export function nextVisitUpdateAt(rows: readonly VisitAppointment[], now = new Date(), rolling = false): number | null {
  let next = Infinity;
  for (const a of rows) {
    if (a.status === "cancelled") continue;
    const start = new Date(a.starts_at).getTime();
    if (start > now.getTime()) next = Math.min(next, start);
    const expiry = start + RECOGNITION_WINDOW_DAYS * 86_400_000 + 1;
    if (rolling && start <= now.getTime() && expiry > now.getTime()) next = Math.min(next, expiry);
  }
  return Number.isFinite(next) ? next : null;
}

/** Sums completed transactions per client inside the recognition window. */
export function aggregateRecentActivity(
  txs: readonly RecentTransaction[],
  now: Date = new Date(),
  days: number = RECOGNITION_WINDOW_DAYS,
): Map<string, ClientRankingMetrics> {
  const since = now.getTime() - days * 86_400_000;
  const out = new Map<string, ClientRankingMetrics>();
  for (const tx of txs) {
    if (!tx.client_id || new Date(tx.created_at).getTime() < since) continue;
    const m = out.get(tx.client_id) ?? { total_visits: 0, total_spent_cents: 0 };
    m.total_visits += 1;
    m.total_spent_cents += tx.total_cents || 0;
    out.set(tx.client_id, m);
  }
  return out;
}

/** Mirrors the existing VIP top-fifth threshold, including boundary ties. */
export function clientRecognitionThreshold(
  clients: readonly ClientRankingMetrics[],
  metric: keyof ClientRankingMetrics,
): number {
  if (clients.length === 0) return 0;
  const values = clients.map((client) => client[metric]).sort((a, b) => b - a);
  return values[Math.max(0, Math.floor(values.length * 0.2) - 1)] ?? 0;
}

export function isRecognizedClient(value: number, threshold: number): boolean {
  return threshold > 0 && value >= threshold;
}

/** Spending never breaks attendance ties. */
export function compareClientVisits(
  a: ClientRankingMetrics & { first_name: string; last_name: string | null },
  b: ClientRankingMetrics & { first_name: string; last_name: string | null },
): number {
  return b.total_visits - a.total_visits ||
    `${a.first_name} ${a.last_name ?? ""}`.localeCompare(`${b.first_name} ${b.last_name ?? ""}`);
}