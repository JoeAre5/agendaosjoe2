/**
 * Unified production calculator
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for "what did we make this week?"
 * Used by both the Home tab and the Reports tab so totals always match.
 *
 * Two non-overlapping buckets (no double-counting):
 *   SLOT 1 — Appointments (paid OR with completed transaction)
 *            → linked tx exists                       → "linked_tx"
 *            → no linked tx, paid, loose tx matches   → "matched_tx" (consume tx)
 *            → no linked tx, paid, no match           → "appt_paid" (legacy fallback)
 *            → else 0                                 → skip
 *
 *   SLOT 2 — Loose transactions (appointment_id IS NULL) NOT consumed above
 *            → walk-ins + product-only sales          → "loose_tx"
 *
 * The `appointment_id` field + the matched_tx pass are the referees that
 * prevent double counting (e.g. ATH webhook tx without appointment link while
 * Acuity also marked the appointment paid).
 */

import { classifyProcessor, type ProcessorKey } from "./gatewayFees";

export type PmClass = "cash" | "digital";

export interface UnifiedRow {
  id: string;
  source: "appointment" | "transaction";
  barber_id: string;
  subtotal_cents: number;
  tip_cents: number;
  total_cents: number;
  pm: PmClass;
  payment_method: string;
  processor: ProcessorKey;
  occurred_at: string;
  client_name?: string | null;
  service_name?: string | null;
  /**
   * Origin of the financial amounts:
   *   "linked_tx"  — appointment with a transactions row attached (truth)
   *   "matched_tx" — appointment.paid + loose tx matched by (barber+total+day)
   *   "appt_paid"  — appointment.paid fallback, NO matching tx (legacy/manual)
   *   "loose_tx"   — transaction with no appointment_id (walk-in / product-only)
   */
  origin: "linked_tx" | "matched_tx" | "appt_paid" | "loose_tx";
}

export interface RawAppointment {
  id: string;
  barber_id: string;
  starts_at: string;
  status: string;
  paid: boolean;
  price_cents: number;
  tip_cents: number;
  amount_paid_cents: number;
  payment_method: string | null;
  notes: string | null;
  service_name?: string | null;
  client_name?: string | null;
}

export interface RawTransaction {
  id: string;
  barber_id: string;
  appointment_id: string | null;
  created_at: string;
  status: string;
  payment_method: string;
  subtotal_cents: number;
  tip_cents: number;
  total_cents: number;
}

function classifyApptPm(a: Pick<RawAppointment, "payment_method" | "amount_paid_cents" | "price_cents" | "notes">): PmClass {
  const pm = (a.payment_method || "").toLowerCase().trim();
  if (pm === "cash") return "cash";
  if (pm === "ath_movil" || pm === "stripe" || pm === "paypal") return "digital";
  if (!pm) {
    const fullyPaid = a.amount_paid_cents >= a.price_cents;
    if (!fullyPaid) return "cash";
    const notes = (a.notes || "").toLowerCase();
    if (notes.includes("ath")) return "digital";
    return "cash";
  }
  return "digital";
}

function classifyTxPm(pm: string | null | undefined): PmClass {
  const v = (pm || "").toLowerCase().trim();
  if (!v || v === "cash") return "cash";
  return "digital";
}

function normalizePmString(pm: string | null | undefined): string {
  const v = (pm || "").toLowerCase().trim();
  if (!v) return "cash";
  if (v.includes("ath")) return "ath_movil";
  if (v.includes("stripe") || v.includes("card") || v.includes("tarjeta")) return "stripe";
  if (v.includes("paypal")) return "paypal";
  return "cash";
}

function dayKey(iso: string): string {
  return (iso || "").slice(0, 10);
}

export function buildUnifiedProduction(
  appointments: RawAppointment[],
  transactions: RawTransaction[]
): UnifiedRow[] {
  const rows: UnifiedRow[] = [];

  const txByAppt = new Map<string, RawTransaction>();
  const looseTx: RawTransaction[] = [];
  for (const tx of transactions) {
    if (tx.status !== "completed") continue;
    if (tx.appointment_id) {
      const previous = txByAppt.get(tx.appointment_id);
      txByAppt.set(tx.appointment_id, previous ? {
        ...previous,
        subtotal_cents: previous.subtotal_cents + tx.subtotal_cents,
        tip_cents: previous.tip_cents + tx.tip_cents,
        total_cents: previous.total_cents + tx.total_cents,
      } : { ...tx });
    } else looseTx.push(tx);
  }

  // Index loose tx by barber|day|total for fast appointment-fallback matching
  const looseByKey = new Map<string, RawTransaction[]>();
  for (const tx of looseTx) {
    const key = `${tx.barber_id}|${dayKey(tx.created_at)}|${tx.total_cents}`;
    const arr = looseByKey.get(key) || [];
    arr.push(tx);
    looseByKey.set(key, arr);
  }
  const consumedLooseTxIds = new Set<string>();

  // SLOT 1 — Appointments
  for (const a of appointments) {
    const status = (a.status || "").toLowerCase();
    if (status === "cancelled" || status === "canceled" || status === "no-show" || status === "no_show") continue;

    const linkedTx = txByAppt.get(a.id);

    if (linkedTx) {
      const pm = normalizePmString(linkedTx.payment_method);
      rows.push({
        id: `appt:${a.id}`,
        source: "appointment",
        barber_id: a.barber_id,
        subtotal_cents: linkedTx.subtotal_cents || 0,
        tip_cents: linkedTx.tip_cents || 0,
        total_cents: linkedTx.total_cents || 0,
        pm: classifyTxPm(linkedTx.payment_method),
        payment_method: pm,
        processor: classifyProcessor(pm),
        occurred_at: a.starts_at,
        client_name: a.client_name ?? null,
        service_name: a.service_name ?? null,
        origin: "linked_tx",
      });
    } else if (a.paid) {
      // Try matching a loose tx to prevent ATH double-count (webhook tx
      // without appointment_id while Acuity marked the appointment paid).
      const apptTotal = (a.price_cents || 0) + (a.tip_cents || 0);
      const key = `${a.barber_id}|${dayKey(a.starts_at)}|${apptTotal}`;
      const candidates = looseByKey.get(key) || [];
      const match = candidates.find((tx) => !consumedLooseTxIds.has(tx.id));
      if (match) {
        consumedLooseTxIds.add(match.id);
        const pm = normalizePmString(match.payment_method);
        rows.push({
          id: `appt:${a.id}`,
          source: "appointment",
          barber_id: a.barber_id,
          subtotal_cents: match.subtotal_cents || 0,
          tip_cents: match.tip_cents || 0,
          total_cents: match.total_cents || 0,
          pm: classifyTxPm(match.payment_method),
          payment_method: pm,
          processor: classifyProcessor(pm),
          occurred_at: a.starts_at,
          client_name: a.client_name ?? null,
          service_name: a.service_name ?? null,
          origin: "matched_tx",
        });
      } else {
        const subtotal = a.price_cents || 0;
        const tip = a.tip_cents || 0;
        const pm = normalizePmString(a.payment_method);
        rows.push({
          id: `appt:${a.id}`,
          source: "appointment",
          barber_id: a.barber_id,
          subtotal_cents: subtotal,
          tip_cents: tip,
          total_cents: subtotal + tip,
          pm: classifyApptPm(a),
          payment_method: pm,
          processor: classifyProcessor(pm),
          occurred_at: a.starts_at,
          client_name: a.client_name ?? null,
          service_name: a.service_name ?? null,
          origin: "appt_paid",
        });
      }
    }
  }

  // SLOT 2 — Loose transactions not consumed above
  for (const tx of looseTx) {
    if (consumedLooseTxIds.has(tx.id)) continue;
    const pm = normalizePmString(tx.payment_method);
    rows.push({
      id: `tx:${tx.id}`,
      source: "transaction",
      barber_id: tx.barber_id,
      subtotal_cents: tx.subtotal_cents || 0,
      tip_cents: tx.tip_cents || 0,
      total_cents: tx.total_cents || 0,
      pm: classifyTxPm(tx.payment_method),
      payment_method: pm,
      processor: classifyProcessor(pm),
      occurred_at: tx.created_at,
      origin: "loose_tx",
    });
  }

  return rows;
}

/** Sum production (subtotal only — no tips) */
export function sumProduction(rows: UnifiedRow[]): number {
  return rows.reduce((s, r) => s + r.subtotal_cents, 0);
}

/** Sum tips only */
export function sumTips(rows: UnifiedRow[]): number {
  return rows.reduce((s, r) => s + r.tip_cents, 0);
}

/** Sum total collected (subtotal + tips) */
export function sumCollected(rows: UnifiedRow[]): number {
  return rows.reduce((s, r) => s + r.total_cents, 0);
}

/** Group rows by barber_id, summing subtotal_cents */
export function groupByBarber(rows: UnifiedRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.barber_id] = (out[r.barber_id] || 0) + r.subtotal_cents;
  return out;
}

/** Group total_cents by normalized payment method */
export function groupByPaymentMethod(rows: UnifiedRow[]): Record<string, number> {
  const out: Record<string, number> = { cash: 0, stripe: 0, paypal: 0, athmovil: 0 };
  for (const r of rows) {
    const key = r.payment_method === "ath_movil" ? "athmovil" : r.payment_method;
    out[key] = (out[key] || 0) + r.total_cents;
  }
  return out;
}

/** Group tip_cents by cash vs digital */
export function groupTipsByPm(rows: UnifiedRow[]): { cash: number; digital: number } {
  const out = { cash: 0, digital: 0 };
  for (const r of rows) {
    if (r.tip_cents <= 0) continue;
    out[r.pm] += r.tip_cents;
  }
  return out;
}
