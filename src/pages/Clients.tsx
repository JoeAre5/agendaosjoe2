import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toCsv } from "@/lib/csvSafe";
import { aggregateRecognitionSpending, productPurchaseCents, sumAppointmentPrices, aggregateAppointmentVisits, selectVisitAppointments, nextVisitUpdateAt, fetchAppointmentPages, clientRecognitionThreshold, compareClientVisits, isRecognizedClient, RECOGNITION_WINDOW_DAYS, type ProductTransaction, type SpendingAppointment, type VisitAppointment } from "@/lib/clientRankings";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useClientDuplicateBadges } from "@/contexts/ClientDuplicateBadgesContext";
import { PendingCountBadge } from "@/components/ui/PendingCountBadge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import {
  Search,
  Download,
  Plus,
  ChevronRight,
  Phone,
  MessageCircle,
  Mail,
  Copy,
  Check,
  CheckCircle,
  Loader2,
  UserRound,
  Calendar as CalendarIcon,
  RefreshCw,
  Crown,
  Pencil,
  Filter,
  X,
  Trash2,
  CreditCard,
  Bell,
  Smartphone,
  Users,
  Network,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { SubpageHeader } from "@/components/SubpageHeader";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { motion } from "motion/react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { usePersistentState } from "@/lib/persistentState";
import { useUrlState, isUuid } from "@/lib/urlState";
import ClientReferralNetwork from "@/components/admin/ClientReferralNetwork";
import { ClientBirthdayField } from "@/components/ClientBirthdayField";

type Client = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  preferred_barber_id: string | null;
  total_visits: number;
  total_spent_cents: number;
  last_visit_at: string | null;
  sms_opt_in: boolean;
  acuity_client_id: number | null;
  stripe_customer_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  has_push?: boolean;
  has_pwa?: boolean;
  referrer_name?: string | null;
  referrer_id?: string | null;
};

type Barber = {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
};

type AppointmentHistory = VisitAppointment & {
  id: string;
  service_name: string;
  starts_at: string;
  barber_id: string;
  price_cents: number;
  payment_method: string | null;
};

type ProductHistory = {
  id: string;
  name: string;
  created_at: string;
  total_cents: number;
  payment_method: string;
};

function fmt(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

function fullName(c: Client) {
  return `${c.first_name}${c.last_name ? " " + c.last_name : ""}`;
}

type SortMode = "nombre" | "reciente" | "vip" | "frecuentes";

const SORT_TABS: { id: SortMode; label: { es: string; en: string } }[] = [
  { id: "nombre", label: { es: "Nombre", en: "Name" } },
  { id: "reciente", label: { es: "Reciente", en: "Recent" } },
  { id: "vip", label: { es: "VIP", en: "VIP" } },
  { id: "frecuentes", label: { es: "Frecuentes", en: "Frequent" } },
];

export default function Clients() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, language } = useTranslation();
  const { isOwner } = useAuth();
  const { count: clientDuplicateCount } = useClientDuplicateBadges();
  const locale = language === "es" ? esLocale : enUS;

  const [clients, setClients] = useState<Client[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); // ephemeral by design (Phase 1B.UX decision #1)
  const [barberFilter, setBarberFilter] = usePersistentState<string | null>("clients.barberFilter", null);
  const [showBarberFilter, setShowBarberFilter] = useState(false);
  const [pushFilter, setPushFilter] = usePersistentState<boolean>("clients.pushFilter", false);
  const [pwaFilter, setPwaFilter] = usePersistentState<boolean>("clients.pwaFilter", false);
  const [referrerFilter, setReferrerFilter] = usePersistentState<string | null>("clients.referrerFilter", null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [sortMode, setSortMode] = usePersistentState<SortMode>("clients.sortMode", "nombre");
  const [showAddForm, setShowAddForm] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [newFirst, setNewFirst] = useState("");
  const [newLast, setNewLast] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const [profileAppointments, setProfileAppointments] = useState<AppointmentHistory[]>([]);
  const [recentAppointments, setRecentAppointments] = useState<SpendingAppointment[]>([]);
  const [visitClock, setVisitClock] = useState(() => Date.now());
  const [dataRevision, setDataRevision] = useState(0);
  const profileRequest = useRef(0);
  const history = useMemo(() => selectVisitAppointments(profileAppointments, new Date(visitClock))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()), [profileAppointments, visitClock]);
  const upcomingHistory = useMemo(() => profileAppointments.filter(a => a.status !== "cancelled" && new Date(a.starts_at).getTime() > visitClock)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()), [profileAppointments, visitClock]);
  const [productHistory, setProductHistory] = useState<ProductHistory[]>([]);
  const [editNotes, setEditNotes] = useState("");
  const [editBarber, setEditBarber] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [lastPaymentMethod, setLastPaymentMethod] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [apptExpanded, setApptExpanded] = useState(false);
  const [apptLimit, setApptLimit] = useState(10);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [upcomingLimit, setUpcomingLimit] = useState(10);
  const [prodExpanded, setProdExpanded] = useState(false);
  const [prodLimit, setProdLimit] = useState(10);
  const [scrollToSection, setScrollToSection] = useState<string | null>(null);
  const previousSectionRef = useRef<HTMLDivElement>(null);
  const upcomingSectionRef = useRef<HTMLDivElement>(null);

  // Editable contact fields
  const [editingContact, setEditingContact] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [deletedName, setDeletedName] = useState("");

  const isValidProfile = (c: Client) =>
    !!c.first_name?.trim() &&
    !!c.last_name?.trim() && c.last_name !== "." &&
    !!c.phone?.trim();

  const fetchClients = useCallback(async () => {
    let all: Client[] = [];
    let from = 0;
    const PAGE = 1000;
    // Sensitive payment columns (stripe_customer_id, card_brand, card_last4)
    // are excluded here — column-level GRANTs revoke them for authenticated.
    // The list view never needs them; the profile drawer fetches them on
    // demand via `get_client_payment_details` RPC (owner-permitted).
    const SAFE_COLS =
      "id,first_name,last_name,email,phone,notes,preferred_barber_id," +
      "total_visits,total_spent_cents,last_visit_at,sms_opt_in,acuity_client_id";
    while (true) {
      const { data } = await supabase
        .from("clients")
        .select(SAFE_COLS)
        .order("first_name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      all = all.concat(
        data.map((c: any) => ({
          ...c,
          stripe_customer_id: null,
          card_brand: null,
          card_last4: null,
        })) as Client[]
      );
      if (data.length < PAGE) break;
      from += PAGE;
    }
    setTotalCount(all.length);
    setClients(all.filter(isValidProfile));
    setDataRevision(revision => revision + 1);
    setLoading(false);
  }, []);

  // Enrich client list with push/pwa/referrer data (owner-only RLS allows reads).
  useEffect(() => {
    if (clients.length === 0) return;
    let cancelled = false;
    (async () => {
      const [pushRes, pwaRes, refRes] = await Promise.all([
        supabase.from("push_subscriptions").select("client_id"),
        supabase.from("pwa_installs").select("client_id").not("client_id", "is", null),
        (supabase
          .from("referral_attributions") as any)
          .select("referred_client_id, referrer_id, referrer_type")
          .eq("referrer_type", "barber")
          .not("referred_client_id", "is", null),
      ]);
      if (cancelled) return;
      const pushSet = new Set((pushRes.data || []).map((r: any) => r.client_id));
      const pwaSet = new Set((pwaRes.data || []).map((r: any) => r.client_id));
      const refMap = new Map<string, string>();
      (refRes.data || []).forEach((r: any) => {
        if (r.referred_client_id && !refMap.has(r.referred_client_id)) {
          refMap.set(r.referred_client_id, r.referrer_id);
        }
      });
      setClients((prev) =>
        prev.map((c) => ({
          ...c,
          has_push: pushSet.has(c.id),
          has_pwa: pwaSet.has(c.id),
          referrer_id: refMap.get(c.id) ?? null,
        }))
      );
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients.length]);

  useEffect(() => {
    fetchClients();
    supabase.from("barbers_public").select("id, name, color, is_active").then(({ data }) => {
      if (data) setBarbers(data);
    });
  }, [fetchClients]);

  // Persist selected client in URL so app-switch / reload / bfcache restore re-opens the profile.
  const [clientUrlId, setClientUrlId] = useUrlState<string>("client", {
    defaultValue: null,
    validator: isUuid,
  });
  const openParamHandled = useRef(false);
  useEffect(() => {
    if (openParamHandled.current || loading || clients.length === 0) return;

    // New canonical param: ?client=<uuid>
    if (clientUrlId) {
      openParamHandled.current = true;
      const scrollTarget = searchParams.get("scrollTo");
      const match = clients.find((c) => c.id === clientUrlId);
      if (match) {
        if (scrollTarget) setScrollToSection(scrollTarget);
        openProfile(match);
      } else {
        // Stale UUID — silently clear and stay on list view.
        setClientUrlId(null);
      }
      return;
    }

    // Legacy param: ?open=<full name> — consume one-shot, then clear.
    const openName = searchParams.get("open");
    if (openName) {
      openParamHandled.current = true;
      const scrollTarget = searchParams.get("scrollTo");
      const next = new URLSearchParams(searchParams);
      next.delete("open");
      next.delete("scrollTo");
      setSearchParams(next, { replace: true });
      const match = clients.find((c) => fullName(c).toLowerCase() === openName.toLowerCase());
      if (match) {
        if (scrollTarget) setScrollToSection(scrollTarget);
        openProfile(match);
      }
    }
  }, [loading, clients, searchParams, clientUrlId, setClientUrlId, setSearchParams]);

  const [visibleCount, setVisibleCount] = useState(100);

  useEffect(() => {
    setVisibleCount(100);
  }, [search]);

  // Recognition-only product receipts; never write derived spending to clients.
  const [recentProducts, setRecentProducts] = useState<ProductTransaction[]>([]);
  useEffect(() => {
    let cancelled = false;
    setRecentAppointments([]);
    setRecentProducts([]);
    (async () => {
      try {
        const sinceIso = new Date(Date.now() - RECOGNITION_WINDOW_DAYS * 86_400_000).toISOString();
        const [rows, products] = await Promise.all([fetchAppointmentPages<SpendingAppointment>((from, to) => supabase
          .from("appointments")
          .select("id,client_id,client_name,barber_id,starts_at,status,price_cents")
          .gte("starts_at", sinceIso)
          .order("id")
          .range(from, to)), fetchAppointmentPages<ProductTransaction>((from, to) => supabase
          .from("transactions")
          .select("id,client_id,created_at,status,type,subtotal_cents,transaction_items(id,item_type,total_cents)")
          .eq("status", "completed")
          .in("type", ["product", "mixed"])
          .not("client_id", "is", null)
          .gte("created_at", sinceIso)
          .order("id")
          .range(from, to))]);
        if (!cancelled) { setRecentAppointments(rows); setRecentProducts(products); setVisitClock(Date.now()); }
      } catch {
        if (!cancelled) toast.error(language === "es" ? "No se pudieron cargar las visitas y los importes" : "Could not load visits and spending");
      }
    })();
    return () => { cancelled = true; };
  }, [dataRevision, language]);

  // Refresh on return to the page, without invoking Acuity synchronization.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      setVisitClock(Date.now());
      setDataRevision(revision => revision + 1);
      if (selectedClient) void openProfile(selectedClient);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [selectedClient]);

  useEffect(() => {
    const now = new Date(visitClock);
    const candidates = [nextVisitUpdateAt(recentAppointments, now, true),
      selectedClient ? nextVisitUpdateAt(profileAppointments, now) : null].filter((v): v is number => v !== null);
    if (candidates.length === 0) return;
    const next = Math.min(...candidates);
    const timer = window.setTimeout(() => setVisitClock(Date.now()), Math.min(Math.max(next - Date.now(), 1), 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [recentAppointments, profileAppointments, selectedClient, visitClock]);

  useEffect(() => () => { profileRequest.current += 1; }, []);

  const recentVisits = useMemo(() => aggregateAppointmentVisits(recentAppointments, clients, new Date(visitClock), barberFilter),
    [recentAppointments, clients, visitClock, barberFilter]);
  const recentSpending = useMemo(() => aggregateRecognitionSpending(recentAppointments, recentProducts, clients, new Date(visitClock)),
    [recentAppointments, recentProducts, clients, visitClock]);
  const recentOf = useCallback(
    (id: string) => ({ total_visits: recentVisits.get(id) ?? 0, total_spent_cents: recentSpending.get(id) ?? 0 }),
    [recentSpending, recentVisits],
  );
  const recentList = useMemo(() => clients.map((c) => recentOf(c.id)), [clients, recentOf]);
  const vipThreshold = useMemo(() => clientRecognitionThreshold(recentList, "total_spent_cents"), [recentList]);
  const frequentThreshold = useMemo(() => clientRecognitionThreshold(recentList, "total_visits"), [recentList]);

  const filtered = useMemo(() => {
    let list = [...clients];

    // Barber filter
    if (barberFilter && sortMode !== "frecuentes") {
      list = list.filter((c) => c.preferred_barber_id === barberFilter);
    }
    if (pushFilter) list = list.filter((c) => c.has_push);
    if (pwaFilter) list = list.filter((c) => c.has_pwa);
    if (referrerFilter) list = list.filter((c) => c.referrer_id === referrerFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          fullName(c).toLowerCase().includes(q) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q))
      );
    }

    switch (sortMode) {
      case "nombre":
        list.sort((a, b) => fullName(a).localeCompare(fullName(b)));
        break;
      case "reciente":
        list.sort((a, b) => (b.last_visit_at || "").localeCompare(a.last_visit_at || ""));
        break;
      case "vip":
        list = list.filter((c) => recentOf(c.id).total_spent_cents > 0);
        list.sort((a, b) => recentOf(b.id).total_spent_cents - recentOf(a.id).total_spent_cents);
        break;
      case "frecuentes":
        list = list.filter((c) => recentOf(c.id).total_visits > 0);
        list.sort((a, b) => compareClientVisits({ ...a, ...recentOf(a.id) }, { ...b, ...recentOf(b.id) }));
        break;
    }

    return list;
  }, [clients, search, sortMode, barberFilter, pushFilter, pwaFilter, referrerFilter, recentOf]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;
  const remaining = filtered.length - visibleCount;

  const grouped = useMemo(() => {
    if (sortMode !== "nombre") return null;
    const map = new Map<string, Client[]>();
    visible.forEach((c) => {
      const letter = c.first_name.charAt(0).toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(c);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, sortMode]);

  const [productSpent, setProductSpent] = useState(0);
  const [profileFailed, setProfileFailed] = useState(false);
  const serviceSpent = useMemo(() => sumAppointmentPrices(profileAppointments, new Date(visitClock)), [profileAppointments, visitClock]);

  const openProfile = async (client: Client) => {
    const request = ++profileRequest.current;
    setSelectedClient(client);
    setClientUrlId(client.id);
    setEditNotes(client.notes || "");
    setEditBarber(client.preferred_barber_id);
    setEditingContact(false);
    setLoadingProfile(true);
    setProfileFailed(false);
    setProductSpent(0);
    setProductHistory([]);
    setProfileAppointments([]);

    // Search appointments by client_id OR by name match (for historical data without client_id)
    const clientFullName = fullName(client);
    try {
    const [apptById, apptByName, txnRes, prodTxns, payRes] = await Promise.all([
      fetchAppointmentPages<AppointmentHistory>((from, to) => supabase
        .from("appointments")
        .select("id, service_name, starts_at, barber_id, price_cents, payment_method, status")
        .eq("client_id", client.id)
        .order("starts_at", { ascending: false })
        .order("id")
        .range(from, to)),
      fetchAppointmentPages<AppointmentHistory>((from, to) => supabase
        .from("appointments")
        .select("id, service_name, starts_at, barber_id, price_cents, payment_method, status")
        .eq("client_name", clientFullName)
        .is("client_id", null)
        .order("starts_at", { ascending: false })
        .order("id")
        .range(from, to)),
      supabase
        .from("transactions")
        .select("payment_method")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(1),
      fetchAppointmentPages<ProductTransaction & { payment_method: string }>((from, to) => supabase
        .from("transactions")
        .select("id,client_id,created_at,status,type,subtotal_cents,payment_method,transaction_items(id,item_type,total_cents)")
        .eq("client_id", client.id)
        .eq("status", "completed")
        .in("type", ["product", "mixed"])
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)),
      // Sensitive payment metadata via security-definer RPC (owner-permitted).
      // The list query intentionally excludes these columns.
      (supabase.rpc as any)("get_client_payment_details", { _client_id: client.id }),
    ]);
    if (request !== profileRequest.current) return;

    // Hydrate payment details onto the open profile so the wallet card renders.
    const pay = (payRes?.data as any[])?.[0] || {};
    if (pay.stripe_customer_id || pay.card_brand || pay.card_last4) {
      setSelectedClient((prev) =>
        prev && prev.id === client.id
          ? {
              ...prev,
              stripe_customer_id: pay.stripe_customer_id ?? null,
              card_brand: pay.card_brand ?? null,
              card_last4: pay.card_last4 ?? null,
            }
          : prev
      );
    }

    // Merge appointments, deduplicate by id
    const allAppts = [...apptById, ...apptByName];
    const seen = new Set<string>();
    const deduped: AppointmentHistory[] = [];
    for (const a of allAppts) {
      if (!seen.has(a.id)) { seen.add(a.id); deduped.push(a); }
    }
    setProfileAppointments(deduped);
    setVisitClock(Date.now());
    setDataRevision(revision => revision + 1);
    setApptExpanded(false);
    setApptLimit(10);
    setUpcomingExpanded(false);
    setUpcomingLimit(10);
    setProdExpanded(false);
    setProdLimit(10);

    setLastPaymentMethod(txnRes.data?.[0]?.payment_method || null);

    // Product purchase history
    const purchases = prodTxns.filter(tx => new Date(tx.created_at).getTime() <= Date.now()).map(tx => ({
      id: tx.id,
      name: language === "es" ? "Producto" : "Product",
      created_at: tx.created_at,
      total_cents: productPurchaseCents(tx),
      payment_method: tx.payment_method,
    })).filter(tx => tx.total_cents !== 0);
    setProductHistory(purchases);
    setProductSpent(purchases.reduce((sum, tx) => sum + tx.total_cents, 0));
    setLoadingProfile(false);
    } catch {
      if (request !== profileRequest.current) return;
      setProfileFailed(true);
      setLoadingProfile(false);
      toast.error(language === "es" ? "No se pudo cargar el historial completo" : "Could not load complete history");
    }
  };

  // Scroll to section after profile loads
  useEffect(() => {
    if (loadingProfile || !scrollToSection || !selectedClient) return;
    const timer = setTimeout(() => {
      if (scrollToSection === "previous") {
        setApptExpanded(true);
        previousSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (scrollToSection === "upcoming") {
        setUpcomingExpanded(true);
        upcomingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      setScrollToSection(null);
    }, 300);
    return () => clearTimeout(timer);
  }, [loadingProfile, scrollToSection, selectedClient]);

  const saveProfile = async () => {
    if (!selectedClient) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from("clients")
      .update({
        notes: editNotes || null,
        preferred_barber_id: editBarber || null,
      })
      .eq("id", selectedClient.id);
    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === "es" ? "Guardado" : "Saved");
      setClients((prev) =>
        prev.map((c) =>
          c.id === selectedClient.id
            ? { ...c, notes: editNotes || null, preferred_barber_id: editBarber || null }
            : c
        )
      );
    }
  };

  // Acuity proxy helper for client sync
  const acuityProxy = async (path: string, method = "GET", body?: any): Promise<any> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Not authenticated");
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/acuity-proxy`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ path, method, body }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json?.message || json?.error || `Acuity error ${res.status}`);
    return json;
  };

  // Save contact info changes (Supabase clients + appointments + Acuity)
  const saveContact = async () => {
    if (!selectedClient || savingContact) return;
    setSavingContact(true);
    try {
      const newFullName = `${editFirstName.trim()} ${editLastName.trim()}`.trim();
      const oldFullName = fullName(selectedClient);

      // 1) Update clients table
      await supabase.from("clients").update({
        first_name: editFirstName.trim(),
        last_name: editLastName.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
      }).eq("id", selectedClient.id);

      // 2) Update ALL appointments linked to this client by client_id (authoritative).
      //    Also patch any legacy rows that match the old name but were never linked.
      const apptUpdate = {
        client_name: newFullName,
        client_phone: editPhone.trim() || null,
        client_email: editEmail.trim() || null,
      };
      await supabase.from("appointments").update(apptUpdate).eq("client_id", selectedClient.id);
      await supabase
        .from("appointments")
        .update(apptUpdate)
        .is("client_id", null)
        .eq("client_name", oldFullName);

      // 3) Sync to Acuity. Use stored acuity_client_id when present; otherwise
      //    look up by old phone/email so renaming/repointing still propagates.
      try {
        let acuityId: number | null = selectedClient.acuity_client_id ?? null;
        if (!acuityId) {
          const lookupPhone = (selectedClient.phone || "").replace(/\D/g, "").slice(-10);
          const lookupEmail = (selectedClient.email || "").trim();
          let found: any = null;
          if (lookupPhone) {
            const list = await acuityProxy(`/clients?search=${encodeURIComponent(lookupPhone)}`).catch(() => null);
            if (Array.isArray(list)) {
              found = list.find((c: any) => (String(c.phone || "").replace(/\D/g, "").slice(-10)) === lookupPhone);
            }
          }
          if (!found && lookupEmail) {
            const list = await acuityProxy(`/clients?search=${encodeURIComponent(lookupEmail)}`).catch(() => null);
            if (Array.isArray(list)) {
              found = list.find((c: any) => (c.email || "").toLowerCase() === lookupEmail.toLowerCase());
            }
          }
          if (found?.id) {
            acuityId = found.id;
            await supabase.from("clients").update({ acuity_client_id: acuityId }).eq("id", selectedClient.id);
          }
        }
        if (acuityId) {
          await acuityProxy(`/clients/${acuityId}`, "PUT", {
            firstName: editFirstName.trim(),
            lastName: editLastName.trim(),
            phone: editPhone.trim(),
            email: editEmail.trim(),
          });
        }
      } catch {
        // Acuity sync failure is non-blocking
      }

      // Update local state
      const updated = {
        ...selectedClient,
        first_name: editFirstName.trim(),
        last_name: editLastName.trim() || null,
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
      };
      setSelectedClient(updated);
      setClients((prev) =>
        prev.map((c) => c.id === selectedClient.id ? updated : c)
      );
      setEditingContact(false);
      toast.success(language === "es" ? "Cliente actualizado" : "Client updated");
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSavingContact(false);
    }
  };

  const addClient = async () => {
    if (!newFirst.trim() || !newLast.trim() || !newPhone.trim() || !newEmail.trim()) {
      toast.error(language === "es" ? "Todos los campos son requeridos" : "All fields are required");
      return;
    }
    setSaving(true);
    // Check for existing client by normalized phone
    const { data: existingId } = await supabase.rpc("find_client_by_phone", { _phone: newPhone.trim() });
    if (existingId) {
      setSaving(false);
      toast.error(
        language === "es"
          ? "Ya existe un cliente con este número de teléfono"
          : "A client with this phone number already exists"
      );
      return;
    }
    const { error } = await supabase.from("clients").insert({
      first_name: newFirst.trim(),
      last_name: newLast.trim(),
      email: newEmail.trim(),
      phone: newPhone.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(language === "es" ? "Cliente añadido" : "Client added");
      setNewFirst("");
      setNewLast("");
      setNewEmail("");
      setNewPhone("");
      setShowAddForm(false);
      fetchClients();
    }
  };

  const handleDeleteClient = async () => {
    if (!selectedClient || deleting) return;
    setDeleting(true);
    const clientId = selectedClient.id;
    const name = fullName(selectedClient);

    const { data: futureAppointments } = await supabase
      .from("appointments")
      .select("id, acuity_id")
      .eq("client_id", clientId)
      .gt("starts_at", new Date().toISOString())
      .in("status", ["scheduled", "confirmed", "in-progress"]);

    for (const appointment of futureAppointments || []) {
      if (typeof appointment.acuity_id === "number" && appointment.acuity_id > 0) {
        try {
          await acuityProxy(`/appointments/${appointment.acuity_id}/cancel`, "PUT", {
            admin: true,
            noEmail: true,
            cancelNote: "Client deleted by shop",
          });
        } catch (err) {
          console.warn("Acuity cancel failed before client delete", appointment.id, err);
        }
      }
    }

    const { data, error } = await supabase.rpc("delete_client_safely", { _client_id: clientId });
    setDeleting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as { success: boolean; appointments_cleaned: number; future_appointments_cancelled?: number; transactions_cleaned: number; duplicates_removed: number } | null;
    setShowDeleteConfirm(false);
    setClients((prev) => prev.filter((c) => c.id !== clientId));
    if (result?.duplicates_removed) {
      setClients((prev) => {
        const dupName = name.toLowerCase();
        return prev.filter((c) => fullName(c).toLowerCase() !== dupName || c.id === clientId);
      });
    }
    setDeletedName(name);
    // Show success popup FIRST (rendered at top level, outside the drawer),
    // then close the drawer. Previously, closing selectedClient first
    // unmounted the popup along with the drawer subtree, causing the
    // confirmation to appear only after navigating to another client.
    setShowDeleteSuccess(true);
    setSelectedClient(null);
    setClientUrlId(null);
  };

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const exportCSV = async () => {
    const headers = ["First Name", "Last Name", "Email", "Phone", "Total Visits", "Total Spent"];
    const rows = clients.map((c) => [
      c.first_name,
      c.last_name || "",
      c.email || "",
      c.phone || "",
      c.total_visits.toString(),
      fmt(c.total_spent_cents),
    ]);
    const csv = toCsv([headers, ...rows]);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(language === "es" ? "CSV descargado" : "CSV downloaded");
  };

  const barberName = (id: string) => barbers.find((b) => b.id === id)?.name || "";

  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState("");
  const [confirmSync, setConfirmSync] = useState(false);
  const [confirmCSV, setConfirmCSV] = useState(false);

  const runHistoricalSync = async () => {
    setSyncing(true);
    const startDate = new Date("2024-01-01");
    const endDate = new Date();
    const chunks: { min: string; max: string }[] = [];
    const cur = new Date(startDate);
    while (cur < endDate) {
      const chunkEnd = new Date(cur);
      chunkEnd.setDate(chunkEnd.getDate() + 6);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
      const f = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      chunks.push({ min: f(cur), max: f(chunkEnd) });
      cur.setDate(cur.getDate() + 7);
    }
    let totalClients = 0;
    let totalAppts = 0;
    for (let i = 0; i < chunks.length; i++) {
      setSyncProgress(`${i + 1}/${chunks.length}`);
      try {
        const { data, error } = await supabase.functions.invoke("acuity-sync", {
          body: { minDate: chunks[i].min, maxDate: chunks[i].max },
        });
        if (!error && data) {
          totalClients += data.clients?.upserted || 0;
          totalAppts += data.upserted || 0;
        }
      } catch { /* continue */ }
    }
    setSyncing(false);
    setSyncProgress("");
    toast.success(
      language === "es"
        ? `Sync completo: ${totalAppts} citas, ${totalClients} clientes`
        : `Sync complete: ${totalAppts} appointments, ${totalClients} clients`
    );
    fetchClients();
  };

  const ClientRow = ({ client, isLast }: { client: Client; isLast: boolean }) => (
    <button
      onClick={() => openProfile(client)}
      className="flex items-center w-full px-4 py-3 gap-3 transition-colors"
      style={{ borderBottom: isLast ? "none" : "1px solid var(--divider)" }}
    >
      <div className="flex-1 text-left min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {fullName(client)}
          </span>
          {isRecognizedClient(recentOf(client.id).total_spent_cents, vipThreshold) && (
            <Crown size={12} className="shrink-0 text-[var(--client-vip-crown)]" aria-label="VIP" />
          )}
          {isRecognizedClient(recentOf(client.id).total_visits, frequentThreshold) && (
            <Crown size={12} className="shrink-0 fill-[var(--client-frequent-crown)] text-[var(--client-frequent-crown-edge)]" aria-label={language === "es" ? "Cliente frecuente" : "Frequent client"} />
          )}
          {client.has_push && (
            <Bell size={11} style={{ color: "#22c55e" }} aria-label="Push activo" />
          )}
          {client.has_pwa && (
            <Smartphone size={11} style={{ color: "var(--accent-color)" }} aria-label="PWA instalada" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
          {sortMode === "vip" && <span>{fmt(recentOf(client.id).total_spent_cents)} · 90d</span>}
          {sortMode === "frecuentes" && (() => { const v = recentOf(client.id).total_visits; return <span>{v} {language === "es" ? (v === 1 ? "visita" : "visitas") : (v === 1 ? "visit" : "visits")} · 90d</span>; })()}
          {sortMode === "reciente" && client.last_visit_at && (
            <span>{format(parseISO(client.last_visit_at), "d MMM yyyy", { locale })}</span>
          )}
          {sortMode === "nombre" && client.phone && <span>{client.phone}</span>}
          {client.referrer_id && (
            <span className="truncate" style={{ color: "var(--text-tertiary)" }}>
              · ref: {barbers.find((b) => b.id === client.referrer_id)?.name?.split(" ")[0] || "—"}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
    </button>
  );

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <SubpageHeader
        sticky
        title={t("menu.clients")}
        onBack={() => navigate("/admin?tab=menu")}
        actions={
          <>
            {isOwner && (
              <Button variant="ghost" size="icon" onClick={() => navigate("/admin/clients/duplicates")} className="relative text-[var(--accent-color)] [&_svg]:size-5" aria-label={language === "es" ? "Posibles duplicados" : "Possible duplicates"}>
                <Users size={20} />
                <PendingCountBadge count={clientDuplicateCount} label={language === "es" ? "Grupos pendientes" : "Pending groups"} className="absolute -right-1 -top-1 pointer-events-none" />
              </Button>
            )}
            {confirmSync ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>¿Sincronizar?</span>
                <button onClick={() => { setConfirmSync(false); runHistoricalSync(); }}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold"
                  style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}>Sí</button>
                <button onClick={() => setConfirmSync(false)}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold"
                  style={{ background: "var(--bg-surface)", color: "var(--text-secondary)" }}>No</button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmSync(true)}
                disabled={syncing}
                className="p-2 rounded-lg relative"
                style={{ color: "var(--accent-color)" }}
              >
                <RefreshCw size={20} className={syncing ? "animate-spin" : ""} />
                {syncing && syncProgress && (
                  <span
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold"
                    style={{ color: "var(--accent-color)" }}
                  >
                    {syncProgress}
                  </span>
                )}
              </button>
            )}
            {confirmCSV ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>¿Descargar?</span>
                <button onClick={() => { setConfirmCSV(false); exportCSV(); }}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold"
                  style={{ background: "var(--accent-color)", color: "var(--cta-fg)" }}>Sí</button>
                <button onClick={() => setConfirmCSV(false)}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold"
                  style={{ background: "var(--bg-surface)", color: "var(--text-secondary)" }}>No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmCSV(true)} className="p-2 rounded-lg" style={{ color: "var(--accent-color)" }}>
                <Download size={20} />
              </button>
            )}
          </>
        }
      />

      <div className="px-4 mb-3">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-tertiary)" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              barberFilter
                ? `${barbers.find((b) => b.id === barberFilter)?.name || ""}`
                : language === "es"
                  ? "Buscar por nombre, email, teléfono..."
                  : "Search by name, email, phone..."
            }
            className="w-full pl-10 pr-12 py-3.5 text-sm outline-none rounded-2xl"
            style={{
              background: "transparent",
              color: "var(--text-primary)",
              border: barberFilter ? "1.5px solid var(--accent-color)" : "1px solid var(--input-hint)",
            }}
          />
          <button
            onClick={() => {
              if (barberFilter) {
                setBarberFilter(null);
                setShowBarberFilter(false);
              } else {
                setShowBarberFilter((p) => !p);
              }
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full"
            style={{
              color: barberFilter ? "var(--accent-color)" : "var(--text-tertiary)",
              background: barberFilter ? "var(--accent-color)" : "transparent",
            }}
          >
            {barberFilter ? (
              <X size={14} style={{ color: "var(--cta-fg)" }} />
            ) : (
              <Filter size={16} />
            )}
          </button>
        </div>

        {/* Barber filter dropdown */}
        {showBarberFilter && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="mt-2 rounded-xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)" }}
          >
            {barbers.filter((b) => b.is_active).map((b, i, arr) => (
              <button
                key={b.id}
                onClick={() => {
                  setBarberFilter(b.id);
                  setShowBarberFilter(false);
                }}
                className="flex items-center w-full px-4 py-3 gap-3 transition-colors"
                style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--divider)" : "none" }}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ background: b.color || "var(--accent-color)" }}
                />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {b.name}
                </span>
              </button>
            ))}
          </motion.div>
        )}

        {/* Quick filter chips: Push / PWA / Referrer */}
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setPushFilter(!pushFilter)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
            style={{
              background: pushFilter ? "var(--accent-color)" : "transparent",
              color: pushFilter ? "var(--cta-fg)" : "var(--text-secondary)",
              border: `1px solid ${pushFilter ? "var(--accent-color)" : "var(--input-hint)"}`,
            }}
          >
            <Bell size={11} /> Push
          </button>
          <button
            onClick={() => setPwaFilter(!pwaFilter)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
            style={{
              background: pwaFilter ? "var(--accent-color)" : "transparent",
              color: pwaFilter ? "var(--cta-fg)" : "var(--text-secondary)",
              border: `1px solid ${pwaFilter ? "var(--accent-color)" : "var(--input-hint)"}`,
            }}
          >
            <Smartphone size={11} /> PWA
          </button>
          {barbers.filter((b) => b.is_active).map((b) => {
            const active = referrerFilter === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setReferrerFilter(active ? null : b.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                style={{
                  background: active ? "var(--accent-color)" : "transparent",
                  color: active ? "var(--cta-fg)" : "var(--text-secondary)",
                  border: `1px solid ${active ? "var(--accent-color)" : "var(--input-hint)"}`,
                }}
              >
                <Users size={11} /> ref: {b.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Counter: Qualified · Complete · Hidden */}
      {!loading && totalCount > 0 && (
        <div className="px-4 mb-3 flex items-center justify-center gap-2 text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
          <span><span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{clients.length}</span> {language === "es" ? "calificados" : "qualified"}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span><span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{clients.filter((c) => !!c.email?.trim()).length}</span> {language === "es" ? "completos" : "complete"}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{totalCount - clients.length} {language === "es" ? "ocultos" : "hidden"}</span>
        </div>
      )}

      <div className="flex justify-center px-4 mb-3">
        <SegmentedTabs<SortMode>
          className="w-full max-w-sm"
          fitContent
          labelClassName="text-[10px] sm:text-xs font-medium whitespace-nowrap tracking-normal"
          layoutId="client-sort-pill"
          value={sortMode}
          onChange={setSortMode}
          tabs={SORT_TABS.map(({ id, label }) => ({
            id,
            label: label[language as "es" | "en"] || label.es,
            leading: id === "vip" ? <Crown size={12} className="shrink-0 text-[var(--client-vip-crown)]" /> : id === "frecuentes" ? <Crown size={12} className="shrink-0 fill-[var(--client-frequent-crown)] text-[var(--client-frequent-crown-edge)]" /> : undefined,
          }))}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
        </div>
      ) : clients.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <UserRound size={48} className="mx-auto mb-4" style={{ color: "var(--text-tertiary)" }} />
          <p style={{ color: "var(--text-secondary)" }} className="text-sm">
            {language === "es"
              ? "Sin clientes aún. Importa un CSV o agrega uno manualmente."
              : "No clients yet. Import a CSV or add one manually."}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p style={{ color: "var(--text-secondary)" }} className="text-sm">
            {t("common.noResults")}
          </p>
        </div>
      ) : (
        <div className="px-4 pb-24">
          {grouped ? (
            grouped.map(([letter, group]) => (
              <div key={letter} className="mb-2">
                <div
                  className="text-xs font-bold uppercase px-2 py-1"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {letter}
                </div>
                <div className="rounded-xl overflow-hidden card-elevated">
                  {group.map((client, i) => (
                    <ClientRow key={client.id} client={client} isLast={i === group.length - 1} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl overflow-hidden card-elevated">
              {visible.map((client, i) => (
                <ClientRow key={client.id} client={client} isLast={i === visible.length - 1} />
              ))}
            </div>
          )}

          {hasMore && (
            <button
              onClick={() => setVisibleCount((prev) => prev + 500)}
              className="w-full py-3 mt-3 rounded-xl text-sm font-semibold"
              style={{ background: "var(--bg-card)", color: "var(--accent-color)" }}
            >
              {language === "es"
                ? `Ver ${Math.min(remaining, 500)} más (${visible.length} de ${filtered.length})`
                : `Show ${Math.min(remaining, 500)} more (${visible.length} of ${filtered.length})`}
            </button>
          )}

          <p className="text-center text-xs mt-4 pb-2" style={{ color: "var(--text-tertiary)" }}>
            {language === "es"
              ? `Mostrando ${visible.length} de ${filtered.length} clientes`
              : `Showing ${visible.length} of ${filtered.length} clients`}
          </p>
        </div>
      )}

      <button
        onClick={() => setShowAddForm(true)}
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full flex items-center justify-center shadow-lg z-40"
        style={{ background: "var(--accent-color)" }}
      >
        <Plus size={26} style={{ color: "#fff" }} />
      </button>

      <Drawer open={showAddForm} onOpenChange={setShowAddForm}>
        <DrawerContent style={{ background: "var(--bg-base)", borderColor: "var(--divider)" }}>
          <DrawerHeader className="flex items-center justify-between">
            <DrawerTitle style={{ color: "var(--text-primary)" }}>
              {language === "es" ? "Nuevo Cliente" : "New Client"}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-8 space-y-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Nombre *" : "First Name *"}
              </label>
              <Input
                value={newFirst}
                onChange={(e) => setNewFirst(e.target.value)}
                style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderColor: "var(--divider)" }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Apellido" : "Last Name"}
              </label>
              <Input
                value={newLast}
                onChange={(e) => setNewLast(e.target.value)}
                style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderColor: "var(--divider)" }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                Email
              </label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderColor: "var(--divider)" }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "Teléfono" : "Phone"}
              </label>
              <Input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                style={{ background: "var(--bg-card)", color: "var(--text-primary)", borderColor: "var(--divider)" }}
              />
            </div>
            <button
              onClick={addClient}
              disabled={!newFirst.trim() || saving}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--accent-color)", color: "#fff" }}
            >
              {saving ? (
                <Loader2 size={18} className="animate-spin mx-auto" />
              ) : (
                language === "es" ? "Guardar" : "Save"
              )}
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer
        open={!!selectedClient}
        onOpenChange={(open) => {
          if (!open) {
            profileRequest.current += 1;
            setSelectedClient(null);
            setClientUrlId(null);
          }
        }}
      >
        <DrawerContent
          style={{ background: "var(--bg-base)", borderColor: "var(--divider)" }}
          className="max-h-[90vh]"
        >
          {selectedClient && (
            <div className="overflow-y-auto max-h-[85vh] pb-8">
              <DrawerHeader>
                <DrawerTitle style={{ color: "var(--text-primary)" }}>
                  {fullName(selectedClient)}
                </DrawerTitle>
              </DrawerHeader>

              <div className="px-4 space-y-5">
                <div className="rounded-xl card-elevated p-4 space-y-2">
                  {editingContact ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-medium mb-0.5 block" style={{ color: "var(--text-tertiary)" }}>
                            {language === "es" ? "Nombre" : "First name"}
                          </label>
                          <Input
                            value={editFirstName}
                            onChange={(e) => setEditFirstName(e.target.value)}
                            className="text-sm h-9"
                            style={{ background: "var(--bg-base)", borderColor: "var(--border)" }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-medium mb-0.5 block" style={{ color: "var(--text-tertiary)" }}>
                            {language === "es" ? "Apellido" : "Last name"}
                          </label>
                          <Input
                            value={editLastName}
                            onChange={(e) => setEditLastName(e.target.value)}
                            className="text-sm h-9"
                            style={{ background: "var(--bg-base)", borderColor: "var(--border)" }}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-medium mb-0.5 block" style={{ color: "var(--text-tertiary)" }}>
                          {language === "es" ? "Teléfono" : "Phone"}
                        </label>
                        <Input
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          type="tel"
                          className="text-sm h-9"
                          style={{ background: "var(--bg-base)", borderColor: "var(--border)" }}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium mb-0.5 block" style={{ color: "var(--text-tertiary)" }}>Email</label>
                        <Input
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          type="email"
                          className="text-sm h-9"
                          style={{ background: "var(--bg-base)", borderColor: "var(--border)" }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveContact}
                          disabled={savingContact || !editFirstName.trim()}
                          className="flex-1 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
                          style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
                        >
                          {savingContact ? <Loader2 size={14} className="animate-spin mx-auto" /> : (language === "es" ? "Guardar" : "Save")}
                        </button>
                        <button
                          onClick={() => setEditingContact(false)}
                          className="px-4 py-2 rounded-lg text-xs font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {language === "es" ? "Cancelar" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <div className="space-y-2 flex-1">
                          {selectedClient.phone && (
                            <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-primary)" }}>
                              <Phone size={16} style={{ color: "var(--text-tertiary)" }} />
                              <span className="flex-1">{selectedClient.phone}</span>
                            </div>
                          )}
                          {selectedClient.email && (
                            <div className="flex items-center gap-3 text-sm" style={{ color: "var(--text-primary)" }}>
                              <Mail size={16} style={{ color: "var(--text-tertiary)" }} />
                              <span className="flex-1 truncate">{selectedClient.email}</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setEditFirstName(selectedClient.first_name);
                            setEditLastName(selectedClient.last_name || "");
                            setEditPhone(selectedClient.phone || "");
                            setEditEmail(selectedClient.email || "");
                            setEditingContact(true);
                          }}
                          className="p-1.5"
                        >
                          <Pencil size={14} style={{ color: "var(--accent-color)" }} />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {selectedClient.phone && (
                    <>
                      <a
                        href={`tel:${selectedClient.phone}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                        style={{ background: "var(--bg-card)", color: "var(--text-primary)" }}
                      >
                        <Phone size={14} /> {language === "es" ? "Llamar" : "Call"}
                      </a>
                      <a
                        href={`sms:${selectedClient.phone}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                        style={{ background: "var(--bg-card)", color: "var(--text-primary)" }}
                      >
                        <MessageCircle size={14} /> SMS
                      </a>
                      <button
                        onClick={() => copyText(selectedClient.phone!, "phone")}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                        style={{ background: "var(--bg-card)", color: "var(--text-primary)" }}
                      >
                        {copiedField === "phone" ? <Check size={14} /> : <Copy size={14} />}
                        {copiedField === "phone"
                          ? language === "es" ? "Copiado" : "Copied"
                          : language === "es" ? "Copiar tel" : "Copy phone"}
                      </button>
                    </>
                  )}
                  {selectedClient.email && (
                    <>
                      <a
                        href={`mailto:${selectedClient.email}`}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                        style={{ background: "var(--bg-card)", color: "var(--text-primary)" }}
                      >
                        <Mail size={14} /> Email
                      </a>
                      <button
                        onClick={() => copyText(selectedClient.email!, "email")}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                        style={{ background: "var(--bg-card)", color: "var(--text-primary)" }}
                      >
                        {copiedField === "email" ? <Check size={14} /> : <Copy size={14} />}
                        {copiedField === "email"
                          ? language === "es" ? "Copiado" : "Copied"
                          : language === "es" ? "Copiar email" : "Copy email"}
                      </button>
                    </>
                  )}
                </div>

                {isOwner && <ClientBirthdayField clientId={selectedClient.id} />}

                {/* Wallet / Card info */}
                {selectedClient.card_brand && selectedClient.card_last4 && (
                  <div className="rounded-xl card-elevated p-4 flex items-center gap-3">
                    <CreditCard size={20} style={{ color: "var(--accent-color)" }} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        {selectedClient.card_brand.toUpperCase()} •••• {selectedClient.card_last4}
                      </p>
                      <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        {language === "es" ? "Tarjeta guardada" : "Saved card"}
                      </p>
                    </div>
                    {selectedClient.stripe_customer_id && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                        style={{ background: "var(--accent-dim)", color: "var(--nav-accent)" }}>
                        Wallet
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <div className="flex-1 rounded-xl card-elevated p-3 text-center">
                    <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                      {loadingProfile ? <Loader2 size={18} className="animate-spin mx-auto" /> : history.length}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {language === "es" ? "Visitas" : "Visits"}
                    </div>
                  </div>
                  <div className="flex-1 rounded-xl card-elevated p-3 text-center">
                    <div className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                      {loadingProfile ? <Loader2 size={18} className="animate-spin mx-auto" /> : profileFailed ? (language === "es" ? "No disponible" : "Unavailable") : fmt(serviceSpent + productSpent)}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {language === "es" ? "Total gastado" : "Total spent"}
                    </div>
                  </div>
                  {lastPaymentMethod && (
                    <div className="flex-1 rounded-xl card-elevated p-3 text-center">
                      <div className="text-sm font-bold capitalize" style={{ color: "var(--text-primary)" }}>
                        {lastPaymentMethod.replace("_", " ")}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {language === "es" ? "Último pago" : "Last payment"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Spending breakdown */}
                {!loadingProfile && !profileFailed && (serviceSpent > 0 || productSpent > 0) && (
                  <div className="flex gap-3">
                    <div className="flex-1 rounded-xl card-elevated p-3 text-center">
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {fmt(serviceSpent)}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        {language === "es" ? "En servicios" : "On services"}
                      </div>
                    </div>
                    <div className="flex-1 rounded-xl card-elevated p-3 text-center">
                      <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                        {fmt(productSpent)}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        {language === "es" ? "En productos" : "On products"}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl card-elevated p-4">
                  <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>
                    {language === "es" ? "Barbero preferido" : "Preferred barber"}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setEditBarber(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{
                        background: !editBarber ? "var(--accent-color)" : "var(--bg-card)",
                        color: !editBarber ? "#fff" : "var(--text-primary)",
                      }}
                    >
                      {language === "es" ? "Ninguno" : "None"}
                    </button>
                    {barbers
                      .filter((b) => b.is_active)
                      .map((b) => (
                        <button
                          key={b.id}
                          onClick={() => setEditBarber(b.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{
                            background: editBarber === b.id ? "var(--accent-color)" : "var(--bg-card)",
                            color: editBarber === b.id ? "#fff" : "var(--text-primary)",
                          }}
                        >
                          {b.name}
                        </button>
                      ))}
                  </div>
                </div>

                <div className="rounded-xl card-elevated p-4">
                  <label className="text-xs font-medium mb-2 block" style={{ color: "var(--text-secondary)" }}>
                    {language === "es" ? "Notas" : "Notes"}
                  </label>
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                    className="border-0 text-sm"
                    style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
                  />
                </div>

                {(editNotes !== (selectedClient.notes || "") ||
                  editBarber !== selectedClient.preferred_barber_id) && (
                  <button
                    onClick={saveProfile}
                    disabled={savingProfile}
                    className="w-full py-3 rounded-xl text-sm font-semibold"
                    style={{ background: "var(--accent-color)", color: "#fff" }}
                  >
                    {savingProfile ? (
                      <Loader2 size={18} className="animate-spin mx-auto" />
                    ) : (
                      language === "es" ? "Guardar cambios" : "Save changes"
                    )}
                  </button>
                )}

                {/* Referral network: upline + collapsible downlines */}
                <ClientReferralNetwork
                  clientId={selectedClient.id}
                  isEs={language === "es"}
                  onOpenClient={(id) => {
                    const next = clients.find((c) => c.id === id);
                    if (next) openProfile(next);
                  }}
                />

                {/* Previous Appointments - Collapsible */}
                <div ref={previousSectionRef}>
                  <button
                    onClick={() => setApptExpanded(!apptExpanded)}
                    className="flex items-center justify-between w-full py-2"
                  >
                    <h3 className="text-xs font-bold uppercase" style={{ color: "var(--text-tertiary)" }}>
                      {language === "es" ? `Citas anteriores (${history.length})` : `Previous Appointments (${history.length})`}
                    </h3>
                    <ChevronRight
                      size={16}
                      className="transition-transform"
                      style={{
                        color: "var(--text-tertiary)",
                        transform: apptExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    />
                  </button>
                  {loadingProfile ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
                    </div>
                  ) : apptExpanded && history.length === 0 ? (
                    <p className="text-xs py-3" style={{ color: "var(--text-tertiary)" }}>
                      {language === "es" ? "Sin citas anteriores" : "No previous appointments"}
                    </p>
                  ) : apptExpanded ? (
                    <>
                      <div className="rounded-xl overflow-hidden card-elevated">
                        {history.slice(0, apptLimit).map((appt, i) => (
                          <button
                            key={appt.id}
                            onClick={() => { setSelectedClient(null); setClientUrlId(null); navigate(`/admin/appointment/${appt.id}`); }}
                            className="w-full px-4 py-3 flex items-center gap-3 text-left"
                            style={{
                              borderBottom: i < Math.min(history.length, apptLimit) - 1 ? "1px solid var(--divider)" : "none",
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                {appt.service_name}
                              </div>
                              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                {format(parseISO(appt.starts_at), "d MMM yyyy", { locale })} · {barberName(appt.barber_id)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                                {fmt(appt.price_cents)}
                              </div>
                              <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
                            </div>
                          </button>
                        ))}
                      </div>
                      {history.length > apptLimit && (
                        <button
                          onClick={() => setApptLimit((l) => l + 20)}
                          className="w-full py-2.5 mt-2 rounded-xl text-xs font-semibold"
                          style={{ background: "var(--bg-card)", color: "var(--accent-color)" }}
                        >
                          {language === "es"
                            ? `Ver ${Math.min(20, history.length - apptLimit)} más`
                            : `Show ${Math.min(20, history.length - apptLimit)} more`}
                        </button>
                      )}
                    </>
                  ) : null}
                </div>

                {/* Upcoming Appointments - Collapsible */}
                <div ref={upcomingSectionRef}>
                  <button
                    onClick={() => setUpcomingExpanded(!upcomingExpanded)}
                    className="flex items-center justify-between w-full py-2"
                  >
                    <h3 className="text-xs font-bold uppercase" style={{ color: "var(--text-tertiary)" }}>
                      {language === "es" ? `Próximas citas (${upcomingHistory.length})` : `Upcoming Appointments (${upcomingHistory.length})`}
                    </h3>
                    <ChevronRight
                      size={16}
                      className="transition-transform"
                      style={{
                        color: "var(--text-tertiary)",
                        transform: upcomingExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    />
                  </button>
                  {loadingProfile ? (
                    <div className="flex justify-center py-4">
                      <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-color)" }} />
                    </div>
                  ) : upcomingExpanded && upcomingHistory.length === 0 ? (
                    <p className="text-xs py-3" style={{ color: "var(--text-tertiary)" }}>
                      {language === "es" ? "Sin próximas citas" : "No upcoming appointments"}
                    </p>
                  ) : upcomingExpanded ? (
                    <>
                      <div className="rounded-xl overflow-hidden card-elevated">
                        {upcomingHistory.slice(0, upcomingLimit).map((appt, i) => (
                          <button
                            key={appt.id}
                            onClick={() => { setSelectedClient(null); setClientUrlId(null); navigate(`/admin/appointment/${appt.id}`); }}
                            className="w-full px-4 py-3 flex items-center gap-3 text-left"
                            style={{
                              borderBottom: i < Math.min(upcomingHistory.length, upcomingLimit) - 1 ? "1px solid var(--divider)" : "none",
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                {appt.service_name}
                              </div>
                              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                {format(parseISO(appt.starts_at), "d MMM yyyy", { locale })} · {barberName(appt.barber_id)}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                                {fmt(appt.price_cents)}
                              </div>
                              <ChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
                            </div>
                          </button>
                        ))}
                      </div>
                      {upcomingHistory.length > upcomingLimit && (
                        <button
                          onClick={() => setUpcomingLimit((l) => l + 20)}
                          className="w-full py-2.5 mt-2 rounded-xl text-xs font-semibold"
                          style={{ background: "var(--bg-card)", color: "var(--accent-color)" }}
                        >
                          {language === "es"
                            ? `Ver ${Math.min(20, upcomingHistory.length - upcomingLimit)} más`
                            : `Show ${Math.min(20, upcomingHistory.length - upcomingLimit)} more`}
                        </button>
                      )}
                    </>
                  ) : null}
                </div>

                {/* Product Purchase History - Collapsible */}
                <div>
                  <button
                    onClick={() => setProdExpanded(!prodExpanded)}
                    className="flex items-center justify-between w-full py-2"
                  >
                    <h3 className="text-xs font-bold uppercase" style={{ color: "var(--text-tertiary)" }}>
                      {language === "es" ? `Compras anteriores (${productHistory.length})` : `Previous Purchases (${productHistory.length})`}
                    </h3>
                    <ChevronRight
                      size={16}
                      className="transition-transform"
                      style={{
                        color: "var(--text-tertiary)",
                        transform: prodExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    />
                  </button>
                  {prodExpanded && productHistory.length === 0 ? (
                    <p className="text-xs py-3" style={{ color: "var(--text-tertiary)" }}>
                      {language === "es" ? "Sin compras anteriores" : "No previous purchases"}
                    </p>
                  ) : prodExpanded ? (
                    <>
                      <div className="rounded-xl overflow-hidden card-elevated">
                        {productHistory.slice(0, prodLimit).map((tx, i) => (
                          <div
                            key={tx.id}
                            className="px-4 py-3 flex items-center gap-3"
                            style={{
                              borderBottom: i < Math.min(productHistory.length, prodLimit) - 1 ? "1px solid var(--divider)" : "none",
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                {tx.name}
                              </div>
                              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                {format(parseISO(tx.created_at), "d MMM yyyy", { locale })} · {tx.payment_method.replace("_", " ")}
                              </div>
                            </div>
                            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                              {fmt(tx.total_cents)}
                            </div>
                          </div>
                        ))}
                      </div>
                      {productHistory.length > prodLimit && (
                        <button
                          onClick={() => setProdLimit((l) => l + 50)}
                          className="w-full py-2.5 mt-2 rounded-xl text-xs font-semibold"
                          style={{ background: "var(--bg-card)", color: "var(--accent-color)" }}
                        >
                          {language === "es"
                            ? `Ver ${Math.min(50, productHistory.length - prodLimit)} más`
                            : `Show ${Math.min(50, productHistory.length - prodLimit)} more`}
                        </button>
                      )}
                    </>
                  ) : null}
                </div>

                <button
                  onClick={() => navigate("/admin/appointment/new")}
                  className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                  style={{ background: "var(--bg-card)", color: "var(--accent-color)", border: "1px solid var(--divider)" }}
                >
                  <CalendarIcon size={16} />
                  {language === "es" ? "Reservar nueva cita" : "Book new appointment"}
                </button>

                {isOwner && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mt-2"
                    style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}
                  >
                    <Trash2 size={16} />
                    {language === "es" ? "Eliminar cliente" : "Delete client"}
                  </button>
                )}

                {showDeleteConfirm && (
                  <div
                    className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none px-6"
                    onClick={() => !deleting && setShowDeleteConfirm(false)}
                    style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
                  >
                    <motion.div
                      initial={{ scale: 0.92, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      onClick={(e) => e.stopPropagation()}
                      className="pointer-events-auto w-full max-w-[320px] flex flex-col items-center gap-3 px-6 py-7"
                      style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)" }}
                    >
                      <span className="text-[11px] font-semibold tracking-wide uppercase"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", borderRadius: 10, padding: "4px 14px" }}>
                        {language === "es" ? "Eliminar" : "Delete"}
                      </span>

                      <p className="text-[22px] font-black text-center"
                        style={{ color: "#111111", letterSpacing: "-1px" }}>
                        {fullName(selectedClient)}
                      </p>

                      <p className="text-sm text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
                        {language === "es"
                          ? "¿Estás seguro? Esta acción no se puede deshacer."
                          : "Are you sure? This action cannot be undone."}
                      </p>

                      <div className="w-full flex flex-col gap-3 mt-3">
                        <button
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={handleDeleteClient}
                          disabled={deleting}
                          className="w-full py-3 font-semibold text-[13px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                          style={{ background: "#ef4444", color: "#ffffff", borderRadius: "var(--radius-control)" }}
                        >
                          {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          {language === "es" ? "Eliminar cliente" : "Delete client"}
                        </button>
                        <button
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => setShowDeleteConfirm(false)}
                          disabled={deleting}
                          className="w-full py-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
                          style={{ background: "transparent", color: "#111111", borderRadius: "var(--radius-control)", border: "1px solid rgba(0,0,0,0.1)" }}
                        >
                          {language === "es" ? "Cancelar" : "Cancel"}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}

                {/* Delete-success popup is rendered at the page root (after </Drawer>)
                    so it persists after selectedClient is cleared and the drawer unmounts. */}
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* Delete-success popup — rendered at page root so it remains visible
          after the client drawer closes. */}
      {showDeleteSuccess && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center pointer-events-none px-6"
          onClick={() => setShowDeleteSuccess(false)}
          style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto w-full max-w-[320px] flex flex-col items-center gap-3 px-6 py-7"
            style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.1)" }}
          >
            <span className="text-[11px] font-semibold tracking-wide uppercase"
              style={{ background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)", borderRadius: 10, padding: "4px 14px" }}>
              {language === "es" ? "Eliminado" : "Deleted"}
            </span>

            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: [0, 1.2, 1], rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, duration: 0.6 }}
              className="my-2"
            >
              <CheckCircle className="icon-bold" size={56} color="#22c55e" />
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-[22px] font-black text-center"
              style={{ color: "#111111", letterSpacing: "-1px" }}
            >
              {deletedName}
            </motion.p>

            <p className="text-[13px] text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
              {language === "es" ? "Cliente eliminado exitosamente" : "Client deleted successfully"}
            </p>

            <button
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setShowDeleteSuccess(false)}
              className="w-full py-3 mt-3 font-semibold text-[13px] active:scale-[0.98] transition-transform"
              style={{ background: "#111111", color: "#ffffff", borderRadius: "var(--radius-control)" }}
            >
              {language === "es" ? "Cerrar" : "Close"}
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
