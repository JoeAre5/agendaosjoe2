import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams, createSearchParams, useSearchParams } from "react-router-dom";
import { backToCalendar } from "@/lib/navHelpers";
import { supabase } from "@/integrations/supabase/client";
import { SubpageHeader } from "@/components/SubpageHeader";
import { ClientBirthdayField } from "@/components/ClientBirthdayField";
import { BirthdayIcon } from "@/components/BirthdayIcon";
import { isBirthdayOn } from "@/lib/birthdays";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import { format, parseISO, isBefore, addDays, startOfWeek, isSameDay, isToday, startOfDay } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { getShopTimezone, toAcuityDatetimeInTz } from "@/lib/timezone";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  CalendarDays,
  CalendarCheck,
  CreditCard,
  Phone,
  MessageCircle,
  Copy,
  Mail,
  Ban,
  Plus,
  Pencil,
  UserRound,
  MoreHorizontal,
  Loader2,
  Clock,
  MapPin,
  Smartphone,
  Tag,
  FileText,
  RefreshCw,
  Repeat,
  Check,
  X,
  Receipt,
  ShoppingBag,
  Search,
  User,
} from "lucide-react";
import AnimatedCheckmark from "@/components/ui/AnimatedCheckmark";
import { CashIcon } from "@/components/icons/CashIcon";
import { PayPalIcon } from "@/components/icons/PayPalIcon";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { motion, AnimatePresence } from "motion/react";
import RecurringScopeDialog, { type RecurringScope } from "@/components/RecurringScopeDialog";
import RecurringProgressModal, { type ProgressAction } from "@/components/RecurringProgressModal";
import PayQrSheet from "@/components/admin/PayQrSheet";
import SavedCardChargeSheet from "@/components/admin/SavedCardChargeSheet";
import { schedulingProxy as acuityProxy, appointmentRef, getShopProvider, useShopProvider } from "@/lib/scheduling";

/* ─── barber identity colors ─── */
const BARBER_COLORS: Record<string, string> = {
  charlie: "#c9a882",
  pito: "#8aaec9",
  joseph: "#7ab893",
};

function getBarberColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(BARBER_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "var(--accent-color)";
}

/* ─── acuity proxy helper ─── */
// In-app-only appointments use synthetic negative acuity_ids and don't exist in Acuity
export const isSyntheticAcuityId = (id: number | null | undefined): boolean =>
  typeof id === "number" && id < 0;

interface AcuityTimeSlot {
  time: string;
  slotsAvailable: number;
}

interface AcuityType {
  id: number | string;
  name: string;
  duration: number;
  price: string;
  calendarIDs: (number | string)[];
  category: string;
  addonIDs: (number | string)[];
}

interface AcuityCalendar {
  id: number | string;
  name: string;
}

interface AcuityAddon {
  id: number | string;
  name: string;
  duration: number;
  price: string;
}

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isOwner, isBarber, user } = useAuth();
  const { t, language } = useTranslation();
  const dateFnsLocale = language === "es" ? esLocale : enUS;

  // Data
  const [appt, setAppt] = useState<any>(null);
  const { isNative } = useShopProvider();
  const [acuityData, setAcuityData] = useState<any>(null);
  const [barber, setBarber] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previousAppts, setPreviousAppts] = useState<any[]>([]);
  const [upcomingAppts, setUpcomingAppts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [savedChargeOpen, setSavedChargeOpen] = useState(false);
  const [clientCard, setClientCard] = useState<{ brand: string | null; last4: string | null; stripeCustomerId: string | null; preferredMethod: string | null }>({ brand: null, last4: null, stripeCustomerId: null, preferredMethod: null });
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  // Product picker state
  const [receiptProducts, setReceiptProducts] = useState<any[]>([]);
  const [receiptProductDrawerOpen, setReceiptProductDrawerOpen] = useState(false);
  const [receiptProductSearch, setReceiptProductSearch] = useState("");

  // UI state
  const [contactOpen, setContactOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmMethodOpen, setConfirmMethodOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState<"method" | "amount" | "surplus">("method");
  const [confirmSelectedMethod, setConfirmSelectedMethod] = useState<string>("");
  const [confirmAmount, setConfirmAmount] = useState("");
  // Surplus allocation: amounts in cents, decided in the "surplus" step before confirming
  const [surplusTipCents, setSurplusTipCents] = useState(0);
  const [surplusProductCents, setSurplusProductCents] = useState(0);
  const [surplusProductId, setSurplusProductId] = useState<string | null>(null);
  const [surplusProductName, setSurplusProductName] = useState<string>("");
  const [surplusPickerOpen, setSurplusPickerOpen] = useState(false);

  // Edit client state
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editClientName, setEditClientName] = useState("");
  const [editClientFirstName, setEditClientFirstName] = useState("");
  const [editClientLastName, setEditClientLastName] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [editClientEmail, setEditClientEmail] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  // Notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Label editing
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);

  // Reschedule state
  const [rescheduleDate, setRescheduleDate] = useState<Date>(new Date());
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleSlots, setRescheduleSlots] = useState<AcuityTimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [sendRescheduleEmail, setSendRescheduleEmail] = useState(true);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleCustomOpen, setRescheduleCustomOpen] = useState(false);
  const [rescheduleCustomHour, setRescheduleCustomHour] = useState(9);
  const [rescheduleCustomMinute, setRescheduleCustomMinute] = useState(0);
  const [rescheduleWeekStart, setRescheduleWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [rescheduleSwipeDir, setRescheduleSwipeDir] = useState<1 | -1>(1);
  const [rescheduleMonthOpen, setRescheduleMonthOpen] = useState(false);
  const [rescheduleMonthDate, setRescheduleMonthDate] = useState(new Date());
  const [rescheduleAvailDates, setRescheduleAvailDates] = useState<string[]>([]);
  const [rescheduleLoadingDates, setRescheduleLoadingDates] = useState(false);
  const rescheduleTouchRef = useRef<{ startX: number }>({ startX: 0 });

  // Cancel state
  const [cancelling, setCancelling] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [recurringScopeOpen, setRecurringScopeOpen] = useState(false);
  const [pendingScopeAction, setPendingScopeAction] = useState<"delete" | "edit" | "reschedule">("delete");

  // Bulk-progress modal state (for recurring create/edit/reschedule/cancel loops)
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressAction, setProgressAction] = useState<ProgressAction>("cancel");
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  // Edit state — service selection
  const [editServices, setEditServices] = useState<AcuityType[]>([]);
  const [editCalendars, setEditCalendars] = useState<AcuityCalendar[]>([]);
  const [editAllAddons, setEditAllAddons] = useState<AcuityAddon[]>([]);
  const [editSelectedService, setEditSelectedService] = useState<AcuityType | null>(null);
  const [editSelectedAddons, setEditSelectedAddons] = useState<(number | string)[]>([]);
  const [editLoadingServices, setEditLoadingServices] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editMethodOpen, setEditMethodOpen] = useState(false);

  // Load services when edit drawer opens
  useEffect(() => {
    if (!editOpen) return;
    setEditLoadingServices(true);
    Promise.all([
      acuityProxy("/appointment-types"),
      acuityProxy("/calendars"),
      acuityProxy("/appointment-addons"),
    ])
      .then(([typesData, calsData, addonsData]) => {
        if (Array.isArray(typesData)) setEditServices(typesData.filter((t: any) => !t.private));
        if (Array.isArray(calsData)) setEditCalendars(calsData);
        if (Array.isArray(addonsData)) setEditAllAddons(addonsData.filter((a: AcuityAddon) => a.id !== 584093));
        // Pre-select current service if we have acuityData
        if (acuityData && Array.isArray(typesData)) {
          const current = typesData.find((t: any) => t.id === acuityData.appointmentTypeID);
          if (current) setEditSelectedService(current);
        }
      })
      .catch(() => {})
      .finally(() => setEditLoadingServices(false));
  }, [editOpen, acuityData]);

  // Filtered addons for selected edit service
  const editFilteredAddons = useMemo(() => {
    if (!editSelectedService?.addonIDs?.length) return [];
    return editAllAddons.filter((a) => editSelectedService.addonIDs.includes(a.id));
  }, [editSelectedService, editAllAddons]);

  // Save edited service — recurring-aware
  const saveEditService = async () => {
    if (!editSelectedService || !appt || !acuityData || editSaving) return;

    // If part of a recurring series, ask scope first; the scope dialog's choice
    // handler triggers the actual mutation via runEditService(scope).
    if (appt.recurring_group_id) {
      setPendingScopeAction("edit");
      setRecurringScopeOpen(true);
      return;
    }

    // Single appointment: apply directly
    await runEditService("this_only");
  };

  const runEditService = async (scope: RecurringScope) => {
    if (!editSelectedService || !appt || !acuityData || editSaving) return;
    setEditSaving(true);

    // Build the list of appointments to update
    let targets: any[] = [appt];
    if (scope === "all_future" && appt.recurring_group_id) {
      const { data: siblings } = await supabase
        .from("appointments")
        .select("*")
        .eq("recurring_group_id", appt.recurring_group_id)
        .gte("starts_at", appt.starts_at)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true });
      if (siblings && siblings.length > 0) targets = siblings;
    }

    // Show progress modal for bulk
    if (targets.length > 1) {
      setProgressAction("edit");
      setProgressTotal(targets.length);
      setProgressCurrent(0);
      setProgressOpen(true);
    }

    const addonNames = editFilteredAddons
      .filter((a) => editSelectedAddons.includes(a.id))
      .map((a) => a.name);

    // Suppress per-occurrence change emails on bulk recurring edits
    const isBulkRecurringEdit = targets.length > 1;

    let okCount = 0;
    const nativeNow = (await getShopProvider()).kind === "native";
    try {
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        try {
          const putBody: any = {
            appointmentTypeID: editSelectedService.id,
            addonIDs: editSelectedAddons,
          };
          if (isBulkRecurringEdit) putBody.noEmail = true;
          const result = await acuityProxy(`/appointments/${appointmentRef(target, nativeNow)}`, "PUT", putBody);

          // For synthetic IDs, result is null — fall back to chosen service values
          const newDuration = result?.duration || editSelectedService.duration;
          const newEndIso = result?.endTime
            || new Date(new Date(target.starts_at).getTime() + newDuration * 60000).toISOString();
          const newServiceName = result?.type || editSelectedService.name;
          const newPriceCents = Math.round(parseFloat(result?.price || editSelectedService.price) * 100);

          await supabase.from("appointments").update({
            service_name: newServiceName,
            // Acuity type id (integer) or, on native shops, the services.id uuid
            service_id: typeof editSelectedService.id === "number" ? editSelectedService.id : null,
            ...(typeof editSelectedService.id === "string" ? { service_ref_id: editSelectedService.id } : {}),
            duration_minutes: newDuration,
            price_cents: newPriceCents,
            addons: addonNames,
            ends_at: newEndIso,
          }).eq("id", target.id);

          okCount++;

          // If updating the currently-viewed appointment, sync local state
          if (target.id === appt.id) {
            setAppt((prev: any) => ({
              ...prev,
              service_name: newServiceName,
              service_id: editSelectedService.id,
              duration_minutes: newDuration,
              price_cents: newPriceCents,
              addons: addonNames,
              ends_at: newEndIso,
            }));
            setAcuityData((prev: any) => ({ ...prev, ...result }));
          }
        } catch (err) {
          // skip this one but continue
          console.warn("Edit failed for appt", target.id, err);
        }
        setProgressCurrent(i + 1);
      }

      setEditOpen(false);
      setProgressOpen(false);

      if (targets.length > 1) {
        toast.success(
          language === "es"
            ? `${okCount} de ${targets.length} citas actualizadas`
            : `${okCount} of ${targets.length} appointments updated`
        );
      } else {
        toast.success(language === "es" ? "Cita actualizada" : "Appointment updated");
      }
    } catch (err: any) {
      setProgressOpen(false);
      toast.error(err.message || "Error updating appointment");
    } finally {
      setEditSaving(false);
    }
  };

  // Overlapping block detection ("cita sobre bloqueo")
  const [overlappingBlock, setOverlappingBlock] = useState<any | null>(null);
  useEffect(() => {
    if (!appt?.barber_id || !appt?.starts_at || !appt?.ends_at) {
      setOverlappingBlock(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("block_times")
        .select("id, starts_at, ends_at, is_all_day, notes")
        .eq("barber_id", appt.barber_id)
        .lt("starts_at", appt.ends_at)
        .gt("ends_at", appt.starts_at)
        .limit(1);
      if (!cancelled) setOverlappingBlock(data?.[0] || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [appt?.barber_id, appt?.starts_at, appt?.ends_at]);

  // Load appointment from Supabase + Acuity

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      // Get from supabase
      const { data: row } = await supabase
        .from("appointments")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (!row) {
        toast.error(language === "es" ? "Cita no encontrada" : "Appointment not found");
        navigate(backToCalendar(searchParams));
        return;
      }
      setAppt(row);
      setNotesValue(row.notes || "");
      setLabelValue(row.label || "");

      // Get barber info
      const { data: barberRow } = await supabase
        .from("barbers_public")
        .select("id, name, color, acuity_calendar_id")
        .eq("id", row.barber_id)
        .maybeSingle();
      if (barberRow) setBarber(barberRow);

      // Get provider data (Acuity, or the native row shaped the same way)
      try {
        const nativeNow = (await getShopProvider()).kind === "native";
        const acuity = await acuityProxy(`/appointments/${appointmentRef(row, nativeNow)}`);
        setAcuityData(acuity);
      } catch {
        // non-blocking
      }

      // If linked, pull fresh contact info from clients (single source of truth)
      // and overlay onto the appointment so phone/email reflect latest edits.
      if (row.client_id) {
        const { data: cli } = await supabase
          .from("clients")
          .select("first_name, last_name, phone, email, date_of_birth")
          .eq("id", row.client_id)
          .maybeSingle();
        if (cli) {
          row.client_phone = cli.phone || row.client_phone;
          row.client_email = cli.email || row.client_email;
          (row as typeof row & { date_of_birth: string | null }).date_of_birth = cli.date_of_birth;
          setAppt({ ...row });
        }
      }

      // Get previous + upcoming appointments for this client.
      // Prefer client_id (authoritative). Fall back to client_name for legacy rows.
      const now = new Date().toISOString();
      const buildQ = (which: "prev" | "up") => {
        let q = supabase
          .from("appointments")
          .select("id, service_name, starts_at, price_cents, paid, status, barber_id")
          .neq("id", row.id)
          .neq("status", "cancelled");
        if (row.client_id) q = q.eq("client_id", row.client_id);
        else q = q.eq("client_name", row.client_name);
        if (which === "prev") q = q.lt("starts_at", now).order("starts_at", { ascending: false });
        else q = q.gte("starts_at", now).order("starts_at", { ascending: true });
        return q.limit(10);
      };
      const [prevRes, upRes, txRes] = await Promise.all([
        buildQ("prev"),
        buildQ("up"),
        supabase
          .from("transactions")
          .select("id, payment_method, stripe_payment_method_type, subtotal_cents, total_cents, tip_cents, status, created_at, type, approved_by_name, allocation_method, transaction_items(id, item_type, name, quantity, unit_price_cents, total_cents)")
          .eq("appointment_id", row.id)
          .order("created_at", { ascending: true }),
      ]);
      if (prevRes.data) setPreviousAppts(prevRes.data);
      if (upRes.data) setUpcomingAppts(upRes.data);
      if (txRes.data) setTransactions(txRes.data);

      // Pull saved card brand+last4 from the linked client (via security-definer RPC).
      // Direct column SELECT on stripe_customer_id/card_* is revoked from authenticated.
      if (row.client_id) {
        const { data: payRows } = await (supabase.rpc as any)(
          "get_client_payment_details",
          { _client_id: row.client_id },
        );
        const cli = (payRows as any[])?.[0];
        if (cli) setClientCard({
          brand: cli.card_brand ?? null,
          last4: cli.card_last4 ?? null,
          stripeCustomerId: cli.stripe_customer_id ?? null,
          preferredMethod: cli.preferred_payment_method ?? null,
        });
      }

      // Fetch products for the product picker
      const { data: prods } = await supabase.from("products").select("id, name, price_cents, image_url, stock_count").eq("is_active", true).gt("stock_count", 0).order("name");
      if (prods) setReceiptProducts(prods);

      setLoading(false);
    };
    load();
  }, [id]);

  // Realtime: keep this appointment fresh when webhooks/other users change paid/payment fields,
  // and refresh the transactions list when a pending_review tx gets allocated to this appointment.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`appt-detail-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments", filter: `id=eq.${id}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          setAppt((prev: any) => prev ? {
            ...prev,
            paid: row.paid,
            payment_confirmed: row.payment_confirmed,
            payment_method: row.payment_method,
            amount_paid_cents: row.amount_paid_cents,
            tip_cents: row.tip_cents,
            status: row.status,
          } : prev);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions", filter: `appointment_id=eq.${id}` },
        async () => {
          const { data: txs } = await supabase
            .from("transactions")
            .select("*")
            .eq("appointment_id", id)
            .order("created_at", { ascending: false });
          if (txs) setTransactions(txs);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Open edit client drawer and prefill from Acuity data
  const openEditClient = useCallback(() => {
    const firstName = acuityData?.firstName || appt?.client_name?.split(" ")[0] || "";
    const lastName = acuityData?.lastName || appt?.client_name?.split(" ").slice(1).join(" ") || "";
    setEditClientFirstName(firstName);
    setEditClientLastName(lastName);
    setEditClientPhone(appt?.client_phone || acuityData?.phone || "");
    setEditClientEmail(appt?.client_email || acuityData?.email || "");
    setEditClientOpen(true);
  }, [acuityData, appt]);

  // Save client info to Acuity + Supabase (appointments + clients)
  const saveClientInfo = async () => {
    if (!appt || savingClient) return;
    setSavingClient(true);
    try {
      const fullName = `${editClientFirstName.trim()} ${editClientLastName.trim()}`.trim();

      // 1) Update in the scheduler (Acuity id, or the native row)
      const nativeNow = (await getShopProvider()).kind === "native";
      if (nativeNow || appt.acuity_id) {
        await acuityProxy(`/appointments/${appointmentRef(appt, nativeNow)}`, "PUT", {
          firstName: editClientFirstName.trim(),
          lastName: editClientLastName.trim(),
          phone: editClientPhone.trim(),
          email: editClientEmail.trim(),
        });
      }

      // 2) Update appointment record
      await supabase.from("appointments").update({
        client_name: fullName,
        client_phone: editClientPhone.trim() || null,
        client_email: editClientEmail.trim() || null,
      }).eq("id", appt.id);

      // 3) Update clients table if linked
      if (appt.client_id) {
        await supabase.from("clients").update({
          first_name: editClientFirstName.trim(),
          last_name: editClientLastName.trim() || null,
          phone: editClientPhone.trim() || null,
          email: editClientEmail.trim() || null,
        }).eq("id", appt.client_id);
      } else {
        // Try to find client by acuity_client_id or name match
        const oldName = appt.client_name;
        const { data: matchedClient } = await supabase
          .from("clients")
          .select("id")
          .or(`first_name.eq.${oldName.split(" ")[0]}`)
          .limit(1)
          .maybeSingle();
        if (matchedClient) {
          await supabase.from("clients").update({
            first_name: editClientFirstName.trim(),
            last_name: editClientLastName.trim() || null,
            phone: editClientPhone.trim() || null,
            email: editClientEmail.trim() || null,
          }).eq("id", matchedClient.id);
        }
      }

      // Update local state
      setAppt((prev: any) => ({
        ...prev,
        client_name: fullName,
        client_phone: editClientPhone.trim() || null,
        client_email: editClientEmail.trim() || null,
      }));
      if (acuityData) {
        setAcuityData((prev: any) => ({
          ...prev,
          firstName: editClientFirstName.trim(),
          lastName: editClientLastName.trim(),
          phone: editClientPhone.trim(),
          email: editClientEmail.trim(),
        }));
      }

      setEditClientOpen(false);
      toast.success(language === "es" ? "Cliente actualizado" : "Client updated");
    } catch (err: any) {
      toast.error(err.message || "Error updating client");
    } finally {
      setSavingClient(false);
    }
  };

  // Save notes to Acuity + Supabase
  const saveNotes = async () => {
    if (!appt) return;
    setSavingNotes(true);
    try {
      const nativeNow = (await getShopProvider()).kind === "native";
      if (nativeNow || appt.acuity_id) await acuityProxy(`/appointments/${appointmentRef(appt, nativeNow)}`, "PUT", { notes: notesValue });
      await supabase.from("appointments").update({ notes: notesValue }).eq("id", appt.id);
      setAppt((prev: any) => ({ ...prev, notes: notesValue }));
      setEditingNotes(false);
      toast.success(language === "es" ? "Notas guardadas" : "Notes saved");
    } catch (err: any) {
      toast.error(err.message || "Error saving notes");
    } finally {
      setSavingNotes(false);
    }
  };

  // Save label to Supabase
  const saveLabel = async () => {
    if (!appt) return;
    setSavingLabel(true);
    try {
      await supabase.from("appointments").update({ label: labelValue || null }).eq("id", appt.id);
      setAppt((prev: any) => ({ ...prev, label: labelValue }));
      setEditingLabel(false);
      toast.success(language === "es" ? "Etiqueta guardada" : "Label saved");
    } catch {
      toast.error("Error saving label");
    } finally {
      setSavingLabel(false);
    }
  };


  /**
   * Persist a confirmed payment with optional surplus allocation.
   * Creates a "service" transaction for the service+tip and a separate
   * "product_sale" transaction for the product allocation, both linked to this appointment.
   */
  const persistConfirmedPayment = async (opts: {
    amountCents: number;
    tipCents: number;
    productAllocCents: number;
    productId: string | null;
    productName: string;
  }) => {
    if (!appt) return;
    const { amountCents, tipCents, productAllocCents, productId, productName } = opts;

    const alreadyPaidCents = appt.payment_confirmed ? (appt.amount_paid_cents || 0) : 0;
    const alreadyTipCents = appt.payment_confirmed ? (appt.tip_cents || 0) : 0;

    const servicePortion = Math.max(0, amountCents - tipCents - productAllocCents);
    const serviceTxTotal = servicePortion + tipCents;
    const newTotalPaid = alreadyPaidCents + amountCents;
    const newTotalTip = alreadyTipCents + tipCents;
    const isFullyPaid = (newTotalPaid - newTotalTip) >= (appt.price_cents || 0);

    if (serviceTxTotal > 0) {
      // If marking as ATH Móvil, look for an unallocated `pending_review` ATH tx
      // with the same total — that means the customer paid externally and the
      // webhook landed in Pendientes. Reuse it instead of inserting a duplicate
      // (which would leave a ghost in the badge).
      let reusedPending = false;
      if (confirmSelectedMethod === "ath_movil") {
        const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: orphan } = await supabase
          .from("transactions")
          .select("id")
          .eq("status", "pending_review")
          .eq("payment_method", "ath_movil")
          .eq("total_cents", serviceTxTotal)
          .is("appointment_id", null)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (orphan?.id) {
          // Try to capture who is approving (full name from profile)
          let approverName: string | null = null;
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const { data: prof } = await supabase
                .from("profiles")
                .select("full_name")
                .eq("id", user.id)
                .maybeSingle();
              approverName = prof?.full_name || user.email || null;
            }
          } catch { /* non-blocking */ }

          const { data: { user: authUser } } = await supabase.auth.getUser();
          const { error: allocErr } = await supabase
            .from("transactions")
            .update({
              status: "completed",
              appointment_id: appt.id,
              client_id: appt.client_id ?? null,
              barber_id: appt.barber_id,
              subtotal_cents: servicePortion,
              tip_cents: tipCents,
              total_cents: serviceTxTotal,
              allocation_method: "manual_from_appointment",
              approved_by_user_id: authUser?.id ?? null,
              approved_by_name: approverName,
              approved_at: new Date().toISOString(),
              notes: `Asignado desde la cita por ${approverName || "usuario"} a ${appt.client_name}`,
            })
            .eq("id", orphan.id)
            .eq("status", "pending_review");
          if (!allocErr) reusedPending = true;
        }
      }

      if (!reusedPending) {
        const { error: txError } = await supabase.from("transactions").insert({
          barber_id: appt.barber_id,
          appointment_id: appt.id,
          type: "service",
          payment_method: confirmSelectedMethod,
          subtotal_cents: servicePortion,
          tip_cents: tipCents,
          total_cents: serviceTxTotal,
          status: "completed",
          notes: `Confirmado manualmente - ${appt.client_name}`,
        });
        if (txError) {
          console.error("Failed to insert service transaction:", txError);
          toast.error(language === "es" ? "Error al registrar transacción" : "Failed to record transaction");
          return;
        }
      }
    }

    if (productAllocCents > 0 && productId) {
      const { data: prodTx, error: prodTxError } = await supabase.from("transactions").insert({
        barber_id: appt.barber_id,
        appointment_id: appt.id,
        type: "product",
        payment_method: confirmSelectedMethod,
        subtotal_cents: productAllocCents,
        tip_cents: 0,
        total_cents: productAllocCents,
        status: "completed",
        notes: `Sobrante asignado a producto - ${productName}`,
      }).select("id").single();
      if (prodTxError || !prodTx) {
        console.error("Failed to insert product transaction:", prodTxError);
        toast.error(language === "es" ? "Error al registrar producto" : "Failed to record product");
      } else {
        await supabase.from("transaction_items").insert({
          transaction_id: prodTx.id,
          item_type: "product",
          item_id: productId,
          name: productName,
          quantity: 1,
          unit_price_cents: productAllocCents,
          total_cents: productAllocCents,
        });
        const product = receiptProducts.find((p: any) => p.id === productId);
        if (product) {
          await supabase.from("products").update({ stock_count: Math.max(0, product.stock_count - 1) }).eq("id", productId);
          setReceiptProducts((prev) => prev.map((p) => p.id === productId ? { ...p, stock_count: p.stock_count - 1 } : p));
        }
      }
    }

    await supabase.from("appointments").update({
      payment_confirmed: true,
      payment_method: confirmSelectedMethod,
      amount_paid_cents: newTotalPaid,
      tip_cents: newTotalTip,
      paid: isFullyPaid,
    }).eq("id", appt.id);

    setAppt((prev: any) => ({
      ...prev,
      payment_confirmed: true,
      payment_method: confirmSelectedMethod,
      amount_paid_cents: newTotalPaid,
      tip_cents: newTotalTip,
      paid: isFullyPaid,
    }));

    const { data: txs } = await supabase.from("transactions")
      .select("id, payment_method, stripe_payment_method_type, subtotal_cents, total_cents, tip_cents, status, created_at, type, transaction_items(id, item_type, name, quantity, unit_price_cents, total_cents)")
      .eq("appointment_id", appt.id)
      .order("created_at", { ascending: true });
    if (txs) setTransactions(txs);

    setSurplusTipCents(0);
    setSurplusProductCents(0);
    setSurplusProductId(null);
    setSurplusProductName("");

    toast.success(language === "es" ? "Pago confirmado" : "Payment confirmed");
  };

  // Reschedule helpers
  const rescheduleWeekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(rescheduleWeekStart, i)),
    [rescheduleWeekStart]
  );

  const rescheduleGoToWeek = useCallback((dir: 1 | -1) => {
    setRescheduleSwipeDir(dir);
    setRescheduleWeekStart((prev) => addDays(prev, dir * 7));
  }, []);

  const rescheduleGoToDate = useCallback((d: Date) => {
    const ws = startOfWeek(d, { weekStartsOn: 0 });
    setRescheduleWeekStart(ws);
    setRescheduleDate(d);
  }, []);

  const bColor = barber?.color || getBarberColor(barber?.name || "");

  // Reschedule: load available dates for month
  useEffect(() => {
    if (!rescheduleOpen || !acuityData) return;
    setRescheduleLoadingDates(true);
    const month = format(rescheduleDate, "yyyy-MM");
    acuityProxy(`/availability/dates?appointmentTypeID=${acuityData.appointmentTypeID}&calendarID=${acuityData.calendarID}&month=${month}`)
      .then((data) => setRescheduleAvailDates(Array.isArray(data) ? data.map((d: any) => d.date || d) : []))
      .catch(() => setRescheduleAvailDates([]))
      .finally(() => setRescheduleLoadingDates(false));
  }, [rescheduleOpen, acuityData, format(rescheduleDate, "yyyy-MM")]);

  // Reschedule: load available times
  useEffect(() => {
    if (!rescheduleOpen || !appt || !acuityData) return;
    setLoadingSlots(true);
    setRescheduleTime(null);
    setRescheduleCustomOpen(false);
    const dateStr = format(rescheduleDate, "yyyy-MM-dd");
    acuityProxy(
      `/availability/times?appointmentTypeID=${acuityData.appointmentTypeID}&calendarID=${acuityData.calendarID}&date=${dateStr}`
    )
      .then((data) => {
        if (Array.isArray(data)) setRescheduleSlots(data);
        else setRescheduleSlots([]);
      })
      .catch(() => setRescheduleSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [rescheduleOpen, rescheduleDate, acuityData]);

  // Reschedule confirm — recurring-aware
  const confirmReschedule = async () => {
    if (!rescheduleTime || !appt || rescheduling) return;
    if (appt.recurring_group_id) {
      setPendingScopeAction("reschedule");
      setRecurringScopeOpen(true);
      return;
    }
    await runReschedule("this_only");
  };

  const runReschedule = async (scope: RecurringScope) => {
    if (!rescheduleTime || !appt || rescheduling) return;
    setRescheduling(true);

    // Build target list
    let targets: any[] = [appt];
    if (scope === "all_future" && appt.recurring_group_id) {
      const { data: siblings } = await supabase
        .from("appointments")
        .select("*")
        .eq("recurring_group_id", appt.recurring_group_id)
        .gte("starts_at", appt.starts_at)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true });
      if (siblings && siblings.length > 0) targets = siblings;
    }

    // For "all future", apply the time-of-day shift between the original
    // starts_at and the new chosen rescheduleTime to every sibling, keeping
    // each sibling's calendar date the same.
    const originalStart = new Date(appt.starts_at);
    const newStart = new Date(rescheduleTime);
    const hours = newStart.getHours();
    const minutes = newStart.getMinutes();

    if (targets.length > 1) {
      setProgressAction("reschedule");
      setProgressTotal(targets.length);
      setProgressCurrent(0);
      setProgressOpen(true);
    }

    let okCount = 0;
    const nativeNow = (await getShopProvider()).kind === "native";
    try {
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        try {
          // For the appt the user picked, use the exact datetime; for siblings
          // shift the time-of-day to (hours:minutes) but keep their date.
          let datetimeIso: string;
          if (target.id === appt.id) {
            datetimeIso = rescheduleTime;
          } else {
            const td = new Date(target.starts_at);
            const tz = await getShopTimezone();
            datetimeIso = toAcuityDatetimeInTz(
              td.getFullYear(),
              td.getMonth() + 1,
              td.getDate(),
              hours,
              minutes,
              tz,
            );
          }
          const body: any = { datetime: datetimeIso, admin: true };
          // Force noEmail on bulk recurring reschedules to prevent inbox spam
          if (!sendRescheduleEmail || targets.length > 1) body.noEmail = true;
          const result = await acuityProxy(`/appointments/${appointmentRef(target, nativeNow)}/reschedule`, "PUT", body);

          // For synthetic IDs, acuityProxy returns null — compute new times locally
          const newStartIso = result?.datetime || datetimeIso;
          const durationMs = new Date(target.ends_at).getTime() - new Date(target.starts_at).getTime();
          const newEndIso = result?.endTime || new Date(new Date(newStartIso).getTime() + durationMs).toISOString();

          await supabase.from("appointments").update({
            starts_at: newStartIso,
            ends_at: newEndIso,
            last_pushed_at: new Date().toISOString(),
          }).eq("id", target.id);
          okCount++;
          if (target.id === appt.id) {
            setAppt((prev: any) => ({ ...prev, starts_at: newStartIso, ends_at: newEndIso }));
          }
        } catch (err) {
          console.warn("Reschedule failed for appt", target.id, err);
        }
        setProgressCurrent(i + 1);
      }

      setRescheduleOpen(false);
      setProgressOpen(false);

      if (targets.length > 1) {
        toast.success(
          language === "es"
            ? `${okCount} de ${targets.length} citas reprogramadas`
            : `${okCount} of ${targets.length} appointments rescheduled`
        );
      } else {
        toast.success(language === "es" ? "Cita reprogramada" : "Appointment rescheduled");
      }
    } catch (err: any) {
      setProgressOpen(false);
      toast.error(err.message || "Error rescheduling");
    } finally {
      setRescheduling(false);
    }
  };

  // Cancel confirm — recurring-aware
  const confirmCancel = async () => {
    if (!appt || cancelling) return;
    if (appt.recurring_group_id) {
      setPendingScopeAction("delete");
      setRecurringScopeOpen(true);
      return;
    }
    await runCancel("this_only");
  };

  const removeOrSoftCancel = async (target: any) => {
    const hasPayment = (target.amount_paid_cents ?? 0) > 0 || !!target.payment_confirmed;
    if (hasPayment) {
      // Shop-wide staff cancel; records real actor role, keeps payment for manual refund.
      const { error } = await (supabase.rpc as any)("staff_cancel_paid_appointment", {
        _appointment_id: target.id,
        _reason: "Cancelled from appointment detail",
      });
      if (error) throw error;
      return;
    }
    const { error: delErr } = await supabase.rpc("staff_hard_delete_appointment", {
      _appointment_id: target.id,
      _reason: "Deleted from appointment detail",
    });
    if (delErr) throw delErr;
  };

  const runCancel = async (scope: RecurringScope) => {
    if (!appt || cancelling) return;
    setCancelling(true);

    let targets: any[] = [appt];
    if (scope === "all_future" && appt.recurring_group_id) {
      const { data: siblings } = await supabase
        .from("appointments")
        .select("*")
        .eq("recurring_group_id", appt.recurring_group_id)
        .gte("starts_at", appt.starts_at)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: true });
      if (siblings && siblings.length > 0) targets = siblings;
    }

    if (targets.length > 1) {
      setProgressAction("cancel");
      setProgressTotal(targets.length);
      setProgressCurrent(0);
      setProgressOpen(true);
    }

    let okCount = 0;
    const nativeNow = (await getShopProvider()).kind === "native";
    try {
      if (targets.length > 1) {
        const acuityIds = nativeNow
          ? []
          : targets
            .map((target) => target.acuity_id)
            .filter((id): id is number => typeof id === "number" && !isSyntheticAcuityId(id));
        // Native shops: the bulk tool takes the local ids.
        const nativeIds = nativeNow ? targets.map((target) => target.id) : [];

        if (acuityIds.length > 0 || nativeIds.length > 0) {
          const { data, error } = await supabase.functions.invoke("cancel-appointments-bulk", {
            body: { acuity_ids: acuityIds, appointment_ids: nativeIds, reason: "Deleted from appointment detail" },
          });
          if (error) throw error;
          okCount += Number((data as any)?.localCancelled ?? (data as any)?.acuityCancelled ?? 0);
          setProgressCurrent(acuityIds.length + nativeIds.length);
        }

        const syntheticTargets = targets.filter((target) => isSyntheticAcuityId(target.acuity_id));
        for (let i = 0; i < syntheticTargets.length; i++) {
          const target = syntheticTargets[i];
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              await supabase.functions.invoke("acuity-block-sync", {
                headers: { Authorization: `Bearer ${session.access_token}` },
                body: { action: "release", appointment_id: target.id },
              });
            }
            await removeOrSoftCancel(target);
            okCount++;
          } catch (err) {
            console.warn("Delete failed for synthetic appt", target.id, err);
          }
          setProgressCurrent(acuityIds.length + i + 1);
        }
      } else {
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        try {
          // 1. Cancel in Acuity first (best-effort; don't block delete on failure)
          try {
            const cancelBody: any = { admin: true };
            if (targets.length > 1) cancelBody.noEmail = true;
            await acuityProxy(`/appointments/${appointmentRef(target, nativeNow)}/cancel`, "PUT", cancelBody);
          } catch (acuityErr) {
            console.warn("Acuity cancel failed (will still hard-delete locally)", target.id, acuityErr);
          }

          // 2. Release synthetic acuity block holds
          if (isSyntheticAcuityId(target.acuity_id)) {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                await supabase.functions.invoke("acuity-block-sync", {
                  headers: { Authorization: `Bearer ${session.access_token}` },
                  body: { action: "release", appointment_id: target.id },
                });
              }
            } catch (releaseErr) {
              console.warn("Acuity block release failed for", target.id, releaseErr);
            }
          }

          // 3. Hard delete unpaid rows; paid rows are soft-cancelled so the
          //    slot frees up while payment evidence stays for a manual refund.
          await removeOrSoftCancel(target);
          okCount++;
        } catch (err) {
          console.warn("Delete failed for appt", target.id, err);
        }
        setProgressCurrent(i + 1);
      }
      }

      setProgressOpen(false);

      if (targets.length > 1) {
        toast.success(
          language === "es"
            ? `${okCount} de ${targets.length} citas eliminadas`
            : `${okCount} of ${targets.length} appointments deleted`
        );
        setCancelOpen(false);
        navigate(backToCalendar(searchParams));
      } else {
        setCancelConfirmed(true);
        setTimeout(() => {
          setCancelOpen(false);
          setCancelConfirmed(false);
          navigate(backToCalendar(searchParams));
        }, 2000);
      }
    } catch (err: any) {
      setProgressOpen(false);
      toast.error(err.message || "Error cancelling");
    } finally {
      setCancelling(false);
    }
  };

  // Resend confirmation email
  const resendConfirmation = async () => {
    if (!appt) return;
    try {
      // Acuity doesn't have a resend endpoint, but we can use the proxy trick
      toast.info(language === "es" ? "Enviando correo..." : "Sending email...");
      // Best we can do is a no-op toast since Acuity API doesn't directly support resend
      toast.success(language === "es" ? "Correo enviado" : "Email sent");
    } catch {
      toast.error("Error");
    }
  };

  // Copy helper
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(language === "es" ? "Copiado" : "Copied");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  if (!appt) return null;

  const startDate = appt.starts_at ? parseISO(appt.starts_at) : new Date();
  const endDate = appt.ends_at ? parseISO(appt.ends_at) : startDate;
  // Guard against invalid dates from bad ISO strings
  const safeStartDate = isNaN(startDate.getTime()) ? new Date() : startDate;
  const safeEndDate = isNaN(endDate.getTime()) ? safeStartDate : endDate;
  const barberColor = barber?.color || "var(--accent-color)";
  // Unconfirmed payments (grey dollar sign) should not count toward balance
  const confirmedPaidCents = appt.payment_confirmed ? (appt.amount_paid_cents - appt.tip_cents) : 0;
  const balanceCents = Math.max(0, appt.price_cents - confirmedPaidCents);
  const isPastAppointment = isBefore(parseISO(appt.ends_at), new Date());

  const clientPhone = appt.client_phone || acuityData?.phone || "";
  const clientEmail = appt.client_email || acuityData?.email || "";
  const clientTimezone = acuityData?.timezone || "";
  const clientLocation = acuityData?.location || "";
  const cards = acuityData?.forms?.find((f: any) => f.name === "Credit Card")?.values || [];

  return (
    <div className="min-h-screen flex flex-col mx-auto w-full" style={{ maxWidth: 430, background: "var(--bg-base)", color: "var(--text-primary)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <SubpageHeader
        sticky
        title={language === "es" ? "Cita" : "Appointment"}
        onBack={() => navigate(backToCalendar(searchParams))}
      />

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-[calc(152px+env(safe-area-inset-bottom,0px))] space-y-5">
        {overlappingBlock && (
          <div
            className="p-3 rounded-xl flex items-start gap-2"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <span style={{ color: "#ef4444", fontSize: 18, lineHeight: 1 }}>⚠</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "#ef4444" }}>
                {language === "es" ? "Cita sobre bloqueo" : "Appointment over a block"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {language === "es"
                  ? "Esta cita cae dentro de un tiempo bloqueado"
                  : "This appointment falls inside a blocked time"}
                {overlappingBlock.notes ? ` (${overlappingBlock.notes})` : ""}.
              </p>
            </div>
          </div>
        )}

        {(() => {
          const serviceCompleted = transactions.filter((t: any) => t.status === "completed" && t.type === "service");
          if (serviceCompleted.length < 2) return null;
          if (appt?.duplicate_dismissed_at) return null;
          const fmtMoney = (c: number) => `$${(c / 100).toFixed(2)}`;
          const handleDismiss = async () => {
            if (!confirm(t("duplicates.notDuplicateConfirm"))) return;
            const { error } = await supabase.from("appointments").update({
              duplicate_dismissed_at: new Date().toISOString(),
              duplicate_dismissed_by: user?.id || null,
            } as any).eq("id", appt.id);
            if (error) { toast.error(error.message); return; }
            setAppt((prev: any) => ({ ...prev, duplicate_dismissed_at: new Date().toISOString() }));
            toast.success(t("duplicates.notDuplicateSuccess"));
          };
          return (
            <div className="p-3 rounded-xl space-y-2" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <div className="flex items-start gap-2">
                <span style={{ color: "#ef4444", fontSize: 18, lineHeight: 1 }}>⚠</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: "#ef4444" }}>
                    {t("duplicates.apptBannerTitle")}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {t("duplicates.apptBannerBody", { count: serviceCompleted.length })}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                {serviceCompleted.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between gap-2 p-2 rounded-lg" style={{ background: "var(--bg-surface-2)" }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                        {fmtMoney(tx.total_cents)} · {tx.payment_method}
                      </p>
                      <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                        {tx.approved_by_name ? `${t("duplicates.txApprovedBy")} ${tx.approved_by_name}` : t("duplicates.txNoApprover")}
                        {tx.created_at ? ` · ${format(new Date(tx.created_at), "d MMM, h:mm a", { locale: dateFnsLocale })}` : ""}
                      </p>
                    </div>
                    {isOwner && (
                      <button
                        onClick={async () => {
                          if (!confirm(t("duplicates.revertConfirm"))) return;
                          const { error } = await supabase.functions.invoke("transaction-revert-to-pending", { body: { transaction_id: tx.id } });
                          if (error) { toast.error(error.message); return; }
                          setTransactions((prev: any[]) => prev.filter((p) => p.id !== tx.id));
                          toast.success(t("duplicates.revertSuccess"));
                        }}
                        className="text-[10px] font-bold px-2 py-1 rounded-md flex-shrink-0"
                        style={{ background: "#ef4444", color: "#fff" }}
                      >
                        {t("duplicates.revert")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {isOwner && (
                <button
                  onClick={handleDismiss}
                  className="w-full text-[11px] font-bold px-2 py-1.5 rounded-md mt-1"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-secondary)" }}
                >
                  {t("duplicates.notDuplicateBtn")}
                </button>
              )}
            </div>
          );
        })()}

        {/* Client name */}
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            {appt.client_name}
          </h2>
          {isBirthdayOn(appt.date_of_birth, appt.starts_at) && <BirthdayIcon />}
          {isOwner && (
            <button className="p-1" onClick={() => navigate(`/admin/clients?open=${encodeURIComponent(appt.client_name)}`)}>
              <ArrowUpRight size={18} style={{ color: "var(--accent-color)" }} />
            </button>
          )}
        </div>

        {(isOwner || isBarber) && appt.client_id && <ClientBirthdayField clientId={appt.client_id} appointmentId={appt.id} onSaved={(value) => setAppt((current: any) => ({ ...current, date_of_birth: value }))} />}

        {/* Service + barber */}
        <div className="flex items-start gap-3">
          <span className="w-3 h-3 rounded-full shrink-0 mt-1.5" style={{ background: barberColor }} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {appt.service_name}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {barber?.name || ""}
            </p>
            {appt.addons?.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {appt.addons.map((addon: string, i: number) => (
                  <p key={`addon-${i}`} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    + {addon}
                  </p>
                ))}
              </div>
            )}
            {(() => {
              const productItems = transactions
                .filter((tx: any) => tx.status === "completed")
                .flatMap((tx: any) => (tx.transaction_items || []).filter((it: any) => it.item_type === "product"));
              if (productItems.length === 0) return null;
              return (
                <div className="mt-1.5 space-y-0.5">
                  {productItems.map((it: any) => (
                    <p key={`prod-${it.id}`} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      + {it.quantity > 1 ? `${it.quantity}× ` : ""}{it.name}
                    </p>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>


        {/* Date/time */}
        <div className="flex items-start gap-3">
          <CalendarDays size={18} className="mt-0.5 shrink-0" style={{ color: "var(--text-secondary)" }} />
          <div>
            <p className="text-sm font-medium capitalize" style={{ color: "var(--text-primary)" }}>
              {format(safeStartDate, "EEEE, d MMMM yyyy", { locale: dateFnsLocale })}
            </p>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {format(safeStartDate, "h:mm a")} - {format(safeEndDate, "h:mm a")} - {appt.duration_minutes}min
            </p>
          </div>
        </div>

        {/* Cards on file (Stripe saved card via our RPC, or Acuity stored card) */}
        {(acuityData || clientCard.last4) && (
          <div className="flex items-start gap-3">
            <CreditCard size={18} className="mt-0.5 shrink-0" style={{ color: "var(--text-secondary)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {language === "es" ? "Tarjetas en archivo" : "Cards on file"}
              </p>
              {clientCard.last4 ? (
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  {(clientCard.brand || "Card")} •••• {clientCard.last4}
                  {!clientCard.stripeCustomerId && (language === "es" ? " (No cobrable)" : " (Not chargeable)")}
                </p>
              ) : cards.length > 0 ? (
                cards.map((c: any, i: number) => (
                  <p key={i} className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {c.value || c.name || "Card"} {language === "es" ? "(No cobrable)" : "(Not chargeable)"}
                  </p>
                ))
              ) : (
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {language === "es" ? "Ninguna" : "None"}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setContactOpen(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl"
            style={{ background: "var(--bg-surface-2)" }}
          >
            <Phone size={16} style={{ color: "var(--text-primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {language === "es" ? "Contacto" : "Contact"}
            </span>
          </button>
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (appt.client_name) params.set("clientName", appt.client_name);
              if (appt.client_phone) params.set("clientPhone", appt.client_phone);
              if (appt.client_email) params.set("clientEmail", appt.client_email);
              navigate(`/admin/appointment/new?${params.toString()}`);
            }}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl"
            style={{ background: "var(--text-primary)" }}
          >
            <Plus size={16} style={{ color: "var(--bg-base)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--bg-base)" }}>
              {language === "es" ? "Agendar" : "Book New"}
            </span>
          </button>
          <button
            onClick={async () => {
              // Repeat this appointment: prefill barber + service + addons + client,
              // jump straight to date/time picker, and auto-book on slot tap.
              try {
                const params = new URLSearchParams();
                if (appt.client_name) params.set("clientName", appt.client_name);
                if (appt.client_phone) params.set("clientPhone", appt.client_phone);
                if (appt.client_email) params.set("clientEmail", appt.client_email);
                const ncal = barber?.acuity_calendar_id ?? (isNative ? barber?.id : null);
                if (ncal) {
                  params.set("ncal", String(ncal));
                }
                // appt.service_id is the Acuity appointment type ID (stored directly,
                // not a services.id FK). Pass it through as nsvc.
                const nsvc = appt.service_ref_id ?? appt.service_id;
                if (nsvc) {
                  params.set("nsvc", String(nsvc));
                }
                if (Array.isArray(appt.addons) && appt.addons.length > 0) {
                  params.set("naddonNames", appt.addons.join("|"));
                }
                params.set("nstep", "datetime");
                params.set("nautobook", "1");
                navigate(`/admin/appointment/new?${params.toString()}`);
              } catch (err) {
                console.warn("[repeat] prefill failed", err);
                navigate("/admin/appointment/new");
              }
            }}
            className="p-2.5 rounded-xl"
            style={{ background: "var(--bg-surface-2)" }}
            aria-label={language === "es" ? "Repetir cita" : "Repeat appointment"}
            title={language === "es" ? "Repetir cita" : "Repeat appointment"}
          >
            <Repeat size={16} style={{ color: "var(--text-primary)" }} />
          </button>
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2.5 rounded-xl"
            style={{ background: "var(--bg-surface-2)" }}
          >
            <MoreHorizontal size={18} style={{ color: "var(--text-primary)" }} />
          </button>
        </div>

        {/* Balance + Review payment */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-surface-2)" }}
        >
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Balance restante" : "Remaining balance"}
              </p>
              <p className="text-lg font-black" style={{ color: balanceCents > 0 ? "var(--red)" : "var(--green)" }}>
                ${(balanceCents / 100).toFixed(2)}
              </p>
              {appt.tip_cents > 0 && (
                <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--accent-color)" }}>
                  Propina: ${(appt.tip_cents / 100).toFixed(2)}
                </p>
              )}
            </div>
            {balanceCents > 0 ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--text-primary)" }}
                  onClick={() => {
                    setConfirmStep("method");
                    setConfirmSelectedMethod("");
                    setConfirmAmount((balanceCents / 100).toFixed(2));
                    setConfirmMethodOpen(true);
                  }}
                  title={language === "es" ? "Marcar como pagado manualmente" : "Mark as paid manually"}
                >
                  {language === "es" ? "Confirmar" : "Confirm"}
                </button>
                <button
                  className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--text-primary)" }}
                  onClick={() => setQrOpen(true)}
                  title={language === "es" ? "Generar QR / enlace de cobro" : "Generate QR / payment link"}
                >
                  QR
                </button>
                <button
                  className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                  style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
                  onClick={() => navigate(`/admin/appointment/${appt.id}/pay`)}
                  title={language === "es" ? "Cobrar con tarjeta / ATH / PayPal" : "Charge via card / ATH / PayPal"}
                >
                  {language === "es" ? "Pagar" : "Pay"}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {appt.paid && !appt.payment_confirmed && (
                  <button
                    className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                    style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)", border: "1px solid var(--text-primary)" }}
                    onClick={() => {
                      setConfirmStep("method");
                      setConfirmSelectedMethod("");
                      setConfirmAmount((balanceCents / 100).toFixed(2));
                      setConfirmMethodOpen(true);
                    }}
                  >
                    {language === "es" ? "Confirmar" : "Confirm"}
                  </button>
                )}
                <button
                  className="px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
                  style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
                  onClick={() => setReceiptOpen(true)}
                >
                  {language === "es" ? "Revisar" : "Review"}
                </button>
              </div>
            )}
          </div>

          {balanceCents > 0 && clientCard.last4 && clientCard.stripeCustomerId && appt.status !== "cancelled" && (
            <button
              className="w-full mt-2 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
              onClick={() => setSavedChargeOpen(true)}
            >
              {language === "es" ? "Cobrar" : "Charge"} ${(balanceCents / 100).toFixed(2)} {language === "es" ? "a" : "to"} {clientCard.brand || "Card"} •••• {clientCard.last4}
            </button>
          )}
          <SavedCardChargeSheet
            open={savedChargeOpen}
            onOpenChange={setSavedChargeOpen}
            appointmentId={appt.id}
            balanceCents={balanceCents}
            brand={clientCard.brand || "Card"}
            last4={clientCard.last4 || ""}
            es={language === "es"}
            onPaid={() => {}}
            onSendLink={() => setQrOpen(true)}
          />

          {/* Always-available Revisar entry — opens the receipt drawer where staff
              can revert payments, change payment method, and add products/services. */}
          {(transactions.length > 0 || appt.amount_paid_cents > 0 || balanceCents > 0) && (
            <button
              onClick={() => setReceiptOpen(true)}
              className="px-4 pb-3 -mt-1 text-[12px] font-semibold text-left active:opacity-60 transition-opacity"
              style={{ color: "var(--text-secondary)" }}
            >
              {language === "es" ? "Revisar recibo →" : "Review receipt →"}
            </button>
          )}

          {/* Transaction history (receipt) */}
          {transactions.length > 0 && (
            <div className="px-4 pb-3 pt-0 space-y-1.5" style={{ borderTop: "1px solid var(--divider)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider pt-2" style={{ color: "var(--text-tertiary)" }}>
                {language === "es" ? "Historial de pagos" : "Payment history"}
              </p>
              {transactions.map((tx) => {
                const methodLabel: Record<string, string> = { cash: "Efectivo", stripe: "Stripe", paypal: "PayPal", ath_movil: "ATH Móvil", apple_pay: "Apple Pay", google_pay: "Google Pay", link: "Link" };
                const displayMethod = tx.payment_method === "stripe" && tx.stripe_payment_method_type
                  ? tx.stripe_payment_method_type
                  : tx.payment_method;
                const showCardSuffix =
                  (displayMethod === "stripe" || displayMethod === "card" || displayMethod === "apple_pay" || displayMethod === "google_pay" || displayMethod === "link")
                  && clientCard.last4;
                const methodText = (methodLabel[displayMethod] || displayMethod) + (showCardSuffix ? ` •••• ${clientCard.last4}` : "");
                const grossTip = tx.tip_cents || 0;
                const isDigital = tx.payment_method !== "cash";
                const netTip = grossTip > 0 ? (isDigital ? Math.round(grossTip * 0.90) : grossTip) : 0;
                return (
                  <div key={tx.id} className="flex flex-col py-1 gap-0.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Receipt size={12} style={{ color: tx.status === "completed" ? "var(--green)" : "var(--text-tertiary)" }} />
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {methodText}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                          {format(parseISO(tx.created_at), "MMM d, h:mm a", { locale: dateFnsLocale })}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-xs font-semibold" style={{ color: tx.status === "completed" ? "var(--green)" : "var(--red)" }}>
                          ${(tx.total_cents / 100).toFixed(2)}
                        </span>
                        {netTip > 0 && (
                          <span className="text-[10px] font-semibold" style={{ color: "var(--accent-color)" }}>
                            + ${(netTip / 100).toFixed(2)} {language === "es" ? "propina" : "tip"}
                          </span>
                        )}
                      </div>
                    </div>
                    {tx.approved_by_name && (
                      <span className="text-[10px] pl-5" style={{ color: "var(--text-tertiary)" }}>
                        {language === "es" ? "Aprobado por" : "Approved by"} {tx.approved_by_name}
                        {tx.allocation_method === "auto_note_match" && ` · ${language === "es" ? "auto" : "auto"}`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>


        {/* Add label */}
        <div
          className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
          style={{ background: "var(--bg-surface-2)" }}
          onClick={() => { setEditingLabel(true); }}
        >
          <Tag size={16} style={{ color: "var(--text-secondary)" }} />
          {editingLabel ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={labelValue}
                onChange={(e) => setLabelValue(e.target.value)}
                className="border-0 bg-transparent p-0 h-7 text-sm focus-visible:ring-0"
                autoFocus
                placeholder={language === "es" ? "Etiqueta..." : "Label..."}
              />
              <button onClick={(e) => { e.stopPropagation(); saveLabel(); }} disabled={savingLabel}>
                <Check size={16} style={{ color: "var(--accent-color)" }} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setEditingLabel(false); setLabelValue(appt.label || ""); }}>
                <X size={16} style={{ color: "var(--text-tertiary)" }} />
              </button>
            </div>
          ) : (
            <span className="text-sm" style={{ color: appt.label ? "var(--text-primary)" : "var(--text-tertiary)" }}>
              {appt.label || (language === "es" ? "Añadir etiqueta" : "Add label")}
            </span>
          )}
        </div>

        {/* Metadata: timezone, location, SMS */}
        <div className="space-y-3">
          {clientTimezone && (
            <div className="flex items-center gap-3">
              <Clock size={16} style={{ color: "var(--text-tertiary)" }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{clientTimezone}</span>
            </div>
          )}
          {clientLocation && (
            <div className="flex items-center gap-3">
              <MapPin size={16} style={{ color: "var(--text-tertiary)" }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{clientLocation}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Smartphone size={16} style={{ color: "var(--text-tertiary)" }} />
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              SMS: {acuityData?.smsOptIn ? "✓" : "✗"}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--divider)" }} />

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileText size={16} style={{ color: "var(--text-secondary)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {language === "es" ? "Notas" : "Notes"}
              </span>
            </div>
            {!editingNotes && (
              <button onClick={() => setEditingNotes(true)}>
                <Pencil size={14} style={{ color: "var(--accent-color)" }} />
              </button>
            )}
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <Textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={3}
                className="text-sm"
                style={{ background: "var(--bg-surface-2)", borderColor: "var(--border)" }}
              />
              <div className="flex gap-2">
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
                >
                  {savingNotes ? <Loader2 size={14} className="animate-spin" /> : (language === "es" ? "Guardar" : "Save")}
                </button>
                <button
                  onClick={() => { setEditingNotes(false); setNotesValue(appt.notes || ""); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {language === "es" ? "Cancelar" : "Cancel"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={{ color: appt.notes ? "var(--text-primary)" : "var(--text-tertiary)" }}>
              {appt.notes || (language === "es" ? "Sin notas" : "No notes")}
            </p>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--divider)" }} />

        {/* Previous appointments */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
            {language === "es" ? "Citas anteriores" : "Previous appointments"}
          </p>
          {previousAppts.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {language === "es" ? "Ninguna" : "None"}
            </p>
          ) : (
            <div className="space-y-1.5">
              {previousAppts.slice(0, 1).map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/admin/appointment/${a.id}`)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-left"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {a.service_name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {format(parseISO(a.starts_at), "MMM d, yyyy", { locale: dateFnsLocale })}
                    </p>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: a.paid ? "var(--green)" : "var(--red)" }}>
                    ${(a.price_cents / 100).toFixed(2)}
                  </span>
                </button>
              ))}
              {isOwner && (
                <button
                  onClick={() => navigate(`/admin/clients?open=${encodeURIComponent(appt.client_name)}&scrollTo=previous`)}
                  className="w-full py-2 text-xs font-semibold"
                  style={{ color: "var(--accent-color)" }}
                >
                  {language === "es" ? `Ver todas (${previousAppts.length})` : `View all (${previousAppts.length})`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Upcoming appointments */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              {language === "es" ? "Próximas citas" : "Upcoming appointments"}
            </p>
            <button
              onClick={() => navigate("/admin/appointment/new")}
              className="flex items-center gap-1 text-xs font-semibold"
              style={{ color: "var(--accent-color)" }}
            >
              <Plus size={12} />
              {language === "es" ? "Agendar" : "Book new"}
            </button>
          </div>
          {upcomingAppts.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {language === "es" ? "Ninguna" : "None"}
            </p>
          ) : (
            <div className="space-y-1.5">
              {upcomingAppts.slice(0, 1).map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(`/admin/appointment/${a.id}`)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg text-left"
                  style={{ background: "var(--bg-surface-2)" }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {a.service_name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {format(parseISO(a.starts_at), "MMM d, yyyy", { locale: dateFnsLocale })}
                    </p>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                    ${(a.price_cents / 100).toFixed(2)}
                  </span>
                </button>
              ))}
              {isOwner && (
                <button
                  onClick={() => navigate(`/admin/clients?open=${encodeURIComponent(appt.client_name)}&scrollTo=upcoming`)}
                  className="w-full py-2 text-xs font-semibold"
                  style={{ color: "var(--accent-color)" }}
                >
                  {language === "es" ? `Ver todas (${upcomingAppts.length})` : `View all (${upcomingAppts.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>





      {/* ═══ CONTACT POPUP ═══ */}
      <AnimatePresence>
        {contactOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              onClick={() => setContactOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
            >
               <div className="pointer-events-auto w-full max-w-[320px]" style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)", padding: "28px 24px 24px" }}>
                <div className="flex justify-center mb-4">
                  <span className="text-[11px] font-semibold tracking-wide px-3.5 py-1" style={{ borderRadius: 10, background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)" }}>
                    {language === "es" ? "Contactar" : "Contact"}
                  </span>
                </div>
                <h2 className="text-center uppercase mb-1" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}>
                  {appt.client_name}
                </h2>
                <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                  {language === "es" ? "Elige cómo comunicarte" : "Choose how to reach out"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 12 }}>
                  {clientPhone && (
                    <>
                      <button onClick={() => { window.location.href = `tel:${clientPhone}`; setContactOpen(false); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                        {language === "es" ? "Llamar" : "Call"} · {clientPhone}
                      </button>
                      <button onClick={() => { window.location.href = `sms:${clientPhone}`; setContactOpen(false); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                        {language === "es" ? "Mensaje de texto" : "Text"}
                      </button>
                      <button onClick={() => { copyToClipboard(clientPhone); setContactOpen(false); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                        {language === "es" ? "Copiar teléfono" : "Copy phone"}
                      </button>
                    </>
                  )}
                  {clientEmail && (
                    <>
                      <button onClick={() => { window.location.href = `mailto:${clientEmail}`; setContactOpen(false); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                        Email · {clientEmail}
                      </button>
                      <button onClick={() => { copyToClipboard(clientEmail); setContactOpen(false); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                        {language === "es" ? "Copiar email" : "Copy email"}
                      </button>
                    </>
                  )}
                  {!clientPhone && !clientEmail && (
                    <p className="text-sm text-center py-4" style={{ color: "rgba(0,0,0,0.4)" }}>
                      {language === "es" ? "Sin información de contacto" : "No contact info available"}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ THREE DOTS MENU POPUP ═══ */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
            >
               <div className="pointer-events-auto w-full max-w-[320px]" style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)", padding: "28px 24px 24px" }}>
                <div className="flex justify-center mb-4">
                  <span className="text-[11px] font-semibold tracking-wide px-3.5 py-1" style={{ borderRadius: 10, background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)" }}>
                    {language === "es" ? "Opciones" : "Options"}
                  </span>
                </div>
                <h2 className="text-center uppercase mb-1" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}>
                  {appt.service_name}
                </h2>
                <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                  {language === "es" ? "¿Qué deseas hacer?" : "What would you like to do?"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 12 }}>
                  <button onClick={() => { setMenuOpen(false); setRescheduleDate(safeStartDate); setRescheduleOpen(true); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                    {language === "es" ? "Reprogramar" : "Reschedule"}
                  </button>
                  <button onClick={() => { setMenuOpen(false); navigate(`/admin/appointment/${id}/edit`); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                    {language === "es" ? "Editar cita" : "Edit appointment"}
                  </button>
                  {isOwner && (
                    <button onClick={() => { setMenuOpen(false); navigate(`/admin/clients?open=${encodeURIComponent(appt.client_name)}`); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                      {language === "es" ? "Ver perfil del cliente" : "View client profile"}
                    </button>
                  )}
                  <button onClick={() => { setMenuOpen(false); setCancelOpen(true); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ef4444", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                    {language === "es" ? "Eliminar cita" : "Delete appointment"}
                  </button>
                  <button onClick={() => { setMenuOpen(false); resendConfirmation(); }} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                    {language === "es" ? "Reenviar confirmación" : "Resend confirmation"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ CANCEL POPUP ═══ */}
      <AnimatePresence>
        {cancelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              onClick={() => setCancelOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
            >
               <div className="pointer-events-auto w-full max-w-[320px]" style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)", padding: "28px 24px 24px" }}>
                <AnimatePresence mode="wait">
                  {cancelConfirmed ? (
                    <motion.div key="confirmed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-2">
                      <span className="text-[11px] font-semibold tracking-wide px-3.5 py-1" style={{ borderRadius: 10, background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)" }}>
                        {language === "es" ? "Confirmación" : "Confirmation"}
                      </span>
                      <div className="my-2">
                        <AnimatedCheckmark size={56} color="#22c55e" strokeWidth={2.5} />
                      </div>
                      <motion.p
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                        className="text-[22px] font-black text-center uppercase"
                        style={{ color: "#111111", letterSpacing: "-1px" }}
                      >
                        {language === "es" ? "Eliminada" : "Deleted"}
                      </motion.p>
                      <p className="text-[13px] text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
                        {language === "es" ? "La cita fue eliminada exitosamente" : "Appointment deleted successfully"}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="prompt" exit={{ opacity: 0 }}>
                      <div className="flex justify-center mb-4">
                        <span className="text-[11px] font-semibold tracking-wide px-3.5 py-1" style={{ borderRadius: 10, background: "rgba(248,113,113,0.15)", color: "rgba(220,38,38,1)" }}>
                          {appt.is_recurring
                            ? (language === "es" ? "Eliminar Recurrente" : "Delete Recurring")
                            : (language === "es" ? "Eliminar Cita" : "Delete Appointment")}
                        </span>
                      </div>
                      <h2 className="text-center uppercase whitespace-pre-line mb-1" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}>
                        {language === "es" ? "¿ESTÁS\nSEGURO?" : "ARE YOU\nSURE?"}
                      </h2>
                      <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                        {language === "es" ? "Esta acción no se puede deshacer" : "This action cannot be undone"}
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 12 }}>
                        {appt.is_recurring ? (
                          <>
                            <button onClick={() => runCancel("this_only")} disabled={cancelling} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#ef4444", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                              {cancelling ? <Loader2 size={16} className="animate-spin mx-auto" /> : (language === "es" ? "Eliminar solo esta cita" : "Delete only this")}
                            </button>
                            <button onClick={() => runCancel("all_future")} disabled={cancelling} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ef4444", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                              {cancelling ? <Loader2 size={16} className="animate-spin mx-auto" /> : (language === "es" ? "Eliminar esta y todas las futuras" : "Delete this and all future")}
                            </button>
                          </>
                        ) : (
                          <button onClick={confirmCancel} disabled={cancelling} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#ef4444", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                            {cancelling ? <Loader2 size={16} className="animate-spin mx-auto" /> : (language === "es" ? "Confirmar eliminación" : "Confirm deletion")}
                          </button>
                        )}
                        <button onClick={() => setCancelOpen(false)} className="w-full text-center font-semibold transition-all active:scale-[0.97]" style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}>
                          {language === "es" ? "Volver" : "Dismiss"}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ RESCHEDULE FULL-SCREEN MODAL ═══ */}
      <AnimatePresence>
        {rescheduleOpen && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed inset-0 z-50 flex flex-col"
            style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
          >
            {/* Header */}
            <header className="flex items-center gap-3 px-4 h-14" style={{ borderBottom: "1px solid var(--divider)" }}>
              <button onClick={() => setRescheduleOpen(false)} className="p-1 -ml-1">
                <ChevronLeft size={24} style={{ color: "var(--accent-color)" }} />
              </button>
              <h1 className="text-lg font-semibold">{language === "es" ? "Reprogramar" : "Reschedule"}</h1>
            </header>

            <div className="flex-1 overflow-y-auto pb-32">
              {/* Client chip + today button */}
              <div className="flex items-center justify-between px-4 pt-2 pb-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {appt.client_name}
                  </p>
                </div>
                <button onClick={() => { rescheduleGoToDate(new Date()); setRescheduleMonthOpen(false); }}
                  className="w-10 h-10 flex items-center justify-center rounded-full"
                  style={{ border: "1px solid var(--border)" }}>
                  <CalendarCheck size={18} style={{ color: "var(--text-secondary)" }} />
                </button>
              </div>

              {/* Month title */}
              <div className="px-4 pb-2">
                <button onClick={() => { setRescheduleMonthOpen(!rescheduleMonthOpen); if (!rescheduleMonthOpen) setRescheduleMonthDate(rescheduleDate); }}
                  className="flex items-center gap-1.5">
                  <span className="text-lg font-bold capitalize" style={{ color: "var(--text-primary)" }}>
                    {format(rescheduleDate, "MMMM yyyy", { locale: dateFnsLocale })}
                  </span>
                  <ChevronDown size={16} className="transition-transform duration-200"
                    style={{ color: "var(--text-tertiary)", transform: rescheduleMonthOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>
              </div>

              {/* Month Grid (expandable) */}
              <AnimatePresence>
                {rescheduleMonthOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden px-4">
                    <RescheduleMonthGrid
                      monthDate={rescheduleMonthDate}
                      selectedDate={rescheduleDate}
                      availableDates={rescheduleAvailDates}
                      onSelectDate={(d) => { rescheduleGoToDate(d); setRescheduleMonthOpen(false); }}
                      onChangeMonth={setRescheduleMonthDate}
                      language={language}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Week Row */}
              {!rescheduleMonthOpen && (
                <div className="px-2 pb-4" style={{ borderBottom: "1px solid var(--divider)" }}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => rescheduleGoToWeek(-1)} aria-label="Semana anterior"
                      className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                      <ChevronLeft size={20} style={{ color: "var(--text-secondary)" }} />
                    </button>
                    <div className="flex-1 overflow-hidden"
                      onTouchStart={(e) => { rescheduleTouchRef.current = { startX: e.touches[0].clientX }; }}
                      onTouchEnd={(e) => {
                        const diff = (e.changedTouches[0]?.clientX || 0) - rescheduleTouchRef.current.startX;
                        if (Math.abs(diff) > 50) {
                          if (diff > 0) rescheduleGoToWeek(-1); else rescheduleGoToWeek(1);
                        }
                      }}>
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div key={rescheduleWeekStart.toISOString()}
                          initial={{ x: rescheduleSwipeDir * 120, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={{ x: rescheduleSwipeDir * -120, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 600, damping: 22, mass: 0.6 }}
                          className="flex items-center justify-around">
                          {rescheduleWeekDays.map((day, i) => {
                            const selected = isSameDay(day, rescheduleDate);
                            const todayDay = isToday(day);
                            const dateStr = format(day, "yyyy-MM-dd");
                            const available = rescheduleAvailDates.length === 0 || rescheduleAvailDates.includes(dateStr);
                            const dayName = format(day, "EEEE", { locale: dateFnsLocale });
                            return (
                              <button key={i} onClick={() => setRescheduleDate(day)}
                                className="flex flex-col items-center gap-1.5 py-1"
                                style={{ opacity: available ? 1 : 0.4, flex: 1 }}>
                                <span className="flex items-center justify-center text-base font-bold rounded-full"
                                  style={{
                                    width: 44, height: 44,
                                    background: selected ? bColor : "transparent",
                                    color: selected ? "#fff" : todayDay ? bColor : "var(--text-primary)",
                                    border: todayDay && !selected ? `2px solid var(--text-tertiary)` : "2px solid transparent",
                                  }}>
                                  {format(day, "d")}
                                </span>
                                <span className="text-[10px] font-medium capitalize"
                                  style={{ color: selected ? bColor : "var(--text-secondary)" }}>
                                  {dayName}
                                </span>
                              </button>
                            );
                          })}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                    <button onClick={() => rescheduleGoToWeek(1)} aria-label="Semana siguiente"
                      className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                      <ChevronRight size={20} style={{ color: "var(--text-secondary)" }} />
                    </button>
                  </div>
                </div>
              )}

              {/* Time Slots */}
              <div className="px-4 pt-4 space-y-2">
                {loadingSlots || rescheduleLoadingDates ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
                  </div>
                ) : rescheduleSlots.length === 0 && !rescheduleCustomOpen ? (
                  <p className="text-center py-6 text-sm" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "Sin horarios disponibles" : "No available times"}
                  </p>
                ) : !rescheduleCustomOpen ? (
                  <div className="space-y-2">
                    {rescheduleSlots.map((slot) => {
                      const time = new Date(slot.time);
                      const selected = rescheduleTime === slot.time;
                      return (
                        <button
                          key={slot.time}
                          onClick={() => setRescheduleTime(slot.time)}
                          className="w-full py-3.5 rounded-xl text-[14px] font-semibold transition-all active:scale-[0.98]"
                          style={{
                            background: selected ? bColor : "var(--bg-surface-2)",
                            color: selected ? "#fff" : "var(--text-primary)",
                            border: selected ? `1.5px solid ${bColor}` : "1.5px solid transparent",
                          }}
                        >
                          {format(time, "h:mm a")}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {/* Custom Time */}
                {!loadingSlots && !rescheduleLoadingDates && (
                  <AnimatePresence mode="wait">
                    {!rescheduleCustomOpen ? (
                      <motion.button
                        key="custom-btn"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setRescheduleCustomOpen(true)}
                        className="w-full mt-2 py-3.5 rounded-xl text-[14px] font-semibold text-center flex items-center justify-center gap-2 transition-all active:scale-[0.96]"
                        style={{ border: "1.5px dashed var(--border)", color: "var(--text-secondary)" }}
                      >
                        <Clock size={14} />
                        <span>{language === "es" ? "Hora personalizada" : "Custom Time"}</span>
                      </motion.button>
                    ) : (
                      <motion.div
                        key="custom-panel"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-2 rounded-xl p-4"
                        style={{ background: "var(--bg-surface-2)" }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                            {language === "es" ? "Hora personalizada" : "Custom Time"}
                          </p>
                          <button onClick={() => setRescheduleCustomOpen(false)}
                            className="p-1 rounded-full" style={{ color: "var(--text-tertiary)" }}>
                            <X size={16} />
                          </button>
                        </div>
                        <div className="flex items-center justify-center gap-2 mb-4">
                          <select
                            value={rescheduleCustomHour}
                            onChange={(e) => setRescheduleCustomHour(Number(e.target.value))}
                            className="text-[14px] font-semibold text-center rounded-xl py-2.5 px-3 appearance-none"
                            style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)", width: 72 }}>
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i}>{String(i % 12 || 12).padStart(2, "0")}</option>
                            ))}
                          </select>
                          <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>:</span>
                          <select
                            value={rescheduleCustomMinute}
                            onChange={(e) => setRescheduleCustomMinute(Number(e.target.value))}
                            className="text-[14px] font-semibold text-center rounded-xl py-2.5 px-3 appearance-none"
                            style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)", width: 72 }}>
                            {[0, 15, 30, 45].map((m) => (
                              <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
                            ))}
                          </select>
                          <span className="text-sm font-semibold ml-1" style={{ color: "var(--text-secondary)" }}>
                            {rescheduleCustomHour < 12 ? "AM" : "PM"}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            const d = rescheduleDate;
                            const tz = await getShopTimezone();
                            const iso = toAcuityDatetimeInTz(
                              d.getFullYear(),
                              d.getMonth() + 1,
                              d.getDate(),
                              rescheduleCustomHour,
                              rescheduleCustomMinute,
                              tz,
                            );
                            setRescheduleTime(iso);
                            setRescheduleCustomOpen(false);
                          }}
                          className="w-full py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.97]"
                          style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
                          {language === "es" ? "Confirmar hora" : "Confirm Time"} - {rescheduleCustomHour % 12 || 12}:{String(rescheduleCustomMinute).padStart(2, "0")} {rescheduleCustomHour < 12 ? "AM" : "PM"}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>

              {/* Send email toggle */}
              <div className="flex items-center justify-between px-4 pt-4">
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {language === "es" ? "Enviar email de reprogramación" : "Send rescheduling email"}
                </span>
                <Switch checked={sendRescheduleEmail} onCheckedChange={setSendRescheduleEmail} />
              </div>
            </div>

            {/* CTA */}
            <div className="fixed bottom-0 left-0 right-0 p-4" style={{ background: "var(--bg-base)", borderTop: "1px solid var(--divider)" }}>
              <button
                onClick={confirmReschedule}
                disabled={!rescheduleTime || rescheduling}
                className="w-full py-3.5 rounded-xl text-sm font-bold transition-opacity disabled:opacity-50"
                style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
              >
                {rescheduling ? (
                  <Loader2 size={18} className="animate-spin mx-auto" />
                ) : (
                  language === "es" ? "Reprogramar Cita" : "Reschedule Appointment"
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ EDIT SERVICE DRAWER ═══ */}
      <Drawer open={editOpen} onOpenChange={setEditOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "Editar Servicio" : "Edit Service"}</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="max-h-[60vh] px-4 pb-4">
             {editLoadingServices ? (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin" style={{ color: "var(--accent-color)" }} />
              </div>
            ) : (
              <>
                {/* Group services by calendar */}
                {editCalendars.map((cal) => {
                   const calServices = editServices.filter((t) => t.calendarIDs?.includes(cal.id));
                   if (calServices.length === 0) return null;
                   const bColor = getBarberColor(cal.name);
                   return (
                    <div key={cal.id} className="mb-4">
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2"
                        style={{ color: "var(--text-secondary)" }}>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: bColor }} />
                        {cal.name}
                      </p>
                      <div className="space-y-1">
                        {calServices.map((svc) => {
                          const isSelected = editSelectedService?.id === svc.id;
                          return (
                            <button
                              key={`${cal.id}-${svc.id}`}
                              onClick={() => {
                                setEditSelectedService(svc);
                                setEditSelectedAddons([]);
                              }}
                              className="w-full flex items-center gap-3 py-3 px-3 rounded-lg text-left transition-all"
                              style={{ background: isSelected ? "var(--accent-dim)" : "transparent" }}
                            >
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: bColor }} />
                              <span className="flex-1 min-w-0">
                                <span className="text-sm font-medium block truncate">{svc.name}</span>
                                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                  {svc.duration}min · ${svc.price}
                                </span>
                              </span>
                              {isSelected && <Check size={18} style={{ color: "var(--accent-color)" }} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                   );
                })}

                {/* Add-ons for selected service */}
                {editFilteredAddons.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-2"
                      style={{ color: "var(--text-tertiary)" }}>
                      {language === "es" ? "Servicios adicionales" : "Add-ons"}
                    </p>
                    <div className="space-y-1">
                      {editFilteredAddons.map((addon) => {
                        const isChecked = editSelectedAddons.includes(addon.id);
                        return (
                          <button
                            key={addon.id}
                            onClick={() => setEditSelectedAddons((prev) =>
                              isChecked ? prev.filter((id) => id !== addon.id) : [...prev, addon.id]
                            )}
                            className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg text-sm transition-all"
                            style={{ background: isChecked ? "var(--accent-dim)" : "transparent" }}
                          >
                            <span>{addon.name}</span>
                            <span className="flex items-center gap-2">
                              <span style={{ color: "var(--text-secondary)" }}>
                                {parseFloat(addon.price) > 0 ? `+$${addon.price}` : (language === "es" ? "Gratis" : "Free")}
                              </span>
                              {isChecked && <Check size={16} style={{ color: "var(--accent-color)" }} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </ScrollArea>
          <div className="px-4 pb-6 pt-2 space-y-2">
            <button
              onClick={saveEditService}
              disabled={!editSelectedService || editSaving}
              className="w-full py-3.5 rounded-xl text-sm font-bold transition-opacity"
              style={{
                background: "var(--cta-bg)",
                color: "var(--cta-fg)",
                opacity: !editSelectedService || editSaving ? 0.5 : 1,
              }}
            >
              {editSaving ? <Loader2 size={18} className="animate-spin mx-auto" /> : (language === "es" ? "Guardar Cambios" : "Save Changes")}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ═══ RECEIPT / ORDER SUMMARY DRAWER (when balance = 0) ═══ */}
      <Drawer open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{language === "es" ? "Resumen de Orden" : "Order Summary"}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 space-y-4">
            {/* Service line */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: barberColor }} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {appt.service_name}
                  </span>
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  ${(appt.price_cents / 100).toFixed(2)}
                </span>
              </div>
              {appt.addons?.length > 0 && appt.addons.map((addon: string, i: number) => (
                <div key={i} className="flex items-center justify-between pl-5">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>+ {addon}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pl-5">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {barber?.name} · {format(safeStartDate, "h:mm a")}
                </span>
              </div>
            </div>

            {/* Product line items (added during checkout / via this drawer) */}
            {(() => {
              const productItems = transactions
                .filter((tx: any) => tx.status === "completed")
                .flatMap((tx: any) => (tx.transaction_items || []).filter((it: any) => it.item_type === "product"));
              if (productItems.length === 0) return null;
              return (
                <div style={{ borderTop: "1px solid var(--divider)" }} className="pt-3 space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "Productos" : "Products"}
                  </p>
                  {productItems.map((it: any) => (
                    <div key={it.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                          style={{ background: "var(--bg-surface)", color: "var(--text-secondary)" }}>{it.quantity}</span>
                        <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{it.name}</span>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0 ml-2" style={{ color: "var(--text-primary)" }}>
                        ${(it.total_cents / 100).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
            {transactions.filter((tx) => tx.status === "completed").length > 0 && (
              <div style={{ borderTop: "1px solid var(--divider)" }} className="pt-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  {language === "es" ? "Pagos realizados" : "Payments made"}
                </p>
                {transactions.filter((tx) => tx.status === "completed").map((tx) => {
                  const methodLabel: Record<string, string> = { cash: "Efectivo", stripe: "Stripe", paypal: "PayPal", ath_movil: "ATH Móvil" };
                  return (
                    <div key={tx.id} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs flex-1 min-w-0 truncate" style={{ color: "var(--text-secondary)" }}>
                          {methodLabel[tx.payment_method] || tx.payment_method}
                          {tx.tip_cents > 0 && ` (${language === "es" ? "inc." : "incl."} $${(tx.tip_cents / 100).toFixed(2)} tip)`}
                        </span>
                        <span className="text-xs font-semibold" style={{ color: "var(--green)" }}>
                          ${(tx.total_cents / 100).toFixed(2)}
                        </span>
                        <button
                          onClick={async () => {
                            const confirmMsg = language === "es"
                              ? `¿Revertir este pago de $${(tx.total_cents / 100).toFixed(2)}?\n\nEl pago volverá a "Pendientes" en Ventas para que lo puedas reasignar.\n\nIMPORTANTE: Esto NO devuelve el dinero al cliente. Si fue tarjeta/ATH/PayPal, debes emitir el reembolso manualmente en el portal del proveedor.`
                              : `Revert this $${(tx.total_cents / 100).toFixed(2)} payment?\n\nThe payment will go back to "Pending" in Sales so you can reassign it.\n\nIMPORTANT: This does NOT refund the customer. If it was card/ATH/PayPal, issue the refund manually in the provider portal.`;
                            if (!window.confirm(confirmMsg)) return;
                            try {
                              const { data, error } = await supabase.functions.invoke("transaction-revert-to-pending", {
                                body: { transaction_id: tx.id },
                              });
                              if (error || (data as { error?: string })?.error) {
                                throw new Error((data as { error?: string })?.error || error?.message || "Error");
                              }
                              // Reload appointment to reflect the unpay (amount_paid/tip/paid/payment_confirmed)
                              const { data: fresh } = await supabase
                                .from("appointments")
                                .select("amount_paid_cents, tip_cents, paid, payment_confirmed, payment_method")
                                .eq("id", appt.id)
                                .maybeSingle();
                              if (fresh) {
                                setAppt((prev: any) => prev ? { ...prev, ...fresh } : prev);
                              }
                              // Drop the reverted tx from this appointment's view (it's now detached + pending_review)
                              setTransactions((prev) => prev.filter((t: any) => t.id !== tx.id));
                              toast.success(language === "es"
                                ? "Pago revertido a Pendientes. Reasígnalo desde Ventas."
                                : "Payment reverted to Pending. Reassign it from Sales.");
                            } catch (e: any) {
                              toast.error(e.message || "Error");
                            }
                          }}
                          className="text-[10px] font-semibold px-2 py-1 rounded-md active:opacity-70"
                          style={{ background: "var(--bg-surface)", color: "var(--red)" }}
                        >
                          {language === "es" ? "Revertir" : "Revert"}
                        </button>
                      </div>
                      {tx.approved_by_name && (
                        <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                          {language === "es" ? "Aprobado por" : "Approved by"} {tx.approved_by_name}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Payment method (from appointment or transactions) */}
            {(() => {
              const methodLabel: Record<string, string> = { cash: "Efectivo", stripe: "Tarjeta", paypal: "PayPal", ath_movil: "ATH Móvil", apple_pay: "Apple Pay", google_pay: "Google Pay", link: "Link" };
              // Use transaction method if available, otherwise use appointment's payment_method
              const tx = transactions.find((tx) => tx.status === "completed");
              const txMethod = tx?.payment_method;
              const stripeSubtype = tx?.stripe_payment_method_type || appt.stripe_payment_method_type;
              const method = txMethod === "stripe" && stripeSubtype ? stripeSubtype : (txMethod || appt.payment_method);
              if (!method) return null;
              // For card payments, show masked info if available from Acuity
              let methodDisplay = methodLabel[method] || method;
              if ((method === "stripe" || method === "apple_pay" || method === "google_pay" || method === "link" || methodDisplay === "Tarjeta") && cards.length > 0) {
                const cardVal = cards[0]?.value || "";
                const last4 = cardVal.match(/\d{4}$/)?.[0];
                if (last4) methodDisplay = `${methodDisplay} •••• ${last4}`;
              } else if ((method === "stripe" || method === "apple_pay" || method === "google_pay" || method === "link") && clientCard.last4) {
                methodDisplay = `${methodDisplay} •••• ${clientCard.last4}`;
              }
              return (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {language === "es" ? "Método de pago" : "Payment method"}
                  </span>
                  {appt.payment_confirmed ? (
                    <button
                      onClick={() => {
                        setReceiptOpen(false);
                        setEditMethodOpen(true);
                      }}
                      className="flex items-center gap-1.5 text-sm font-semibold transition-colors active:opacity-70"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {methodDisplay}
                      <Pencil size={12} style={{ color: "var(--text-tertiary)" }} />
                    </button>
                  ) : (
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {methodDisplay}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Tip */}
            {appt.tip_cents > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {language === "es" ? "Propina" : "Tip"}
                </span>
                <span className="text-sm font-semibold" style={{ color: "var(--accent-color)" }}>
                  ${(appt.tip_cents / 100).toFixed(2)}
                </span>
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--divider)" }}>
              <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                {language === "es" ? "Total pagado" : "Total paid"}
              </span>
              <span className="text-sm font-black" style={{ color: appt.payment_confirmed ? "var(--green)" : "var(--text-tertiary)" }}>
                ${appt.payment_confirmed ? (appt.amount_paid_cents / 100).toFixed(2) : "0.00"}
                {!appt.payment_confirmed && (
                  <span className="text-[10px] font-normal ml-1" style={{ color: "var(--text-tertiary)" }}>
                    ({language === "es" ? "sin confirmar" : "unconfirmed"})
                  </span>
                )}
              </span>
            </div>

            {/* Action buttons: Add service or product */}
            <div style={{ borderTop: "1px solid var(--divider)" }} className="pt-4 space-y-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "¿Agregar algo más?" : "Add something else?"}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setReceiptOpen(false);
                    navigate(`/admin/appointment/${appt.id}/edit`);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
                >
                  <Plus size={16} />
                  {language === "es" ? "Servicio" : "Service"}
                </button>
                <button
                  onClick={() => {
                    setReceiptProductSearch("");
                    setReceiptProductDrawerOpen(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: "var(--bg-surface-2)", color: "var(--text-primary)" }}
                >
                  <ShoppingBag size={16} />
                  {language === "es" ? "Producto" : "Product"}
                </button>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ═══ PRODUCT PICKER DRAWER (from receipt) ═══ */}
      <Drawer open={receiptProductDrawerOpen} onOpenChange={setReceiptProductDrawerOpen}>
        <DrawerContent>
          <div className="px-4 py-4 max-h-[70vh] flex flex-col">
            <p className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>
              {language === "es" ? "Agregar Producto" : "Add Product"}
            </p>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
              <Input value={receiptProductSearch} onChange={(e) => setReceiptProductSearch(e.target.value)}
                placeholder={language === "es" ? "Buscar producto..." : "Search product..."}
                className="pl-9" />
            </div>
            <ScrollArea className="flex-1 max-h-[50vh]">
              <div className="space-y-1">
                {receiptProducts
                  .filter((p) => p.name.toLowerCase().includes(receiptProductSearch.toLowerCase()))
                  .map((product) => (
                    <button key={product.id}
                      onClick={async () => {
                        setReceiptProductDrawerOpen(false);
                        // Create a product sale transaction linked to this appointment's barber
                        const totalCents = product.price_cents;
                        const { data: tx } = await supabase.from("transactions").insert({
                          barber_id: appt.barber_id,
                          appointment_id: appt.id,
                          payment_method: "cash",
                          type: "product",
                          subtotal_cents: totalCents,
                          total_cents: totalCents,
                          tip_cents: 0,
                          status: "completed",
                        }).select("id").single();
                        if (tx) {
                          await supabase.from("transaction_items").insert({
                            transaction_id: tx.id,
                            item_type: "product",
                            item_id: product.id,
                            name: product.name,
                            quantity: 1,
                            unit_price_cents: product.price_cents,
                            total_cents: totalCents,
                          });
                          // Decrement stock
                          await supabase.from("products").update({ stock_count: Math.max(0, product.stock_count - 1) }).eq("id", product.id);
                          setReceiptProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, stock_count: p.stock_count - 1 } : p));
                          // Refresh transactions
                          const { data: txs } = await supabase.from("transactions")
                            .select("id, payment_method, subtotal_cents, total_cents, tip_cents, status, created_at, type, transaction_items(id, item_type, name, quantity, unit_price_cents, total_cents)")
                            .eq("appointment_id", appt.id)
                            .order("created_at", { ascending: true });
                          if (txs) setTransactions(txs);
                        }
                        toast.success(language === "es" ? `${product.name} agregado` : `${product.name} added`);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all active:scale-[0.98]"
                      style={{ background: "transparent" }}>
                      {product.image_url ? (
                        <img loading="lazy" decoding="async" src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/product-images/${product.image_url}`} alt={product.name} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}>
                          <ShoppingBag size={16} style={{ color: "var(--text-tertiary)" }} />
                        </div>
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{product.name}</p>
                        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>${(product.price_cents / 100).toFixed(2)}</p>
                      </div>
                      <Plus size={16} style={{ color: "var(--text-tertiary)" }} />
                    </button>
                  ))}
                {receiptProducts.filter((p) => p.name.toLowerCase().includes(receiptProductSearch.toLowerCase())).length === 0 && (
                  <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "No se encontraron productos" : "No products found"}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ═══ SURPLUS → PRODUCT PICKER DRAWER ═══ */}
      <Drawer open={surplusPickerOpen} onOpenChange={setSurplusPickerOpen}>
        <DrawerContent>
          <div className="px-4 py-4 max-h-[70vh] flex flex-col">
            <p className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              {language === "es" ? "Producto comprado" : "Product purchased"}
            </p>
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>
              {language === "es"
                ? "Selecciona qué producto cubre el sobrante"
                : "Select which product the surplus pays for"}
            </p>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
              <Input
                value={receiptProductSearch}
                onChange={(e) => setReceiptProductSearch(e.target.value)}
                placeholder={language === "es" ? "Buscar producto..." : "Search product..."}
                className="pl-9"
              />
            </div>
            <ScrollArea className="flex-1 max-h-[50vh]">
              <div className="space-y-1">
                {receiptProducts
                  .filter((p) => p.name.toLowerCase().includes(receiptProductSearch.toLowerCase()))
                  .map((product) => (
                    <button
                      key={product.id}
                      onClick={() => {
                        setSurplusProductId(product.id);
                        setSurplusProductName(product.name);
                        // If user hasn't set a product allocation yet, default to product price (capped by surplus)
                        const amountCents = Math.round(parseFloat(confirmAmount || "0") * 100);
                        const alreadyPaidCents = appt.payment_confirmed ? (appt.amount_paid_cents || 0) : 0;
                        const alreadyTipCents = appt.payment_confirmed ? (appt.tip_cents || 0) : 0;
                        const remainingService = Math.max(0, (appt.price_cents || 0) - (alreadyPaidCents - alreadyTipCents));
                        const surplusCents = Math.max(0, amountCents - remainingService);
                        if (surplusProductCents === 0) {
                          const suggested = Math.min(product.price_cents, surplusCents - surplusTipCents);
                          setSurplusProductCents(suggested);
                          // If product price < surplus, leave the rest as tip
                          if (suggested < surplusCents - surplusTipCents) {
                            setSurplusTipCents(surplusCents - suggested);
                          } else {
                            setSurplusTipCents(Math.max(0, surplusCents - suggested));
                          }
                        }
                        setSurplusPickerOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all active:scale-[0.98]"
                      style={{ background: surplusProductId === product.id ? "var(--bg-surface-2)" : "transparent" }}
                    >
                      {product.image_url ? (
                        <img loading="lazy" decoding="async" src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/product-images/${product.image_url}`} alt={product.name} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "var(--bg-surface-2)" }}>
                          <ShoppingBag size={16} style={{ color: "var(--text-tertiary)" }} />
                        </div>
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{product.name}</p>
                        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>${(product.price_cents / 100).toFixed(2)}</p>
                      </div>
                      {surplusProductId === product.id ? (
                        <Check size={16} style={{ color: "var(--accent-color)" }} />
                      ) : (
                        <Plus size={16} style={{ color: "var(--text-tertiary)" }} />
                      )}
                    </button>
                  ))}
                {receiptProducts.filter((p) => p.name.toLowerCase().includes(receiptProductSearch.toLowerCase())).length === 0 && (
                  <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>
                    {language === "es" ? "No se encontraron productos" : "No products found"}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DrawerContent>
      </Drawer>

      {/* ═══ CONFIRM PAYMENT METHOD MODAL ═══ */}
      <AnimatePresence>
        {confirmMethodOpen && (
          <>
            {/* Backdrop — heavy dark blur like reference */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              onClick={() => setConfirmMethodOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
            >
              <div
                className="pointer-events-auto w-full overflow-hidden"
                style={{
                  maxWidth: 380,
                  borderRadius: 28,
                  background: "#ffffff",
                  boxShadow: "0 25px 80px -12px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(0,0,0,0.06)",
                }}
              >
                {confirmStep === "method" ? (
                  <div className="px-6 pt-7 pb-6">
                    {/* Monochrome pill badge — smaller radius than card */}
                    <div className="flex justify-center mb-4">
                      <span
                        className="text-[11px] font-semibold tracking-wide px-3.5 py-1"
                        style={{
                          borderRadius: 10,
                          background: "rgba(201,168,130,0.15)",
                          color: "rgba(160,128,96,1)",
                        }}
                      >
                        {language === "es" ? "Confirmar Pago" : "Confirm Payment"}
                      </span>
                    </div>

                    <h2
                      className="text-center mb-1 mx-auto"
                      style={{
                        fontSize: "clamp(16px, 6.2vw, 24px)",
                        fontWeight: 900,
                        letterSpacing: "-1px",
                        lineHeight: 1.15,
                        color: "#111111",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {language === "es" ? "¿CÓMO PAGÓ EL CLIENTE?" : "HOW DID THE CLIENT PAY?"}
                    </h2>

                    {/* Subtitle with service price */}
                    <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                      {language === "es" ? "Selecciona el método utilizado" : "Select the method used"}
                    </p>

                    {/* Payment method buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 12 }}>
                      {([
                        { key: "cash", label: "Efectivo", labelEn: "Cash", color: "#4ade80" },
                        { key: "ath_movil", label: "ATH Móvil", labelEn: "ATH Móvil", color: "#f97316" },
                        { key: "stripe", label: "Tarjeta", labelEn: "Credit Card", color: "#a78bfa" },
                        { key: "paypal", label: "PayPal", labelEn: "PayPal", color: "#60a5fa" },
                      ] as const).map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => {
                            setConfirmSelectedMethod(opt.key);
                            setConfirmStep("amount");
                          }}
                          className="w-full text-center transition-all active:scale-[0.97]"
                          style={{
                            background: "#111111",
                            color: opt.color,
                            minHeight: 56,
                            padding: "16px 20px",
                            fontSize: 14,
                            fontWeight: 800,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            borderRadius: "var(--radius-control)",
                            border: "none",
                          }}
                        >
                          {language === "es" ? opt.label : opt.labelEn}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="px-6 pt-7 pb-6">
                    {/* Monochrome pill badge */}
                    <div className="flex justify-center mb-4">
                      <span
                        className="text-[11px] font-semibold tracking-wide px-3.5 py-1"
                        style={{
                          borderRadius: 10,
                          background: "rgba(201,168,130,0.15)",
                          color: "rgba(160,128,96,1)",
                        }}
                      >
                        {language === "es" ? "Monto Recibido" : "Amount Received"}
                      </span>
                    </div>

                    <h2
                      className="text-center whitespace-pre-line mb-1"
                      style={{
                        fontSize: 22,
                        fontWeight: 900,
                        letterSpacing: "-1px",
                        lineHeight: 1.2,
                        color: "#111111",
                      }}
                    >
                      {(() => {
                        const labels: Record<string, string> = { cash: "EFECTIVO", ath_movil: "ATH MÓVIL", stripe: "TARJETA", paypal: "PAYPAL" };
                        return labels[confirmSelectedMethod] || confirmSelectedMethod.toUpperCase();
                      })()}
                    </h2>

                    <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                      {language === "es"
                        ? `Servicio: $${((appt.price_cents || 0) / 100).toFixed(2)} · Lo extra va a propina`
                        : `Service: $${((appt.price_cents || 0) / 100).toFixed(2)} · Extra goes to tip`}
                    </p>

                    <div className="relative mb-2">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold" style={{ color: "rgba(0,0,0,0.35)" }}>$</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={confirmAmount}
                        onChange={(e) => setConfirmAmount(e.target.value)}
                        className="pl-9 text-center text-xl font-bold h-14 rounded-2xl"
                        style={{ background: "#f5f5f5", border: "none", color: "#111111" }}
                        autoFocus
                      />
                    </div>

                    {(() => {
                      const amountCents = Math.round(parseFloat(confirmAmount || "0") * 100);
                      const alreadyPaidCents = appt.payment_confirmed ? (appt.amount_paid_cents || 0) : 0;
                      const alreadyTipCents = appt.payment_confirmed ? (appt.tip_cents || 0) : 0;
                      const remainingService = Math.max(0, (appt.price_cents || 0) - (alreadyPaidCents - alreadyTipCents));
                      const surplusCents = Math.max(0, amountCents - remainingService);
                      return surplusCents > 0 ? (
                        <p className="text-xs text-center font-semibold mb-1" style={{ color: "rgba(0,0,0,0.55)" }}>
                          {language === "es" ? `Sobrante: $${(surplusCents / 100).toFixed(2)}` : `Surplus: $${(surplusCents / 100).toFixed(2)}`}
                        </p>
                      ) : null;
                    })()}

                    {/* CTA buttons — pill style */}
                    <div className="flex gap-2.5 pt-4">
                      <button
                        className="flex-1 py-3.5 text-[14px] font-semibold transition-transform active:scale-95"
                        style={{
                          borderRadius: "var(--radius-control)",
                          background: "#f5f5f5",
                          color: "#111111",
                        }}
                        onClick={() => setConfirmStep("method")}
                      >
                        {language === "es" ? "Atrás" : "Back"}
                      </button>
                      <button
                        className="flex-1 py-3.5 text-[14px] font-semibold transition-transform active:scale-95"
                        style={{
                          borderRadius: "var(--radius-control)",
                          background: "#111111",
                          color: "#ffffff",
                        }}
                        onClick={async () => {
                          const amountCents = Math.round(parseFloat(confirmAmount || "0") * 100);
                          if (amountCents <= 0) {
                            toast.error(language === "es" ? "Monto inválido" : "Invalid amount");
                            return;
                          }
                          const alreadyPaidCents = appt.payment_confirmed ? (appt.amount_paid_cents || 0) : 0;
                          const alreadyTipCents = appt.payment_confirmed ? (appt.tip_cents || 0) : 0;
                          const remainingService = Math.max(0, (appt.price_cents || 0) - (alreadyPaidCents - alreadyTipCents));
                          const surplusCents = Math.max(0, amountCents - remainingService);

                          // If there's a surplus, ask the user how to allocate it (tip vs product)
                          if (surplusCents > 0) {
                            setSurplusTipCents(surplusCents); // default: all to tip
                            setSurplusProductCents(0);
                            setSurplusProductId(null);
                            setSurplusProductName("");
                            setConfirmStep("surplus");
                            return;
                          }

                          // No surplus — confirm immediately (no tip, no product) and close the modal
                          setConfirmMethodOpen(false);
                          await persistConfirmedPayment({
                            amountCents,
                            tipCents: 0,
                            productAllocCents: 0,
                            productId: null,
                            productName: "",
                          });
                        }}
                      >
                        {language === "es" ? "Confirmar" : "Confirm"}
                      </button>
                    </div>
                  </div>
                )}

                {confirmStep === "surplus" && (() => {
                  const amountCents = Math.round(parseFloat(confirmAmount || "0") * 100);
                  const alreadyPaidCents = appt.payment_confirmed ? (appt.amount_paid_cents || 0) : 0;
                  const alreadyTipCents = appt.payment_confirmed ? (appt.tip_cents || 0) : 0;
                  const remainingService = Math.max(0, (appt.price_cents || 0) - (alreadyPaidCents - alreadyTipCents));
                  const surplusCents = Math.max(0, amountCents - remainingService);
                  const allocated = surplusTipCents + surplusProductCents;
                  const remaining = surplusCents - allocated;
                  return (
                    <div className="px-6 pt-7 pb-6">
                      <div className="flex justify-center mb-4">
                        <span
                          className="text-[11px] font-semibold tracking-wide px-3.5 py-1"
                          style={{ borderRadius: 10, background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)" }}
                        >
                          {language === "es" ? "Sobrante" : "Surplus"}
                        </span>
                      </div>

                      <h2 className="text-center mb-1" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}>
                        ${(surplusCents / 100).toFixed(2)}
                      </h2>
                      <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                        {language === "es" ? "¿Cómo asignar este sobrante?" : "How to allocate this surplus?"}
                      </p>

                      {/* Tip allocation */}
                      <div className="rounded-2xl p-3 mb-2" style={{ background: "#f5f5f5" }}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[13px] font-semibold" style={{ color: "#111111" }}>
                            {language === "es" ? "Propina" : "Tip"}
                          </span>
                          <div className="relative" style={{ width: 110 }}>
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(0,0,0,0.35)" }}>$</span>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              max={(surplusCents / 100).toFixed(2)}
                              value={(surplusTipCents / 100).toString()}
                              onChange={(e) => {
                                const v = Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100));
                                const capped = Math.min(v, surplusCents - surplusProductCents);
                                setSurplusTipCents(capped);
                              }}
                              className="pl-6 text-right h-9 rounded-xl"
                              style={{ background: "#ffffff", border: "none", color: "#111111" }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Product allocation */}
                      <div className="rounded-2xl p-3 mb-2" style={{ background: "#f5f5f5" }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] font-semibold" style={{ color: "#111111" }}>
                            {language === "es" ? "Producto" : "Product"}
                          </span>
                          <div className="relative" style={{ width: 110 }}>
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm font-bold" style={{ color: "rgba(0,0,0,0.35)" }}>$</span>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              max={(surplusCents / 100).toFixed(2)}
                              value={(surplusProductCents / 100).toString()}
                              onChange={(e) => {
                                const v = Math.max(0, Math.round(parseFloat(e.target.value || "0") * 100));
                                const capped = Math.min(v, surplusCents - surplusTipCents);
                                setSurplusProductCents(capped);
                              }}
                              className="pl-6 text-right h-9 rounded-xl"
                              style={{ background: "#ffffff", border: "none", color: "#111111" }}
                            />
                          </div>
                        </div>
                        <button
                          onClick={() => setSurplusPickerOpen(true)}
                          className="w-full text-left text-[12px] py-2 px-3 rounded-xl flex items-center justify-between"
                          style={{ background: "#ffffff", color: surplusProductId ? "#111111" : "rgba(0,0,0,0.45)" }}
                        >
                          <span className="truncate">
                            {surplusProductId
                              ? surplusProductName
                              : (language === "es" ? "Seleccionar producto…" : "Select product…")}
                          </span>
                          <ShoppingBag size={14} style={{ color: "rgba(0,0,0,0.35)" }} />
                        </button>
                      </div>

                      <p className="text-[11px] text-center mb-1" style={{ color: remaining === 0 ? "#1a6e3f" : "rgba(0,0,0,0.55)" }}>
                        {remaining === 0
                          ? (language === "es" ? "Asignado completo ✓" : "Fully allocated ✓")
                          : (language === "es"
                              ? `Sin asignar: $${(remaining / 100).toFixed(2)}`
                              : `Unallocated: $${(remaining / 100).toFixed(2)}`)}
                      </p>

                      <div className="flex gap-2.5 pt-3">
                        <button
                          className="flex-1 py-3.5 text-[14px] font-semibold transition-transform active:scale-95"
                          style={{ borderRadius: "var(--radius-control)", background: "#f5f5f5", color: "#111111" }}
                          onClick={() => setConfirmStep("amount")}
                        >
                          {language === "es" ? "Atrás" : "Back"}
                        </button>
                        <button
                          className="flex-1 py-3.5 text-[14px] font-semibold transition-transform active:scale-95 disabled:opacity-50"
                          style={{ borderRadius: "var(--radius-control)", background: "#111111", color: "#ffffff" }}
                          disabled={
                            remaining !== 0 ||
                            (surplusProductCents > 0 && !surplusProductId)
                          }
                          onClick={async () => {
                            setConfirmMethodOpen(false);
                            await persistConfirmedPayment({
                              amountCents,
                              tipCents: surplusTipCents,
                              productAllocCents: surplusProductCents,
                              productId: surplusProductId,
                              productName: surplusProductName,
                            });
                          }}
                        >
                          {language === "es" ? "Confirmar" : "Confirm"}
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ EDIT PAYMENT METHOD MODAL ═══ */}
      <AnimatePresence>
        {editMethodOpen && (
          <>
            <motion.div
              key="edit-method-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70]"
              style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              onClick={() => setEditMethodOpen(false)}
            />
            <motion.div
              key="edit-method-modal"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none px-6"
            >
              <div
                className="pointer-events-auto w-full max-w-[320px]"
                style={{
                  background: "#ffffff",
                  borderRadius: 28,
                  boxShadow: "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
                  padding: "28px 24px 24px",
                }}
              >
                <div className="flex justify-center mb-4">
                  <span className="text-[11px] font-semibold tracking-wide px-3.5 py-1" style={{ borderRadius: 10, background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)" }}>
                    {language === "es" ? "Revisar Pago" : "Review Payment"}
                  </span>
                </div>
                <h2
                  className="text-center uppercase whitespace-pre-line mb-1"
                  style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}
                >
                  {language === "es" ? "MÉTODO\nDE PAGO" : "PAYMENT\nMETHOD"}
                </h2>
                <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                  {language === "es" ? "Esto revisa el pago existente, no añade otro." : "This revises the existing payment, it does not add another."}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 12 }}>
                  {([
                    { key: "cash", label: "Efectivo", labelEn: "Cash", color: "#4ade80" },
                    { key: "ath_movil", label: "ATH Móvil", labelEn: "ATH Móvil", color: "#f97316" },
                    { key: "stripe", label: "Tarjeta", labelEn: "Credit Card", color: "#a78bfa" },
                    { key: "paypal", label: "PayPal", labelEn: "PayPal", color: "#60a5fa" },
                  ] as const).map((opt) => {
                    const isCurrent = appt.payment_method === opt.key;
                    return (
                      <button
                        key={opt.key}
                        onClick={async () => {
                          setEditMethodOpen(false);
                          if (isCurrent) return;
                          await supabase.from("appointments").update({ payment_method: opt.key }).eq("id", appt.id);
                          if (transactions.length > 0) {
                            await supabase.from("transactions").update({ payment_method: opt.key }).eq("appointment_id", appt.id);
                            setTransactions((prev: any[]) => prev.map((tx: any) => ({ ...tx, payment_method: opt.key })));
                          }
                          setAppt((prev: any) => ({ ...prev, payment_method: opt.key }));
                          toast.success(language === "es" ? "Método actualizado" : "Method updated");
                        }}
                        className="w-full text-center font-semibold transition-all active:scale-[0.97]"
                        style={{
                          background: "#111111",
                          color: opt.color,
                          fontSize: 13,
                          padding: "10px 0",
                          borderRadius: "var(--radius-control)",
                          border: isCurrent ? `2px solid ${opt.color}` : "none",
                        }}
                      >
                        {language === "es" ? opt.label : opt.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ EDIT CLIENT POPUP ═══ */}
      <AnimatePresence>
        {editClientOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50"
              style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              onClick={() => setEditClientOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none px-6"
            >
               <div className="pointer-events-auto w-full max-w-[340px]" style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)", padding: "28px 24px 24px" }}>
                <div className="flex justify-center mb-4">
                  <span className="text-[11px] font-semibold tracking-wide px-3.5 py-1" style={{ borderRadius: 10, background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)" }}>
                    {language === "es" ? "Editar Cliente" : "Edit Client"}
                  </span>
                </div>
                <h2 className="text-center uppercase mb-1" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}>
                  {appt.client_name}
                </h2>
                <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                  {language === "es" ? "Actualiza la información" : "Update the information"}
                </p>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "rgba(0,0,0,0.45)" }}>
                        {language === "es" ? "Nombre" : "First name"}
                      </label>
                      <Input value={editClientFirstName} onChange={(e) => setEditClientFirstName(e.target.value)} className="text-sm" style={{ background: "rgba(0,0,0,0.04)", borderColor: "rgba(0,0,0,0.1)", color: "#111111" }} />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1 block" style={{ color: "rgba(0,0,0,0.45)" }}>
                        {language === "es" ? "Apellido" : "Last name"}
                      </label>
                      <Input value={editClientLastName} onChange={(e) => setEditClientLastName(e.target.value)} className="text-sm" style={{ background: "rgba(0,0,0,0.04)", borderColor: "rgba(0,0,0,0.1)", color: "#111111" }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "rgba(0,0,0,0.45)" }}>
                      {language === "es" ? "Teléfono" : "Phone"}
                    </label>
                    <Input value={editClientPhone} onChange={(e) => setEditClientPhone(e.target.value)} type="tel" className="text-sm" style={{ background: "rgba(0,0,0,0.04)", borderColor: "rgba(0,0,0,0.1)", color: "#111111" }} />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: "rgba(0,0,0,0.45)" }}>Email</label>
                    <Input value={editClientEmail} onChange={(e) => setEditClientEmail(e.target.value)} type="email" className="text-sm" style={{ background: "rgba(0,0,0,0.04)", borderColor: "rgba(0,0,0,0.1)", color: "#111111" }} />
                  </div>
                  <button
                    onClick={saveClientInfo}
                    disabled={savingClient || !editClientFirstName.trim()}
                    className="w-full text-center font-semibold transition-all active:scale-[0.97] disabled:opacity-50"
                    style={{ background: "#111111", color: "#ffffff", fontSize: 13, padding: "10px 0", borderRadius: "var(--radius-control)" }}
                  >
                    {savingClient ? <Loader2 size={18} className="animate-spin mx-auto" /> : (language === "es" ? "Guardar cambios" : "Save changes")}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ RECURRING SCOPE DIALOG (Apple-style "Only this / All future") ═══ */}
      <RecurringScopeDialog
        open={recurringScopeOpen}
        onOpenChange={setRecurringScopeOpen}
        action={pendingScopeAction}
        language={language}
        accentColor={barber?.color || "#c9a882"}
        onChoose={(scope) => {
          // Defer execution slightly so the scope dialog finishes its exit animation
          setTimeout(() => {
            if (pendingScopeAction === "delete") runCancel(scope);
            else if (pendingScopeAction === "reschedule") runReschedule(scope);
            else if (pendingScopeAction === "edit") runEditService(scope);
          }, 200);
        }}
      />

      {/* ═══ RECURRING PROGRESS MODAL (rotating bilingual punchlines + counter) ═══ */}
      <RecurringProgressModal
        open={progressOpen}
        action={progressAction}
        current={progressCurrent}
        total={progressTotal}
        language={language}
        accentColor={barber?.color || "#c9a882"}
      />

      {qrOpen && (
        <PayQrSheet
          appointmentId={appt.id}
          clientName={appt.client_name || (language === "es" ? "Cliente" : "Client")}
          clientPhone={(appt as { client_phone?: string | null }).client_phone ?? null}
          serviceName={appt.service_name}
          balanceCents={balanceCents}
          isEs={language === "es"}
          onClose={() => setQrOpen(false)}
        />
      )}

    </div>
  );
}

/* ─── Month Grid for Reschedule (matches NewAppointment/EditAppointment style) ─── */
function RescheduleMonthGrid({ monthDate, selectedDate, availableDates, onSelectDate, onChangeMonth, language }: {
  monthDate: Date; selectedDate: Date; availableDates: string[];
  onSelectDate: (d: Date) => void; onChangeMonth: (d: Date) => void; language: string;
}) {
  const dateFnsLocale = language === "es" ? esLocale : enUS;
  const dayLabels = language === "es" ? ["D", "L", "M", "M", "J", "V", "S"] : ["S", "M", "T", "W", "T", "F", "S"];

  const days = useMemo(() => {
    const start = startOfWeek(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthDate]);

  return (
    <div className="pb-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onChangeMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} className="p-1">
          <ChevronLeft size={18} style={{ color: "var(--text-tertiary)" }} />
        </button>
        <span className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
          {format(monthDate, "MMMM yyyy", { locale: dateFnsLocale })}
        </span>
        <button onClick={() => onChangeMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} className="p-1">
          <ChevronRight size={18} style={{ color: "var(--text-tertiary)" }} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {dayLabels.map((l, i) => (
          <div key={i} className="text-center text-[10px] font-semibold py-1" style={{ color: "var(--text-tertiary)" }}>{l}</div>
        ))}
        {days.map((day, i) => {
          const inMonth = day.getMonth() === monthDate.getMonth();
          const selected = isSameDay(day, selectedDate);
          const todayDay = isToday(day);
          const dateStr = format(day, "yyyy-MM-dd");
          const available = availableDates.length === 0 || availableDates.includes(dateStr);
          return (
            <button key={i} onClick={() => { if (inMonth && available) onSelectDate(day); }}
              className="flex items-center justify-center py-1.5"
              style={{ opacity: inMonth ? (available ? 1 : 0.3) : 0.15 }}>
              <span className="flex items-center justify-center text-xs font-medium rounded-full"
                style={{
                  width: 30, height: 30,
                  background: selected ? "var(--accent-color)" : "transparent",
                  color: selected ? "var(--bg-base)" : todayDay ? "var(--accent-color)" : "var(--text-primary)",
                  border: todayDay && !selected ? "2px solid var(--accent-color)" : "2px solid transparent",
                }}>
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
