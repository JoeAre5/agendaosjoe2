import { useState, useEffect, useCallback, type ReactNode } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Home, CalendarDays, User, MapPin, Gift, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { GlobalBottomNavShell } from "@/components/GlobalBottomNavShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAutoEnablePush } from "@/hooks/useAutoEnablePush";
import { useTranslation } from "@/hooks/useTranslation";

import { toast } from "sonner";
import ClientOnboarding from "@/components/ClientOnboarding";
import { AnimatedOrbNavIcon } from "@/components/AnimatedOrbNavIcon";
import InicioTab from "@/components/portal/InicioTab";
import CitasTab from "@/components/portal/CitasTab";
import BeneficiosTab from "@/components/portal/BeneficiosTab";
import PerfilTab from "@/components/portal/PerfilTab";
import ContactoTab from "@/components/portal/ContactoTab";
import CancelModal from "@/components/portal/CancelModal";
import type { PortalAppointment } from "@/components/portal/types";
import BroadcastModal from "@/components/portal/BroadcastModal";

type ClientTabId = "inicio" | "citas" | "beneficios" | "contacto" | "perfil";

const CLIENT_TABS: { id: ClientTabId; icon: any }[] = [
  { id: "inicio", icon: Home },
  { id: "citas", icon: CalendarDays },
  { id: "contacto", icon: MapPin },
  { id: "perfil", icon: User },
];

// Decorative center slot index (between citas and beneficios)
const ORB_SLOT_INDEX = 2;


// SessionStorage cache for instant paint on remount. TTL kept short so stale
// data never lingers more than a minute. Cleared on signOut (AuthContext).
const PORTAL_CACHE_KEY = "agendaos.client.portal.cache";
const PORTAL_CACHE_TTL_MS = 60_000;

interface ClientRecord {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  preferred_barber_id: string | null;
  account_verified: boolean;
  onboarding_completed: boolean;
  stripe_customer_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  preferred_payment_method: string | null;
  ath_phone: string | null;
  ath_phone_last4: string | null;
  date_of_birth: string | null;
  gender: string | null;
  avatar_url: string | null;
  notify_sms_appointments: boolean;
  notify_whatsapp_appointments: boolean;
  notify_email_appointments: boolean;
  notify_sms_marketing: boolean;
  notify_whatsapp_marketing: boolean;
  notify_email_marketing: boolean;
}

interface Barber {
  id: string;
  name: string;
  color: string | null;
}

export default function ClientPortalV2() {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const localeTag = language === "en" ? "en-US" : "es-PR";
  // Silently re-subscribe to push on every client sign-in if permission is
  // already granted (e.g. user said yes during waitlist signup, then signs in
  // later on a fresh PWA install or new device).
  useAutoEnablePush(language === "en" ? "en" : "es");
  const [searchParams, setSearchParams] = useSearchParams();
  const [replayMode, setReplayMode] = useState(false);
  // Tab can be set via ?tab=inicio|citas|contacto|perfil so other parts of the
  // app (e.g. the new "Contactar barbería" row in Perfil → Ayuda) can deep-link
  // to a specific tab. The param is consumed once and removed from the URL.
  // Tab can come from ?tab=... (deep link) OR from persisted last-tab (resume).
  // Deep link wins; otherwise we restore the last tab the user was on so the
  // PWA doesn't always snap back to "Inicio" after a backgrounded session.
  const initialTab = ((): ClientTabId => {
    const t = searchParams.get("tab");
    if (t === "inicio" || t === "citas" || t === "beneficios" || t === "contacto" || t === "perfil") return t;
    try {
      const saved = localStorage.getItem("agendaos.client.lastTab");
      if (saved === "inicio" || saved === "citas" || saved === "beneficios" || saved === "contacto" || saved === "perfil") return saved;
    } catch { /* private mode / quota */ }
    return "inicio";
  })();
  const [tab, setTabRaw] = useState<ClientTabId>(initialTab);
  const setTab = useCallback((next: ClientTabId) => {
    setTabRaw(next);
    try { localStorage.setItem("agendaos.client.lastTab", next); } catch { /* noop */ }
  }, []);
  const [client, setClient] = useState<ClientRecord | null>(null);

  // Pick up ?replay=true / ?tab=... → apply, then clean URL. Runs on every
  // searchParams change so in-app deep links (e.g. Perfil → "Contactar
  // barbería") switch tabs even when the portal is already mounted.
  useEffect(() => {
    if (searchParams.get("replay") === "true") {
      setReplayMode(true);
    }
    const tParam = searchParams.get("tab");
    if (tParam === "inicio" || tParam === "citas" || tParam === "beneficios" || tParam === "contacto" || tParam === "perfil") {
      setTab(tParam);
    }
    if (searchParams.get("replay") || searchParams.get("tab")) {
      const next = new URLSearchParams(searchParams);
      next.delete("replay");
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, setTab]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [upcoming, setUpcoming] = useState<PortalAppointment[]>([]);
  const [past, setPast] = useState<PortalAppointment[]>([]);
  const [productPurchases, setProductPurchases] = useState<any[]>([]);
  const [cancelWindowHours, setCancelWindowHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<PortalAppointment | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    // Stage 1 — independent reads (parallel).
    // NOTE: clients cannot read public.barbers (RLS allows owner/barber roles only).
    // Use the public view `barbers_public` so the barber name + color resolve.
    const [clientRes, barbersRes, rulesRes] = await Promise.all([
      supabase.from("clients")
        .select("id,first_name,last_name,phone,email,preferred_barber_id,account_verified,onboarding_completed,date_of_birth,gender,avatar_url,ath_phone,ath_phone_last4,notify_sms_appointments,notify_whatsapp_appointments,notify_email_appointments,notify_sms_marketing,notify_whatsapp_marketing,notify_email_marketing")
        .eq("auth_user_id", user.id).single(),
      supabase.from("barbers_public").select("id,name,color").eq("is_active", true),
      supabase.from("booking_rules").select("cancel_window_hours").eq("scope", "global").eq("is_active", true).limit(1).single(),
    ]);

    const barbersList = (barbersRes.data as Barber[]) || [];
    setBarbers(barbersList);
    if (rulesRes.data) setCancelWindowHours((rulesRes.data as any).cancel_window_hours ?? 24);
    if (clientRes.error) {
      console.error("Client fetch error:", clientRes.error);
      setLoading(false);
      return;
    }
    if (!clientRes.data) { setLoading(false); return; }

    const clientId = clientRes.data.id;
    const now = new Date().toISOString();
    const barberMap = Object.fromEntries(barbersList.map((b) => [b.id, b]));

    // Stage 2 — everything that depends on client.id (parallel).
    // Payment details RPC is fused here instead of running on its own.
    // transactions: filter item_type='product' server-side via embedded filter.
    const [payRes, upRes, pastRes, prodRes] = await Promise.all([
      (supabase.rpc as any)("get_client_payment_details", { _client_id: clientId }),
      supabase.from("appointments").select("id,service_name,starts_at,ends_at,status,barber_id,acuity_id,service_id,service_ref_id,duration_minutes")
        .eq("client_id", clientId)
        .in("status", ["scheduled", "confirmed"])
        .gte("starts_at", now)
        .order("starts_at", { ascending: true }),
      supabase.from("appointments").select("id,service_name,starts_at,ends_at,status,barber_id,acuity_id,service_id,service_ref_id,duration_minutes")
        .eq("client_id", clientId)
        .lt("starts_at", now)
        .not("status", "in", "(cancelled,no-show)")
        .order("starts_at", { ascending: false })
        .limit(20),
      supabase.from("transactions")
        .select("id,created_at,transaction_items!inner(id,name,quantity,unit_price_cents,total_cents,item_type)")
        .eq("client_id", clientId)
        .eq("status", "completed")
        .eq("transaction_items.item_type", "product")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const pay = ((payRes as any)?.data as any[])?.[0] || {};
    const nextClient = {
      ...(clientRes.data as object),
      stripe_customer_id: pay.stripe_customer_id ?? null,
      card_brand: pay.card_brand ?? null,
      card_last4: pay.card_last4 ?? null,
      preferred_payment_method: pay.preferred_payment_method ?? null,
    } as ClientRecord;
    setClient(nextClient);

    const mapAppt = (a: any): PortalAppointment => ({
      ...a,
      barber_name: barberMap[a.barber_id]?.name || "—",
      barber_color: barberMap[a.barber_id]?.color || null,
    });

    const nextUpcoming = (upRes.data || []).map(mapAppt);
    const nextPast = (pastRes.data || []).map(mapAppt);
    // item_type filter applied server-side (transaction_items!inner + eq).
    const nextProducts = (prodRes.data || []).flatMap((tx: any) =>
      (tx.transaction_items || []).map((ti: any) => ({ ...ti, purchased_at: tx.created_at }))
    );

    setUpcoming(nextUpcoming);
    setPast(nextPast);
    setProductPurchases(nextProducts);

    // Persist a short-lived snapshot for instant render on next mount.
    try {
      sessionStorage.setItem(PORTAL_CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        userId: user.id,
        client: nextClient,
        barbers: barbersList,
        upcoming: nextUpcoming,
        past: nextPast,
        productPurchases: nextProducts,
        cancelWindowHours: (rulesRes.data as any)?.cancel_window_hours ?? 24,
      }));
    } catch { /* quota / private mode */ }

    setLoading(false);
  }, [user]);

  // Hydrate from sessionStorage cache (TTL 60s) for instant paint, then
  // refetch in the background to refresh.
  useEffect(() => {
    if (!user) return;
    let usedCache = false;
    try {
      const raw = sessionStorage.getItem(PORTAL_CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (c?.userId === user.id && Date.now() - c.ts < PORTAL_CACHE_TTL_MS) {
          setClient(c.client);
          setBarbers(c.barbers || []);
          setUpcoming(c.upcoming || []);
          setPast(c.past || []);
          setProductPurchases(c.productPurchases || []);
          if (typeof c.cancelWindowHours === "number") setCancelWindowHours(c.cancelWindowHours);
          setLoading(false);
          usedCache = true;
        }
      }
    } catch { /* ignore */ }
    // Always refetch (background if cache was used, foreground otherwise).
    fetchData();
    void usedCache;
  }, [fetchData, user]);

  // Refetch on window focus (PWA home-screen users)
  useEffect(() => {
    const onFocus = () => fetchData();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData]);

  // Realtime subscription for appointment changes — scoped to THIS client only
  // (filter prevents fetchData from firing on every shop-wide appointment change).
  useEffect(() => {
    if (!client?.id) return;
    const channel = supabase
      .channel(`client-portal-appointments-${client.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `client_id=eq.${client.id}` },
        () => { fetchData(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData, client?.id]);

  // Simple cancel: paid OR unpaid both call the same edge function which
  // cancels in Acuity + marks the row. For paid appointments the row stays
  // visible in Sales with refund_status='manual' so Charlie can issue the
  // refund by hand from the receipt. No undo, no auto-refund.
  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("client-booking-refund", {
        body: { action: "schedule", appointment_id: cancelTarget.id },
      });
      if (error) throw error;
      if (data?.error === "outside_window") {
        toast.error(t("portal.clientPortal.cancelOutsideWindow", { h: data.windowHrs }));
        setCancelTarget(null);
        return;
      }
      if (data?.error) throw new Error(data.error);

      setCancelTarget(null);

      if (data?.will_refund) {
        toast.success(t("portal.clientPortal.cancelledManualRefund"));
      } else {
        toast.success(t("portal.clientPortal.cancelledNoRefund"));
      }
      fetchData();
    } catch (e: any) {
      toast.error(e.message || t("portal.clientPortal.cancelError"));
    } finally {
      setCancelling(false);
    }
  };

  const cancelHoursUntilStart = cancelTarget
    ? (new Date(cancelTarget.starts_at).getTime() - Date.now()) / 36e5
    : undefined;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  // Onboarding overlay — first-timer, fresh login (force flag), or explicit replay
  const forceOnboarding = (() => {
    try {
      return sessionStorage.getItem("agendaos.force_onboarding") === "1"
        || localStorage.getItem("agendaos.force_onboarding") === "1";
    } catch { return false; }
  })();
  if (client && (!client.onboarding_completed || replayMode || forceOnboarding)) {
    return (
      <ClientOnboarding
        firstName={client.first_name}
        gender={client.gender}
        replay={replayMode}
        finishDestination="/app/cliente"
        onComplete={async () => {
          setReplayMode(false);
          try { sessionStorage.removeItem("agendaos.force_onboarding"); } catch { /* noop */ }
          try { localStorage.removeItem("agendaos.force_onboarding"); } catch { /* noop */ }
          await fetchData();
        }}
      />
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 gap-4" style={{ background: "var(--bg-base)" }}>
        <p className="text-sm text-center" style={{ color: "var(--text-secondary)" }}>
          {t("portal.clientPortal.noProfile")}
        </p>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/login";
          }}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}
        >
          {t("portal.clientPortal.backToLogin")}
        </button>
      </div>
    );
  }

  const cancelDateTime = cancelTarget
    ? `${new Date(cancelTarget.starts_at).toLocaleDateString(localeTag, { weekday: "short", month: "short", day: "numeric" })} · ${new Date(cancelTarget.starts_at).toLocaleTimeString(localeTag, { hour: "numeric", minute: "2-digit", hour12: true })}`
    : "";
  // 5 visual slots: [inicio, citas, ORB, contacto, perfil]
  const tabSlotIndex = (() => {
    const i = CLIENT_TABS.findIndex(({ id }) => id === tab);
    if (i < 0) return 0;
    return i < ORB_SLOT_INDEX ? i : i + 1;
  })();
  const activeTabIndex = tabSlotIndex;

  return (
    <div
      className="relative mx-auto w-full min-h-screen"
      style={{
        maxWidth: 430,
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Scrollable content area */}
      <div className="pb-[calc(96px+env(safe-area-inset-bottom,0px))]">
        {tab === "inicio" && (
          <InicioTab
            firstName={client.first_name}
            upcoming={upcoming}
            past={past}
            cancelWindowHours={cancelWindowHours}
            onCancel={setCancelTarget}
            onTabChange={(t) => setTab(t as any)}
            preferredBarberName={
              client.preferred_barber_id
                ? barbers.find((b) => b.id === client.preferred_barber_id)?.name ?? null
                : null
            }
          />
        )}
        {tab === "citas" && (
          <CitasTab upcoming={upcoming} past={past} cancelWindowHours={cancelWindowHours} onCancel={setCancelTarget} productPurchases={productPurchases} />
        )}
        {tab === "beneficios" && <BeneficiosTab />}
        {tab === "contacto" && <ContactoTab firstName={client.first_name} />}
        {tab === "perfil" && (
          <PerfilTab client={client} barbers={barbers} onUpdate={fetchData} />
        )}
      </div>

      

      {/* Bottom nav — 5 visual slots: tabs + decorative center orb */}
      <GlobalBottomNavShell tabsCount={CLIENT_TABS.length + 1} activeIndex={activeTabIndex}>
        {(() => {
          const slots: ReactNode[] = [];
          CLIENT_TABS.forEach(({ id, icon: Icon }, i) => {
            if (i === ORB_SLOT_INDEX) {
              slots.push(
                <Link
                  key="orb"
                  to="/app/cliente/filho"
                  aria-label={language === "es" ? "Pregúntale a Filho" : "Ask Filho"}
                  className="relative flex items-center justify-center flex-1 active:scale-95 transition-transform"
                  style={{ height: "100%", zIndex: 10 }}
                >
                  <AnimatedOrbNavIcon size={32} />
                </Link>
              );
            }
            const isActive = tab === id;
            slots.push(
              <button
                key={id}
                onClick={() => setTab(id)}
                className="relative flex items-center justify-center flex-1"
                style={{ height: "100%", zIndex: 1 }}
              >
                <Icon
                  size={24}
                  strokeWidth={1.5}
                  style={{
                    color: isActive ? "var(--nav-accent)" : "var(--nav-icon-inactive)",
                    position: "relative",
                    zIndex: 1,
                  }}
                />
              </button>
            );
          });
          return slots;
        })()}
      </GlobalBottomNavShell>

      {/* Cancel modal */}
      {cancelTarget && (
        <CancelModal
          serviceName={cancelTarget.service_name}
          barberName={cancelTarget.barber_name}
          dateTime={cancelDateTime}
          onConfirm={handleCancel}
          onDismiss={() => setCancelTarget(null)}
          loading={cancelling}
          startsAt={cancelTarget.starts_at}
        />
      )}

      {/* Broadcast modal — mass push popup */}
      <BroadcastModal clientId={client?.id ?? null} />
    </div>
  );
}
