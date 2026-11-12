// Allocate a pending_review transaction to an existing appointment.
// Window: today ±3 days. Visible to entire shop.
//
// STACKING (not overwriting):
//   appointments.amount_paid_cents += tx.total_cents
//   appointments.tip_cents          += chosen_tip
//   payment_method left untouched when a prior payment exists (UI shows "Mixto").
//   paid = (amount_paid - tip) >= price_cents
//
// Split sheet lets the operator choose how the incoming amount maps to
// remaining balance vs. tip (default: cover balance first, surplus → tip).
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Search, Calendar, User, AlertTriangle, CheckCircle2, Scissors, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AllocationDayCalendar } from "./AllocationDayCalendar";

interface Appointment {
  id: string;
  starts_at: string;
  client_name: string;
  client_phone: string | null;
  service_name: string;
  price_cents: number;
  amount_paid_cents: number;
  tip_cents: number;
  payment_method: string | null;
  payment_confirmed: boolean;
  barber_id: string;
  barber_name: string;
  barber_color: string | null;
  client_id: string | null;
  ends_at: string;
  paid: boolean;
  settled: boolean;
}

interface Props {
  transaction: {
    id: string;
    total_cents: number;
    payment_method: string;
    barber_id: string;
    notes?: string | null;
  };
  open: boolean;
  onClose: () => void;
  onAllocated: () => void;
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

type SplitMode = "balance" | "tip" | "custom";

function remainingBalance(a: Appointment): number {
  // Only count confirmed payments toward balance.
  const paid = a.payment_confirmed ? Math.max(0, (a.amount_paid_cents || 0) - (a.tip_cents || 0)) : 0;
  return Math.max(0, (a.price_cents || 0) - paid);
}

export function PendingAllocationModal({ transaction, open, onClose, onAllocated }: Props) {
  const { user } = useAuth();
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>("balance");
  const [customBalanceCents, setCustomBalanceCents] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [approverName, setApproverName] = useState<string>("");
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const minDay = useMemo(() => { const d = new Date(todayStart); d.setDate(d.getDate() - 3); return d; }, [todayStart]);
  const maxDay = useMemo(() => { const d = new Date(todayStart); d.setDate(d.getDate() + 3); return d; }, [todayStart]);
  const [day, setDay] = useState<Date>(todayStart);

  // Approver name
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setApproverName(data?.full_name || user.email || "Usuario"));
  }, [user]);

  // Fetch unpaid / partially-paid appointments today ±3 days
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId(null);
    setReviewing(false);
    setSplitMode("balance");
    setDay(todayStart);

    const start = new Date(); start.setDate(start.getDate() - 3); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setDate(end.getDate() + 3); end.setHours(23, 59, 59, 999);

    (async () => {
      const { data: apptRows } = await supabase
        .from("appointments")
        .select("id, starts_at, ends_at, client_name, client_phone, service_name, price_cents, amount_paid_cents, tip_cents, payment_method, payment_confirmed, barber_id, client_id, paid")
        .gte("starts_at", start.toISOString())
        .lte("starts_at", end.toISOString())
        .neq("status", "cancelled")
        .gt("price_cents", 0)
        .order("starts_at", { ascending: true });

      // Show every appointment (like the calendar); fully-settled ones are
      // visible for context but can't be selected.
      const visible = apptRows || [];
      const isSettled = (a: (typeof visible)[number]) => {
        const paidCents = a.payment_confirmed ? Math.max(0, (a.amount_paid_cents || 0) - (a.tip_cents || 0)) : 0;
        const balance = Math.max(0, (a.price_cents || 0) - paidCents);
        return !(balance > 0 || !a.paid);
      };

      const barberIds = [...new Set(visible.map((a) => a.barber_id))];
      const { data: barbers } = barberIds.length
        ? await supabase.from("barbers_public").select("id, name, color").in("id", barberIds)
        : { data: [] as { id: string; name: string; color: string | null }[] };
      const barberMap = new Map(barbers?.map((b) => [b.id, b.name]) || []);
      const colorMap = new Map(barbers?.map((b) => [b.id, b.color as string | null]) || []);

      setAppts(
        visible.map((a) => ({
          id: a.id,
          starts_at: a.starts_at,
          client_name: a.client_name,
          client_phone: a.client_phone,
          service_name: a.service_name,
          price_cents: a.price_cents,
          amount_paid_cents: a.amount_paid_cents || 0,
          tip_cents: a.tip_cents || 0,
          payment_method: a.payment_method,
          payment_confirmed: !!a.payment_confirmed,
          barber_id: a.barber_id,
          client_id: a.client_id,
          barber_name: barberMap.get(a.barber_id) || "—",
          barber_color: colorMap.get(a.barber_id) || null,
          ends_at: a.ends_at,
          paid: !!a.paid,
          settled: isSettled(a),
        }))
      );
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const sortByProximity = (list: Appointment[]) =>
      [...list].sort(
        (a, b) =>
          Math.abs(new Date(a.starts_at).getTime() - now) -
          Math.abs(new Date(b.starts_at).getTime() - now)
      );
    if (!search.trim()) return sortByProximity(appts);
    const q = search.toLowerCase();
    return sortByProximity(
      appts.filter(
        (a) =>
          a.client_name.toLowerCase().includes(q) ||
          (a.client_phone || "").includes(q) ||
          a.service_name.toLowerCase().includes(q) ||
          a.barber_name.toLowerCase().includes(q)
      )
    );
  }, [appts, search]);

  const selected = appts.find((a) => a.id === selectedId);
  const balance = selected ? remainingBalance(selected) : 0;
  const txTotal = transaction.total_cents;

  // Default split when entering review step
  useEffect(() => {
    if (!reviewing || !selected) return;
    if (balance === 0) {
      setSplitMode("tip");
      setCustomBalanceCents(0);
    } else if (txTotal <= balance) {
      setSplitMode("balance");
      setCustomBalanceCents(txTotal);
    } else {
      setSplitMode("balance"); // covers balance, surplus auto-tip
      setCustomBalanceCents(balance);
    }
  }, [reviewing, selected, balance, txTotal]);

  // Resolved split based on mode
  const resolvedBalanceCents = useMemo(() => {
    if (!selected) return 0;
    if (splitMode === "balance") return Math.min(txTotal, balance);
    if (splitMode === "tip") return 0;
    return Math.max(0, Math.min(customBalanceCents, txTotal));
  }, [splitMode, customBalanceCents, txTotal, balance, selected]);

  const resolvedTipCents = txTotal - resolvedBalanceCents;
  const willBeFullyPaid = selected
    ? (selected.amount_paid_cents - selected.tip_cents) + resolvedBalanceCents >= selected.price_cents
    : false;
  const newRemainingAfter = selected ? Math.max(0, balance - resolvedBalanceCents) : 0;

  const friendlyError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes("foreign key") && m.includes("client_id"))
      return "El cliente de esta cita no se pudo enlazar. Intenta de nuevo en unos segundos.";
    if (m.includes("foreign key") && m.includes("barber_id"))
      return "El barbero de esta cita no es válido. Refresca y vuelve a intentar.";
    if (m.includes("foreign key") && m.includes("appointment_id"))
      return "Esta cita ya no existe. Refresca la lista.";
    if (m.includes("row-level security") || m.includes("permission"))
      return "No tienes permiso para asignar este pago.";
    return "No se pudo asignar el pago. Intenta de nuevo.";
  };

  const handleConfirmAllocate = async () => {
    if (!selected || !user) return;
    setSubmitting(true);

    const allocatedAt = new Date().toISOString();

    // Re-fetch the appointment fresh to avoid stale client_id/amounts
    // (Acuity sync, client merge, or another tab may have changed the row).
    const { data: fresh, error: freshErr } = await supabase
      .from("appointments")
      .select("id, client_id, barber_id, amount_paid_cents, tip_cents, price_cents, payment_method, payment_confirmed, status, client_name")
      .eq("id", selected.id)
      .maybeSingle();

    if (freshErr || !fresh) {
      toast.error("La cita ya no está disponible. Refresca la lista.");
      setSubmitting(false);
      return;
    }
    if (fresh.status === "cancelled") {
      toast.error("Esta cita fue cancelada.");
      setSubmitting(false);
      return;
    }

    // Validate FK targets exist BEFORE the update — self-heal if missing.
    let safeClientId: string | null = fresh.client_id;
    if (safeClientId) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("id", safeClientId)
        .maybeSingle();
      if (!clientRow) safeClientId = null; // FK is ON DELETE SET NULL — mirror that
    }
    let safeBarberId: string | null = fresh.barber_id;
    if (safeBarberId) {
      const { data: barberRow } = await supabase
        .from("barbers")
        .select("id")
        .eq("id", safeBarberId)
        .maybeSingle();
      if (!barberRow) safeBarberId = null;
    }

    const newAmountPaid = (fresh.amount_paid_cents || 0) + txTotal;
    const newTipTotal = (fresh.tip_cents || 0) + resolvedTipCents;
    const fullyPaidAfter = newAmountPaid - newTipTotal >= (fresh.price_cents || 0);
    const hadPriorPayment = (fresh.amount_paid_cents || 0) > 0 && !!fresh.payment_method;
    const nextPaymentMethod = hadPriorPayment ? fresh.payment_method : transaction.payment_method;
    const healNote = safeClientId === null && fresh.client_id
      ? ` [Cliente original no encontrado en BD — enlace cliente vacío]`
      : "";

    // 1) Update transaction → completed + linked + split
    const { error: txErr } = await supabase
      .from("transactions")
      .update({
        status: "completed",
        appointment_id: fresh.id,
        client_id: safeClientId,
        barber_id: safeBarberId,
        subtotal_cents: resolvedBalanceCents,
        tip_cents: resolvedTipCents,
        allocation_method: "manual",
        approved_by_user_id: user.id,
        approved_by_name: approverName,
        approved_at: allocatedAt,
        notes: `${transaction.notes || ""}\n[Asignado por ${approverName} a ${fresh.client_name} · balance ${fmt(resolvedBalanceCents)}, propina ${fmt(resolvedTipCents)}]${healNote}`.trim(),
      })
      .eq("id", transaction.id);

    if (txErr) {
      console.error("[PendingAllocation] tx update failed:", txErr);
      toast.error(friendlyError(txErr.message));
      setSubmitting(false);
      return;
    }

    // 2) Stack onto appointment (don't overwrite)
    const { error: apptErr } = await supabase
      .from("appointments")
      .update({
        amount_paid_cents: newAmountPaid,
        tip_cents: newTipTotal,
        paid: fullyPaidAfter,
        payment_confirmed: true,
        payment_method: nextPaymentMethod,
      })
      .eq("id", fresh.id);

    if (apptErr) {
      console.error("[PendingAllocation] appt update failed:", apptErr);
      toast.error("Pago asignado pero la cita no se actualizó. " + friendlyError(apptErr.message));
    }

    // 3) Audit log
    void supabase.from("audit_log").insert({
      user_id: user.id,
      action: "pending_transaction_allocated",
      entity_type: "transaction",
      entity_id: transaction.id,
      metadata: {
        appointment_id: selected.id,
        client_name: selected.client_name,
        amount_cents: txTotal,
        appointment_price_cents: selected.price_cents,
        prior_amount_paid_cents: selected.amount_paid_cents,
        prior_tip_cents: selected.tip_cents,
        split_balance_cents: resolvedBalanceCents,
        split_tip_cents: resolvedTipCents,
        new_amount_paid_cents: newAmountPaid,
        new_tip_cents: newTipTotal,
        fully_paid_after: fullyPaidAfter,
        payment_method: transaction.payment_method,
        kept_prior_payment_method: hadPriorPayment,
        approved_by_name: approverName,
        client_id_healed: safeClientId === null && !!fresh.client_id,
      },
    });

    setSubmitting(false);
    const remainingAfter = Math.max(0, (fresh.price_cents || 0) - (newAmountPaid - newTipTotal));
    toast.success(
      fullyPaidAfter
        ? `Cita pagada · ${fresh.client_name}`
        : `Asignado ${fmt(txTotal)} · resta ${fmt(remainingAfter)}`
    );
    onAllocated();
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
        style={{ background: "rgba(0,0,0,0.6)" }}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 280 }}
          className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col"
          style={{
            background: "var(--bg-base)",
            height: "92vh", maxHeight: "92vh",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: "1px solid var(--divider)" }}>
            <div>
              <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                Asignar pago
              </h2>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {fmt(txTotal)} · {transaction.payment_method === "ath_movil" ? "ATH Móvil" : transaction.payment_method}
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full" style={{ background: "var(--bg-surface-2)" }}>
              <X size={16} style={{ color: "var(--text-primary)" }} />
            </button>
          </div>

          {!reviewing ? (
            <>
              {/* Search */}
              <div className="px-4 pt-3 pb-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar cliente, servicio, barbero..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm outline-none rounded-xl"
                    style={{
                      background: "var(--bg-surface-2)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--divider)",
                    }}
                  />
                </div>
                <p className="text-[10px] mt-2" style={{ color: "var(--text-tertiary)" }}>
                  Toca la cita que recibe el pago · $ verde = pagada · $ naranja = parcial · borde verde = monto exacto
                </p>
              </div>

              {/* Calendar preview */}
              {loading ? (
                <div className="flex-1 flex justify-center py-12">
                  <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
                </div>
              ) : (
                <AllocationDayCalendar
                  appts={appts}
                  day={day}
                  minDay={minDay}
                  maxDay={maxDay}
                  onDayChange={setDay}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  search={search}
                  txTotal={txTotal}
                  balanceOf={(a) => remainingBalance(a as unknown as Appointment)}
                />
              )}

              {/* Footer CTA */}
              <div className="px-4 pt-2 pb-3" style={{ borderTop: "1px solid var(--divider)" }}>
                <button
                  disabled={!selectedId}
                  onClick={() => selectedId && setReviewing(true)}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-opacity"
                  style={{
                    background: "var(--accent-color)",
                    color: "var(--cta-fg)",
                    opacity: selectedId ? 1 : 0.4,
                  }}
                >
                  {selectedId ? "Revisar y asignar" : "Selecciona una cita"}
                </button>
              </div>
            </>
          ) : (
            /* Review + split step */
            <div className="flex-1 flex flex-col px-4 py-4 gap-3 overflow-y-auto">
              {/* Context */}
              <div className="rounded-2xl p-3 space-y-1.5" style={{ background: "var(--bg-surface-2)" }}>
                <Row label="Cliente" value={selected!.client_name} bold />
                <Row label="Servicio" value={selected!.service_name} />
                <Row label="Precio cita" value={fmt(selected!.price_cents)} />
                {selected!.amount_paid_cents > 0 && (
                  <Row label="Ya pagado" value={fmt(selected!.amount_paid_cents - selected!.tip_cents)} accent="var(--text-secondary)" />
                )}
                <Row label="Balance pendiente" value={fmt(balance)} accent={balance === 0 ? "#22c55e" : "#eab308"} bold />
                <Row label="Pago entrante" value={fmt(txTotal)} bold />
              </div>

              {/* Split mode picker */}
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                  ¿Cómo se asigna este pago?
                </p>
                <SplitOption
                  active={splitMode === "balance"}
                  onClick={() => setSplitMode("balance")}
                  disabled={balance === 0}
                  title={txTotal <= balance ? "Cubrir balance" : "Cubrir balance + propina"}
                  desc={
                    txTotal <= balance
                      ? `${fmt(txTotal)} al balance · resta ${fmt(balance - txTotal)}`
                      : `${fmt(balance)} al balance · ${fmt(txTotal - balance)} propina`
                  }
                />
                <SplitOption
                  active={splitMode === "tip"}
                  onClick={() => setSplitMode("tip")}
                  title="Todo como propina"
                  desc={`${fmt(txTotal)} a propina · balance no cambia`}
                />
                <SplitOption
                  active={splitMode === "custom"}
                  onClick={() => {
                    setSplitMode("custom");
                    setCustomBalanceCents(Math.min(txTotal, balance));
                  }}
                  title="Personalizado"
                  desc="Define cuánto va al balance vs. propina"
                />

                {splitMode === "custom" && (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: "var(--bg-surface-2)" }}>
                    <label className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      Al balance (máx {fmt(Math.min(txTotal, balance))})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={Math.min(txTotal, balance) / 100}
                      value={(customBalanceCents / 100).toFixed(2)}
                      onChange={(e) => {
                        const dollars = parseFloat(e.target.value || "0");
                        const cents = Math.round(dollars * 100);
                        setCustomBalanceCents(Math.max(0, Math.min(cents, Math.min(txTotal, balance))));
                      }}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: "var(--bg-base)", color: "var(--text-primary)", border: "1px solid var(--divider)" }}
                    />
                    <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      Propina: {fmt(txTotal - customBalanceCents)}
                    </p>
                  </div>
                )}
              </div>

              {/* Outcome preview */}
              <div
                className="rounded-2xl p-3 flex items-start gap-2.5"
                style={{ background: willBeFullyPaid ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)" }}
              >
                {willBeFullyPaid ? (
                  <CheckCircle2 size={18} style={{ color: "#22c55e" }} className="flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={18} style={{ color: "#eab308" }} className="flex-shrink-0 mt-0.5" />
                )}
                <div className="text-xs" style={{ color: "var(--text-primary)" }}>
                  {willBeFullyPaid
                    ? `La cita quedará pagada en su totalidad${resolvedTipCents > 0 ? ` con propina de ${fmt(resolvedTipCents)}` : ""}.`
                    : `Quedará un balance pendiente de ${fmt(newRemainingAfter)}.`}
                </div>
              </div>

              <div className="flex gap-2 mt-auto pt-2">
                <button
                  onClick={() => setReviewing(false)}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
                >
                  Atrás
                </button>
                <button
                  onClick={handleConfirmAllocate}
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: "var(--accent-color)", color: "var(--cta-fg)", opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting && <Loader2 size={14} className="animate-spin" />}
                  {submitting ? "Asignando..." : "Confirmar"}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function SplitOption({
  active,
  onClick,
  disabled,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left rounded-xl px-3 py-2.5 transition-colors"
      style={{
        background: active ? "var(--accent-color)" : "var(--bg-surface-2)",
        color: active ? "var(--cta-fg)" : "var(--text-primary)",
        opacity: disabled ? 0.4 : 1,
        border: `1px solid ${active ? "var(--accent-color)" : "var(--divider)"}`,
      }}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div
        className="text-[11px] mt-0.5"
        style={{ color: active ? "var(--cta-fg)" : "var(--text-secondary)", opacity: active ? 0.85 : 1 }}
      >
        {desc}
      </div>
    </button>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span
        className={bold ? "text-sm font-bold" : "text-sm font-medium"}
        style={{ color: accent || "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}
