/**
 * Retention outreach helpers (pure). Reuses the retention engine in
 * ./retention for cadence ("tendencia") and status. Affinity and credits are
 * enforced and derived by the backend; these helpers only shape data.
 *
 * Contract (see AGENTS.md):
 * - Visits = past non-cancelled appointments, regardless of payment.
 * - Habitual client = at least 3 visits and a tendencia of 45 days or less.
 * - Pending = habitual, overdue/at risk/lost for at most 180 days since the
 *   last visit, and no future non-cancelled booking.
 * - As-of reconstruction only uses appointments whose created_at is at or
 *   before the as-of instant, so comparisons never fabricate history.
 */
import { buildClientHistory, type ClientHistory, type RawApptForRetention } from "./retention";
import { hasRetentionPhone } from "./retentionContacts";

export const ATTRIBUTION_WINDOW_MS = 72 * 3_600_000;
export const HABITUAL_MIN_VISITS = 3;
export const HABITUAL_MAX_TENDENCIA_DAYS = 45;
export const PENDING_MAX_DAYS_SINCE = 180;

export interface OutreachAppt extends RawApptForRetention {
  created_at: string;
  client_phone?: string | null;
}

export interface CopyEvent {
  id: string;
  client_id: string;
  actor_user_id: string;
  actor_barber_id: string | null;
  actor_name: string;
  action: string;
  copied_at: string;
}

export interface CreditRow {
  appointment_id: string;
  client_id: string;
  appointment_created_at: string;
  appointment_starts_at: string;
  appointment_barber_id: string;
  copy_id: string;
  copied_at: string;
  actor_user_id: string;
  actor_barber_id: string | null;
  actor_name: string;
}

export interface PendingClient {
  history: ClientHistory;
  phone: string | null;
}

export function isHabitual(h: ClientHistory): boolean {
  return h.lifetimeVisits >= HABITUAL_MIN_VISITS && h.cadence > 0 && h.cadence <= HABITUAL_MAX_TENDENCIA_DAYS;
}

export function isPendingStatus(h: ClientHistory): boolean {
  return (h.status === "overdue" || h.status === "at_risk" || h.status === "lost") && h.daysSinceLast <= PENDING_MAX_DAYS_SINCE;
}

/** Pending clients as known at `asOf`, using only rows created by then. */
/** Hot leads first: fewest days past expected return; ties favor the most recent visit. */
export function comparePendingHotFirst(a: PendingClient, b: PendingClient): number {
  const diff = a.history.daysFromExpected - b.history.daysFromExpected;
  if (diff !== 0) return diff;
  return (b.history.lastVisit?.getTime() ?? 0) - (a.history.lastVisit?.getTime() ?? 0);
}

export function pendingClientsAsOf(appts: OutreachAppt[], asOf: Date, profilePhones?: ReadonlyMap<string, string | null>): PendingClient[] {
  const t = asOf.getTime();
  const byClient = new Map<string, OutreachAppt[]>();
  const hasFuture = new Set<string>();
  const phones = new Map<string, string>();
  for (const a of appts) {
    if (!a.client_id || a.status === "cancelled") continue;
    if (new Date(a.created_at).getTime() > t) continue;
    const start = new Date(a.starts_at).getTime();
    if (start >= t) { hasFuture.add(a.client_id); continue; }
    if (!byClient.has(a.client_id)) byClient.set(a.client_id, []);
    byClient.get(a.client_id)?.push(a);
    if (a.client_phone) phones.set(a.client_id, a.client_phone);
  }
  const out: PendingClient[] = [];
  byClient.forEach((rows, clientId) => {
    if (hasFuture.has(clientId)) return;
    const phone = profilePhones ? profilePhones.get(clientId) : phones.get(clientId);
    if (!hasRetentionPhone(phone)) return;
    const sorted = [...rows].sort((x, y) => x.starts_at.localeCompare(y.starts_at));
    const h = buildClientHistory(clientId, sorted[sorted.length - 1].client_name || "-", sorted, asOf);
    if (isHabitual(h) && isPendingStatus(h)) out.push({ history: h, phone: phone ?? null });
  });
  return out.sort(comparePendingHotFirst);
}

/** Earliest instant any appointment was recorded; comparisons before it are unavailable. */
export function earliestRecord(appts: OutreachAppt[]): Date | null {
  let min = Infinity;
  for (const a of appts) min = Math.min(min, new Date(a.created_at).getTime());
  return Number.isFinite(min) ? new Date(min) : null;
}

export type OutreachStage = "pending" | "copied" | "reactivated";

export interface ClientOutreachState {
  stage: OutreachStage;
  lastCopy: CopyEvent | null;
  windowEndsAt: Date | null;
  credit: CreditRow | null;
}

/** Shared visual state for one client. Copies outside the window revert to pending. */
export function outreachState(clientId: string, copies: CopyEvent[], credits: CreditRow[], now: Date): ClientOutreachState {
  const credit = credits
    .filter((c) => c.client_id === clientId)
    .sort((a, b) => b.appointment_created_at.localeCompare(a.appointment_created_at))[0] ?? null;
  const lastCopy = copies
    .filter((c) => c.client_id === clientId)
    .sort((a, b) => b.copied_at.localeCompare(a.copied_at))[0] ?? null;
  if (credit && (!lastCopy || lastCopy.copied_at <= credit.appointment_created_at)) {
    return { stage: "reactivated", lastCopy, windowEndsAt: null, credit };
  }
  if (lastCopy) {
    const end = new Date(new Date(lastCopy.copied_at).getTime() + ATTRIBUTION_WINDOW_MS);
    if (end.getTime() > now.getTime()) return { stage: "copied", lastCopy, windowEndsAt: end, credit: null };
  }
  return { stage: "pending", lastCopy, windowEndsAt: null, credit: null };
}

export function trendPct(current: number, previous: number | null): number | null {
  if (previous === null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

/** wa.me requires digits only with country code; PR numbers default to +1. */
export function whatsappUrl(phone: string | null, text: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = "1" + digits;
  if (digits.length < 11) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** First word of the real stored name; null when missing or a placeholder. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || first === "-" || /^cliente$/i.test(first)) return null;
  return first;
}

/** Natural Spanish date in Puerto Rico time, e.g. "15 de octubre". */
export function prNaturalDate(d: Date): string {
  return d.toLocaleDateString("es-PR", { day: "numeric", month: "long", timeZone: "America/Puerto_Rico" });
}

/**
 * Official outreach template (exact wording approved by Charlie); event is set in the Outreach UI.
 * Fallbacks never invent a name. Always editable and sent manually.
 */
export function suggestedMessage(firstName: string | null, event: string): string {
  const greeting = firstName ? `Saludos ${firstName},` : "Saludos,";
  return `${greeting} Se está acercando ${event.trim() || "la próxima fecha especial"} y estoy cuadrando las citas de mis clientes importantes. Quería asegurarme de que no te quedes sin tu espacio para esa fecha. ¿Quieres que te separe una cita?`;
}
