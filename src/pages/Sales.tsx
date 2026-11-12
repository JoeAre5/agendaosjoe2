import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import {
  Search, ShoppingBag, CreditCard, Banknote, Smartphone,
  User, Package, Trash2, Scissors, ChevronRight, Check, Clock, X,
  AlertCircle, CheckCircle, SlidersHorizontal, Link2, ShieldCheck, Undo2,
  AlertTriangle,
} from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { toast } from "sonner";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { es } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import { PendingAllocationModal } from "@/components/sales/PendingAllocationModal";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";

interface Transaction {
  id: string;
  barber_id: string;
  barber_name: string;
  type: string;
  payment_method: string;
  subtotal_cents: number;
  tip_cents: number;
  total_cents: number;
  status: string;
  created_at: string;
  appointment_id: string | null;
  client_id: string | null;
  client_name: string | null;
  items: { name: string; quantity: number; total_cents: number; item_type?: string }[];
  appointment_service?: string | null;
  appointment_barber?: string | null;
  appointment_starts_at?: string | null;
  appointment_status?: string | null;
  appointment_refund_status?: string | null;
  notes?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  allocation_method?: string | null;
  refunded_at?: string | null;
  refund_amount_cents?: number | null;
  appointment_dup_dismissed_at?: string | null;
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  stripe: "Tarjeta",
  paypal: "PayPal",
  ath_movil: "ATH Móvil",
};

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  completed: { bg: "rgba(34,197,94,0.15)", text: "#22c55e", icon: Check },
  pending: { bg: "rgba(234,179,8,0.15)", text: "#eab308", icon: Clock },
  pending_review: { bg: "rgba(251,146,60,0.15)", text: "#fb923c", icon: AlertCircle },
  failed: { bg: "rgba(239,68,68,0.15)", text: "#ef4444", icon: X },
};

type DateRange = "today" | "week" | "month" | "all" | "year" | "cancelled";
type TypeFilter = "all" | "products" | "services";

type FilterTab = { id: string; label: string; group: "date" | "type" | "status" };

const FILTER_TABS: FilterTab[] = [
  { id: "today", label: "Hoy", group: "date" },
  { id: "week", label: "Semana", group: "date" },
  { id: "month", label: "Mes", group: "date" },
  { id: "services", label: "Servicios", group: "type" },
  { id: "products", label: "Productos", group: "type" },
  { id: "pendientes", label: "Pendientes", group: "status" },
];

const EXTRA_DATE_FILTERS: { id: DateRange; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "year", label: "Año" },
  { id: "cancelled", label: "Cancelados" },
];

export default function Sales() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isOwner, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [myBarberId, setMyBarberId] = useState<string | null>(null);

  // Fetch barber_id for non-owner staff
  useEffect(() => {
    if (!isOwner && user) {
      supabase.from("profiles").select("barber_id").eq("id", user.id).maybeSingle()
        .then(({ data }) => setMyBarberId(data?.barber_id || null));
    }
  }, [isOwner, user]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmRefund, setConfirmRefund] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(
    searchParams.get("status") === "pending_review" ? "pending_review" : null
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [duplicatesCount, setDuplicatesCount] = useState(0);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [allocateTx, setAllocateTx] = useState<Transaction | null>(null);
  const isExtraDateActive = dateRange === "all" || dateRange === "year" || dateRange === "cancelled";
  const isDuplicatesActive = statusFilter === "duplicates";
  const hasDuplicatesAlert = duplicatesCount > 0;

  // Clear ?status=pending_review from URL after applying it
  useEffect(() => {
    if (searchParams.get("status")) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch pending count + duplicates count on mount + subscribe to realtime changes.
  // Duplicate = appointment with 2+ completed `service` transactions.
  useEffect(() => {
    const refresh = async () => {
      const { count } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_review");
      setPendingCount(count || 0);

      const { data: serviceTxs } = await supabase
        .from("transactions")
        .select("appointment_id")
        .eq("status", "completed")
        .eq("type", "service")
        .not("appointment_id", "is", null)
        .limit(2000);
      const counts = new Map<string, number>();
      (serviceTxs || []).forEach((t: any) => {
        if (!t.appointment_id) return;
        counts.set(t.appointment_id, (counts.get(t.appointment_id) || 0) + 1);
      });
      const candidateIds = Array.from(counts.keys()).filter((id) => (counts.get(id) || 0) >= 2);
      let dismissed = new Set<string>();
      if (candidateIds.length) {
        const { data: dismissedRows } = await supabase
          .from("appointments")
          .select("id")
          .in("id", candidateIds)
          .not("duplicate_dismissed_at", "is", null);
        dismissed = new Set((dismissedRows || []).map((r: any) => r.id));
      }
      let dupRows = 0;
      counts.forEach((n, id) => { if (n >= 2 && !dismissed.has(id)) dupRows += n; });
      setDuplicatesCount(dupRows);
    };
    refresh();

    const channel = supabase
      .channel("sales-pending-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleAllocateClick = (tx: Transaction) => {
    setAllocateTx(tx);
  };

  const handleAllocated = () => {
    // Remove from view (it's no longer pending_review) — refresh will pick up the new completed state
    setAllocateTx(null);
    setExpandedId(null);
    setTransactions((prev) => prev.filter((t) => t.id !== allocateTx?.id));
    setPendingCount((c) => Math.max(0, c - 1));
  };

  const handleDelete = async (txId: string) => {
    setDeleting(true);
    const { error } = await supabase.from("transactions").delete().eq("id", txId);
    setDeleting(false);
    if (error) {
      toast.error("Error al eliminar: " + error.message);
    } else {
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
      setExpandedId(null);
      toast.success("Transacción eliminada");
    }
    setConfirmDelete(null);
  };

  // Revert a completed transaction back to pending_review.
  // Calls edge function (service role) so the linked appointment is unpaid atomically
  // and the row becomes visible in the "Pendientes" filter for re-allocation.
  const handleRevert = async (txId: string) => {
    setReverting(true);
    const { data, error } = await supabase.functions.invoke("transaction-revert-to-pending", {
      body: { transaction_id: txId },
    });
    setReverting(false);
    setConfirmRevert(null);
    if (error || (data as { error?: string })?.error) {
      const msg = (data as { error?: string })?.error || error?.message || "Error desconocido";
      toast.error("No se pudo revertir: " + msg);
      return;
    }
    // Update local state: flip to pending_review, drop appointment link
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === txId
          ? {
              ...t,
              status: "pending_review",
              appointment_id: null,
              client_id: null,
              client_name: null,
              appointment_service: null,
              appointment_barber: null,
              appointment_starts_at: null,
              approved_by_name: null,
              approved_at: null,
              allocation_method: null,
            }
          : t,
      ),
    );
    setExpandedId(null);
    setPendingCount((c) => c + 1);
    toast.success("Pago revertido a pendiente. Disponible para reasignar.");
  };

  // Manually mark a paid+cancelled transaction as refunded (refunds happen by hand outside the app).
  const handleMarkRefunded = async (tx: Transaction) => {
    setMarking(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from("transactions")
      .update({ refunded_at: nowIso, refund_amount_cents: tx.total_cents })
      .eq("id", tx.id);
    if (!error && tx.appointment_id) {
      await supabase.from("appointments").update({ refund_status: "refunded" }).eq("id", tx.appointment_id);
    }
    setMarking(false);
    setConfirmRefund(null);
    if (error) {
      toast.error("No se pudo marcar: " + error.message);
      return;
    }
    setTransactions((prev) =>
      prev.map((t) => (t.id === tx.id ? { ...t, refunded_at: nowIso, refund_amount_cents: tx.total_cents, appointment_refund_status: "refunded" } : t))
    );
    toast.success("Marcado como reembolsado");
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const now = new Date();
      let query = supabase
        .from("transactions")
        .select("id, barber_id, type, payment_method, subtotal_cents, tip_cents, total_cents, status, created_at, appointment_id, client_id, notes, approved_by_name, approved_at, allocation_method, refunded_at, refund_amount_cents")
        .order("created_at", { ascending: false });

      // Barbers only see their own transactions — EXCEPT pending_review/duplicates (whole shop sees those)
      if (!isOwner && myBarberId && statusFilter !== "pending_review" && statusFilter !== "duplicates") {
        query = query.eq("barber_id", myBarberId);
      }

      if (statusFilter === "pending_review") {
        query = query.eq("status", "pending_review");
      } else if (statusFilter === "duplicates") {
        // Pull all completed service tx (last 90 days) — duplicates flag computed client-side
        const since = new Date(); since.setDate(since.getDate() - 90);
        query = query.eq("status", "completed").eq("type", "service").gte("created_at", since.toISOString()).not("appointment_id", "is", null);
      } else if (dateRange === "cancelled") {
        // Filter to transactions linked to cancelled appointments (manual-refund evidence)
        const { data: cancelledAppts } = await supabase
          .from("appointments")
          .select("id")
          .eq("status", "cancelled")
          .gt("amount_paid_cents", 0)
          .limit(500);
        const ids = (cancelledAppts || []).map((a) => a.id);
        if (ids.length === 0) {
          setTransactions([]); setLoading(false); return;
        }
        query = query.in("appointment_id", ids);
      } else {
        if (dateRange === "today") {
          query = query.gte("created_at", startOfDay(now).toISOString()).lte("created_at", endOfDay(now).toISOString());
        } else if (dateRange === "week") {
          query = query.gte("created_at", startOfWeek(now, { weekStartsOn: 1 }).toISOString()).lte("created_at", endOfWeek(now, { weekStartsOn: 1 }).toISOString());
        } else if (dateRange === "month") {
          query = query.gte("created_at", startOfMonth(now).toISOString()).lte("created_at", endOfMonth(now).toISOString());
        } else if (dateRange === "year") {
          query = query.gte("created_at", startOfYear(now).toISOString()).lte("created_at", endOfYear(now).toISOString());
        }
        // dateRange === "all" → no date filter
      }

      query = query.limit(300);
      const { data: txData, error } = await query;
      if (error || !txData) { setLoading(false); return; }

      const barberIds = [...new Set(txData.map((t) => t.barber_id))];
      const { data: barbers } = barberIds.length
        ? await supabase.from("barbers_public").select("id, name").in("id", barberIds)
        : { data: [] as { id: string; name: string }[] };
      const barberMap = new Map<string, string>(barbers?.map((b) => [b.id, b.name] as [string, string]) || []);

      const clientIds = [...new Set(txData.filter((t) => t.client_id).map((t) => t.client_id!))];
      let clientMap = new Map<string, string>();
      if (clientIds.length) {
        const { data: clients } = await supabase.from("clients").select("id, first_name, last_name").in("id", clientIds);
        clients?.forEach((c) => { clientMap.set(c.id, `${c.first_name}${c.last_name ? ` ${c.last_name}` : ""}`); });
      }

      const txIds = txData.map((t) => t.id);
      let itemMap = new Map<string, { name: string; quantity: number; total_cents: number; item_type?: string }[]>();
      if (txIds.length) {
        const { data: items } = await supabase.from("transaction_items").select("transaction_id, name, quantity, total_cents, item_type").in("transaction_id", txIds);
        items?.forEach((item) => {
          if (!itemMap.has(item.transaction_id)) itemMap.set(item.transaction_id, []);
          itemMap.get(item.transaction_id)!.push(item);
        });
      }

      const apptIds = [...new Set(txData.filter((t) => t.appointment_id).map((t) => t.appointment_id!))];
      let apptMap = new Map<string, { service_name: string; barber_name: string; starts_at: string; status: string; refund_status: string | null; duplicate_dismissed_at: string | null }>();
      if (apptIds.length) {
        const { data: appts } = await supabase.from("appointments").select("id, service_name, barber_id, starts_at, status, refund_status, duplicate_dismissed_at").in("id", apptIds);
        appts?.forEach((a: any) => {
          apptMap.set(a.id, { service_name: a.service_name, barber_name: barberMap.get(a.barber_id) || "Desconocido", starts_at: a.starts_at, status: a.status, refund_status: a.refund_status, duplicate_dismissed_at: a.duplicate_dismissed_at });
        });
      }

      setTransactions(
        txData.map((tx) => {
          const apptInfo = tx.appointment_id ? apptMap.get(tx.appointment_id) : null;
          return {
            ...tx,
            barber_name: barberMap.get(tx.barber_id) || "Desconocido",
            client_name: tx.client_id ? clientMap.get(tx.client_id) || null : null,
            items: itemMap.get(tx.id) || [],
            appointment_service: apptInfo?.service_name || null,
            appointment_barber: apptInfo?.barber_name || null,
            appointment_starts_at: apptInfo?.starts_at || null,
            appointment_status: apptInfo?.status || null,
            appointment_refund_status: apptInfo?.refund_status || null,
            appointment_dup_dismissed_at: apptInfo?.duplicate_dismissed_at || null,
          } as Transaction;
        })
      );
      setLoading(false);
    })();
  }, [dateRange, statusFilter, isOwner, myBarberId]);

  // Build set of appointment_ids that have 2+ completed service tx AND are not dismissed.
  const duplicateApptIds = useMemo(() => {
    const counts = new Map<string, number>();
    const dismissedMap = new Map<string, boolean>();
    transactions.forEach((t) => {
      if (t.status === "completed" && t.type === "service" && t.appointment_id) {
        counts.set(t.appointment_id, (counts.get(t.appointment_id) || 0) + 1);
        if (t.appointment_dup_dismissed_at) dismissedMap.set(t.appointment_id, true);
      }
    });
    const set = new Set<string>();
    counts.forEach((n, id) => { if (n >= 2 && !dismissedMap.get(id)) set.add(id); });
    return set;
  }, [transactions]);

  const filtered = useMemo(() => {
    let result = transactions;

    if (statusFilter === "duplicates") {
      result = result.filter((t) => t.appointment_id && duplicateApptIds.has(t.appointment_id) && t.status === "completed" && t.type === "service");
    }

    // Type filter: products = only product type; services = service, mixed, or has service items
    if (typeFilter === "products") {
      result = result.filter((t) => t.type === "product" && !t.items.some((i) => i.item_type === "service"));
    } else if (typeFilter === "services") {
      result = result.filter((t) => t.type === "service" || t.type === "mixed" || t.items.some((i) => i.item_type === "service"));
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.barber_name.toLowerCase().includes(q) ||
          (t.client_name && t.client_name.toLowerCase().includes(q)) ||
          t.items.some((i) => i.name.toLowerCase().includes(q)) ||
          t.payment_method.toLowerCase().includes(q)
      );
    }
    return result;
  }, [transactions, search, typeFilter, statusFilter, duplicateApptIds]);

  const totals = useMemo(() => {
    // When viewing Pendientes, sum the pending rows; otherwise sum completed only.
    const relevant = statusFilter === "pending_review"
      ? filtered.filter((t) => t.status === "pending_review")
      : filtered.filter((t) => t.status === "completed");
    return { count: relevant.length, amount: relevant.reduce((s, t) => s + t.total_cents, 0) };
  }, [filtered, statusFilter]);

  // Build a description string for each transaction (like Stripe's format)
  const buildDescription = (tx: Transaction) => {
    if (tx.client_name && tx.appointment_service) return `${tx.client_name} - ${tx.appointment_service}`;
    if (tx.appointment_service) return tx.appointment_service;
    if (tx.items.length === 1) return tx.items[0].name;
    if (tx.items.length > 1) return `${tx.items[0].name} +${tx.items.length - 1}`;
    return tx.type === "service" ? "Servicio" : tx.type === "product" ? "Producto" : "Venta";
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <SubpageHeader
        title="Ventas"
        sticky
        onBack={() => navigate("/admin?tab=menu")}
        actions={!loading && totals.count > 0 ? (
          <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
            {fmt(totals.amount)}
          </span>
        ) : null}
      />

      {/* Search + filter icon */}
      <div className="px-4 mb-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por barbero, cliente, producto..."
            className="w-full pl-10 pr-12 py-3.5 text-sm outline-none rounded-2xl"
            style={{
              background: "transparent",
              color: "var(--text-primary)",
              border: `1px solid var(--input-hint)`,
            }}
          />
          {/* Filter icon */}
          <button
            onClick={() => setFilterMenuOpen((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg"
            style={{ color: isExtraDateActive || isDuplicatesActive ? "var(--accent-color)" : hasDuplicatesAlert ? "#ef4444" : "var(--text-tertiary)" }}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
        {/* Dropdown */}
        <AnimatePresence>
          {filterMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="flex flex-wrap gap-2 mt-2 justify-end"
            >
              {EXTRA_DATE_FILTERS.map((f) => {
                const active = dateRange === f.id && !statusFilter;
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      setDateRange(f.id);
                      setTypeFilter("all");
                      setStatusFilter(null);
                      setFilterMenuOpen(false);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
                    style={{
                      background: active ? "var(--accent-color)" : "var(--bg-surface-2)",
                      color: active ? "var(--cta-fg)" : "var(--text-secondary)",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
              {/* Duplicados filter — red when alert active */}
              <button
                onClick={() => {
                  setStatusFilter(isDuplicatesActive ? null : "duplicates");
                  setTypeFilter("all");
                  setFilterMenuOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
                style={{
                  background: isDuplicatesActive ? "#ef4444" : hasDuplicatesAlert ? "rgba(239,68,68,0.12)" : "var(--bg-surface-2)",
                  color: isDuplicatesActive ? "#fff" : hasDuplicatesAlert ? "#ef4444" : "var(--text-secondary)",
                  border: hasDuplicatesAlert && !isDuplicatesActive ? "1px solid rgba(239,68,68,0.4)" : undefined,
                }}
              >
                {hasDuplicatesAlert && <AlertTriangle size={12} />}
                {t("duplicates.filterLabel")}{hasDuplicatesAlert ? ` (${duplicatesCount})` : ""}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pill nav bar — unified SegmentedTabs */}
      {(() => {
        const activeId = statusFilter === "pending_review"
          ? "pendientes"
          : typeFilter !== "all"
          ? typeFilter
          : dateRange;
        return (
          <div className="flex justify-center px-4 mb-3">
            <SegmentedTabs
              layoutId="sales-filter-pill"
              fitContent
              labelClassName="text-[11px] font-semibold whitespace-nowrap tracking-tight"
              value={activeId}
              onChange={(id) => {
                const tab = FILTER_TABS.find((t) => t.id === id);
                if (!tab) return;
                if (tab.group === "status") {
                  setStatusFilter("pending_review");
                  setTypeFilter("all");
                } else if (tab.group === "date") {
                  setDateRange(id as DateRange);
                  setTypeFilter("all");
                  setStatusFilter(null);
                } else {
                  setTypeFilter(id as TypeFilter);
                  setStatusFilter(null);
                }
              }}
              tabs={FILTER_TABS.map(({ id, label }) => {
                const alert = id === "pendientes" && pendingCount > 0;
                return {
                  id,
                  label: alert ? (
                    <span style={{ color: "#ef4444" }}>{label}</span>
                  ) : label,
                  activeColor: alert ? "#ef4444" : undefined,
                };
              })}
            />
          </div>
        );
      })()}

      <div className="pb-24">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--divider)", borderTopColor: "var(--accent-color)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <ShoppingBag size={48} style={{ color: "var(--text-tertiary)" }} />
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No hay ventas</p>
          </div>
        ) : (
          filtered.map((tx) => {
            const isExpanded = expandedId === tx.id;
            const isRefunded = !!tx.refunded_at;
            const isCancelledAppt = tx.appointment_status === "cancelled";
            const needsManualRefund = isCancelledAppt && !isRefunded && tx.status === "completed";
            const baseStatusInfo = STATUS_COLORS[tx.status] || STATUS_COLORS.pending;
            const statusInfo = isRefunded
              ? { bg: "rgba(148,163,184,0.18)", text: "#94a3b8", icon: Undo2 }
              : needsManualRefund
              ? { bg: "rgba(239,68,68,0.15)", text: "#ef4444", icon: AlertCircle }
              : baseStatusInfo;
            const StatusIcon = statusInfo.icon;
            const hasService = tx.type === "service" || tx.type === "mixed" || tx.items.some((i) => i.item_type === "service");
            const hasProduct = tx.type === "product" || tx.type === "mixed" || tx.items.some((i) => i.item_type === "product");
            const description = buildDescription(tx);
            const isDuplicate = !!tx.appointment_id && duplicateApptIds.has(tx.appointment_id) && tx.status === "completed" && tx.type === "service";
            const statusLabel = isRefunded
              ? "refunded"
              : needsManualRefund
              ? "refund needed"
              : tx.status === "completed" ? "succeeded" : tx.status;

            return (
              <div key={tx.id}>
                {/* Row — Stripe-inspired full-width */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:opacity-70"
                  style={{
                    borderBottom: "1px solid var(--divider)",
                    opacity: isRefunded ? 0.6 : 1,
                    background: isDuplicate ? "rgba(239,68,68,0.06)" : undefined,
                  }}
                >
                  {/* Status icon */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: isDuplicate ? "rgba(239,68,68,0.18)" : statusInfo.bg }}
                  >
                    {isDuplicate ? (
                      <AlertTriangle size={16} style={{ color: "#ef4444" }} strokeWidth={2.5} />
                    ) : (
                      <StatusIcon size={16} style={{ color: statusInfo.text }} strokeWidth={2.5} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold" style={{ color: "var(--text-primary)", textDecoration: isRefunded ? "line-through" : "none" }}>
                        {fmt(tx.total_cents)} <span className="font-normal" style={{ color: statusInfo.text, textDecoration: "none" }}>{statusLabel}</span></span>
                      {tx.type === "refund" && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0" style={{ background: "#ef4444", color: "#fff" }}>
                          REFUND
                        </span>
                      )}
                      {isDuplicate && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0" style={{ background: "#ef4444", color: "#fff" }}>
                          {t("duplicates.rowBadge")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {/* Type icons */}
                      {hasService && <Scissors size={11} style={{ color: "var(--text-tertiary)" }} />}
                      {hasProduct && <Package size={11} style={{ color: "var(--text-tertiary)" }} />}
                      <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                        {description}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {tx.client_name || tx.barber_name}
                      </span>
                    </div>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {format(new Date(tx.created_at), "MMM d", { locale: es })} at {format(new Date(tx.created_at), "h:mm a")}
                    </span>
                  </div>

                  <ChevronRight
                    size={16}
                    style={{
                      color: "var(--text-tertiary)",
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      transition: "transform 0.2s",
                    }}
                  />
                </button>

                {/* Expanded receipt */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                      style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)" }}
                    >
                      <div className="px-4 py-4 space-y-3">
                        {isDuplicate && (
                          <div className="p-3 rounded-xl flex items-start gap-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                            <AlertTriangle size={16} style={{ color: "#ef4444" }} className="flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold leading-tight" style={{ color: "#ef4444" }}>
                                {t("duplicates.rowBannerTitle")}
                              </p>
                              <p className="text-[11px] leading-snug mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                {t("duplicates.rowBannerBody")}
                              </p>
                              {tx.appointment_id && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/admin/appointment/${tx.appointment_id}`); }}
                                  className="text-[11px] font-bold mt-1.5 flex items-center gap-1"
                                  style={{ color: "#ef4444" }}
                                >
                                  {t("duplicates.rowBannerCta")} <ChevronRight size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Key-value rows — Stripe detail style */}
                        <DetailRow icon={<User size={14} />} label="Barbero" value={tx.barber_name} />
                        {tx.client_name && <DetailRow icon={<User size={14} />} label="Cliente" value={tx.client_name} />}
                        <DetailRow
                          icon={tx.payment_method === "cash" ? <Banknote size={14} /> : tx.payment_method === "ath_movil" ? <Smartphone size={14} /> : <CreditCard size={14} />}
                          label="Método"
                          value={METHOD_LABELS[tx.payment_method] || tx.payment_method}
                        />

                        {/* Linked appointment */}
                        {tx.appointment_service && (
                          <div className="p-3 rounded-xl" style={{ background: "var(--bg-surface-2)" }}>
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>
                              Servicio de cita
                            </p>
                            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                              {tx.appointment_service}
                            </p>
                            {tx.appointment_starts_at && (
                              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                                {format(new Date(tx.appointment_starts_at), "EEEE d MMM · h:mm a", { locale: es })}
                              </p>
                            )}
                            {tx.appointment_id && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/admin/appointment/${tx.appointment_id}`); }}
                                className="text-xs font-semibold mt-1.5 flex items-center gap-1"
                                style={{ color: "var(--accent-color)" }}
                              >
                                Ver cita <ChevronRight size={12} />
                              </button>
                            )}
                          </div>
                        )}

                        {/* Items */}
                        {tx.items.length > 0 && (
                          <div style={{ borderTop: "1px solid var(--divider)" }} className="pt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-tertiary)" }}>
                              Detalle
                            </p>
                            <div className="space-y-1.5">
                              {tx.items.map((item, i) => (
                                <div key={i} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {item.item_type === "service" ? (
                                      <Scissors size={12} style={{ color: "#a855f7" }} />
                                    ) : (
                                      <Package size={12} style={{ color: "#3b82f6" }} />
                                    )}
                                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                                      {item.quantity > 1 ? `${item.quantity}× ` : ""}{item.name}
                                    </span>
                                  </div>
                                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                                    {fmt(item.total_cents)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Totals */}
                        <div style={{ borderTop: "1px solid var(--divider)" }} className="pt-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Subtotal</span>
                            <span className="text-xs" style={{ color: "var(--text-primary)" }}>{fmt(tx.subtotal_cents)}</span>
                          </div>
                          {tx.tip_cents > 0 && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Propina</span>
                              <span className="text-xs" style={{ color: "var(--text-primary)" }}>{fmt(tx.tip_cents)}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Total</span>
                            <span className="text-sm font-black" style={{ color: statusInfo.text }}>
                              {fmt(tx.total_cents)}
                            </span>
                          </div>
                        </div>

                        {/* Approval log (who/when/how) */}
                        {tx.approved_by_name && tx.status === "completed" && (
                          <div style={{ borderTop: "1px solid var(--divider)" }} className="pt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
                              <ShieldCheck size={11} /> Aprobado por
                            </p>
                            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                              {tx.approved_by_name}
                              {tx.approved_at && ` · ${format(new Date(tx.approved_at), "d MMM, h:mm a", { locale: es })}`}
                              {tx.allocation_method && tx.allocation_method !== "manual" && ` · ${tx.allocation_method === "auto_note" ? "auto-nota" : "auto-identidad"}`}
                            </p>
                          </div>
                        )}

                        {/* Notes */}
                        {tx.notes && (
                          <div style={{ borderTop: "1px solid var(--divider)" }} className="pt-3">
                            <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-tertiary)" }}>Notas</p>
                            <p className="text-xs whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>{tx.notes}</p>
                          </div>
                        )}

                        {/* Refund-needed banner + manual mark (owner, paid + cancelled appointment) */}
                        {isOwner && needsManualRefund && (
                          <div className="p-3 rounded-xl space-y-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                            <p className="text-[11px] font-semibold leading-tight" style={{ color: "#ef4444" }}>
                              Cita cancelada · reembolso manual pendiente ({METHOD_LABELS[tx.payment_method] || tx.payment_method})
                            </p>
                            {confirmRefund === tx.id ? (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>¿Confirmas que ya reembolsaste {fmt(tx.total_cents)}?</span>
                                <div className="flex gap-2 flex-shrink-0">
                                  <button onClick={() => setConfirmRefund(null)}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold"
                                    style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
                                    No
                                  </button>
                                  <button onClick={() => handleMarkRefunded(tx)} disabled={marking}
                                    className="px-3 py-1 rounded-lg text-xs font-semibold"
                                    style={{ background: "#ef4444", color: "#fff", opacity: marking ? 0.6 : 1 }}>
                                    {marking ? "..." : "Sí"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setConfirmRefund(tx.id)}
                                className="w-full py-2 rounded-lg text-xs font-semibold"
                                style={{ background: "#ef4444", color: "#fff" }}>
                                Marcar como reembolsado
                              </button>
                            )}
                          </div>
                        )}

                        {/* Already refunded — receipt-style note */}
                        {isRefunded && (
                          <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: "rgba(148,163,184,0.1)" }}>
                            <Undo2 size={14} style={{ color: "#94a3b8" }} />
                            <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                              Reembolsado manualmente · {format(new Date(tx.refunded_at!), "d MMM, h:mm a", { locale: es })}
                            </span>
                          </div>
                        )}

                        {/* REFUND / DISPUTE alert row — pending_review of type='refund' */}
                        {tx.status === "pending_review" && tx.type === "refund" && (() => {
                          const phoneMatch = tx.notes?.match(/tel:\s*([+\d\-\(\)\s]+)/i);
                          const emailMatch = tx.notes?.match(/email:\s*([\w.+-]+@[\w.-]+\.\w+)/i);
                          const phone = phoneMatch?.[1]?.trim() || null;
                          const email = emailMatch?.[1]?.trim() || null;
                          const phoneDigits = phone ? phone.replace(/\D+/g, "") : "";
                          const waNumber = phoneDigits ? (phoneDigits.startsWith("1") ? phoneDigits : "1" + phoneDigits) : "";
                          return (
                            <div className="p-3 rounded-xl space-y-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
                              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#ef4444" }}>
                                ⚠️ REEMBOLSO solicitado · contactar antes de que se complete
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {phone && (
                                  <a href={`tel:${phone}`} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                                     style={{ background: "#ef4444", color: "#fff" }}>
                                    Llamar
                                  </a>
                                )}
                                {waNumber && (
                                  <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener"
                                     className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                                     style={{ background: "#22c55e", color: "#fff" }}>
                                    WhatsApp
                                  </a>
                                )}
                                {email && (
                                  <a href={`mailto:${email}`} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                                     style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}>
                                    Email
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Allocate to appointment — pending_review (owner + barbers), only for non-refund rows */}
                        {tx.status === "pending_review" && tx.type !== "refund" && (
                          <button
                            onClick={() => handleAllocateClick(tx)}
                            className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                            style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}
                          >
                            <Link2 size={14} />
                            Asignar a cita
                          </button>
                        )}

                        {/* Revert to pending — owner only, completed transactions */}
                        {isOwner && tx.status === "completed" && tx.type !== "product_sale" && (
                          confirmRevert === tx.id ? (
                            <div className="flex items-center justify-between p-3 rounded-xl gap-2" style={{ background: "rgba(234,179,8,0.1)" }}>
                              <span className="text-[11px] font-medium leading-tight" style={{ color: "#a16207" }}>
                                ¿Revertir? La cita quedará sin pagar y el pago volverá a Pendientes.
                              </span>
                              <div className="flex gap-2 flex-shrink-0">
                                <button onClick={() => setConfirmRevert(null)}
                                  className="px-3 py-1 rounded-lg text-xs font-semibold"
                                  style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
                                  No
                                </button>
                                <button onClick={() => handleRevert(tx.id)} disabled={reverting}
                                  className="px-3 py-1 rounded-lg text-xs font-semibold"
                                  style={{ background: "#eab308", color: "#000", opacity: reverting ? 0.6 : 1 }}>
                                  {reverting ? "..." : "Sí"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRevert(tx.id)}
                              className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                              style={{ background: "rgba(234,179,8,0.12)", color: "#a16207" }}
                            >
                              <Undo2 size={14} />
                              Revertir a pendiente
                            </button>
                          )
                        )}

                        {/* Hard delete (owner only) — pending/failed/standalone product sales */}
                        {isOwner && (tx.status !== "completed" || tx.type === "product_sale") && (confirmDelete === tx.id ? (
                          <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.08)" }}>
                            <span className="text-xs font-medium" style={{ color: "#ef4444" }}>¿Eliminar permanentemente?</span>
                            <div className="flex gap-2">
                              <button onClick={() => setConfirmDelete(null)}
                                className="px-3 py-1 rounded-lg text-xs font-semibold"
                                style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}>
                                No
                              </button>
                              <button onClick={() => handleDelete(tx.id)} disabled={deleting}
                                className="px-3 py-1 rounded-lg text-xs font-semibold"
                                style={{ background: "#ef4444", color: "#fff", opacity: deleting ? 0.6 : 1 }}>
                                {deleting ? "..." : "Sí"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(tx.id)}
                            className="w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2"
                            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}
                          >
                          <Trash2 size={14} />
                            Eliminar transacción
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {allocateTx && (
        <PendingAllocationModal
          transaction={allocateTx}
          open={!!allocateTx}
          onClose={() => setAllocateTx(null)}
          onAllocated={handleAllocated}
        />
      )}
    </div>
  );
}

/* Small detail row component */
function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span style={{ color: "var(--text-tertiary)" }}>{icon}</span>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{label}</span>
      </div>
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}
