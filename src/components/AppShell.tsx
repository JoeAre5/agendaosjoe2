import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav, TabId } from "@/components/BottomNav";
import { useAuth } from "@/hooks/useAuth";
import { usePendingTransactionAlerts } from "@/hooks/usePendingTransactionAlerts";
import { useAutoEnablePush } from "@/hooks/useAutoEnablePush";
import { usePreferences } from "@/hooks/usePreferences";
import { useClientDuplicateBadges } from "@/contexts/ClientDuplicateBadgesContext";
import { hamburgerPendingCount } from "@/lib/clientDuplicateBadges";

import { ResumenTab } from "@/components/tabs/ResumenTab";
import { CalendarTab } from "@/components/tabs/CalendarTab";
import { CheckoutTab, CheckoutIntent } from "@/components/tabs/CheckoutTab";
import { MenuTab } from "@/components/tabs/MenuTab";

const BARBER_TABS: TabId[] = ["calendar", "checkout", "menu"];
const OWNER_TABS: TabId[] = ["home", "calendar", "checkout", "menu"];

export function AppShell() {
  const { role } = useAuth();
  const { count: clientDuplicateCount } = useClientDuplicateBadges();
  const isBarber = role === "barber";
  const availableTabs = isBarber ? BARBER_TABS : OWNER_TABS;

  // Shop-wide pending-transaction alerts (toast + browser notification)
  usePendingTransactionAlerts({ enabled: role === "owner" || role === "barber" });

  // Silently re-subscribe this device to push when an admin signs in and
  // notification permission was previously granted. Prevents the "logged in
  // with the wrong account → no alerts" trap.
  const { language } = usePreferences();
  useAutoEnablePush(language === "en" ? "en" : "es");

  const [searchParams, setSearchParams] = useSearchParams();
  const [checkoutIntent, setCheckoutIntent] = useState<CheckoutIntent | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // ─── URL-DRIVEN ACTIVE TAB ────────────────────────────────────────────
  // Phase 1B.UX: tab lives in the URL so refresh / Safari restore / shared
  // links all land on the same tab. Default depends on role.
  const defaultTab: TabId = isBarber ? "calendar" : "home";
  const urlTab = searchParams.get("tab") as TabId | null;
  const validTabs: TabId[] = ["home", "calendar", "checkout", "menu"];
  const activeTab: TabId =
    urlTab && validTabs.includes(urlTab) && (!isBarber || urlTab !== "home")
      ? urlTab
      : defaultTab;

  // Helper to change tab → updates URL (replace, so back button still works)
  const setActiveTab = useCallback(
    (tab: TabId) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      // Clear one-shot intent params when switching away from checkout
      if (tab !== "checkout") {
        next.delete("checkout");
        next.delete("apptId");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Auto-correct: barber landed on /admin?tab=home → push them to calendar
  useEffect(() => {
    if (isBarber && urlTab === "home") {
      setActiveTab("calendar");
    }
  }, [isBarber, urlTab, setActiveTab]);

  // Fetch pending_review tx + unread inbox + recruitment + duplicate appts (badge)
  // Single RPC round-trip (replaces 4-5 client-side queries) + 800ms debounce
  // so that bursts of webhook-driven realtime events coalesce into one fetch.
  useEffect(() => {
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const runFetch = async () => {
      const { data, error } = await supabase.rpc("get_pending_badge_counts");
      if (cancelled || error || !data) return;
      const row: any = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      const total =
        (row.pending_review_count || 0) +
        (row.contact_count || 0) +
        (row.recruitment_count || 0) +
        (row.duplicate_count || 0);
      setPendingCount(total);
    };

    const fetchCount = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runFetch, 800);
    };

    // Initial fetch immediately (no debounce on mount)
    runFetch();

    // Realtime: filter where possible. transactions/appointments are shop-wide
    // (no per-client filter for staff badge); debounce coalesces bursts.
    const channel = supabase
      .channel("pending-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, fetchCount)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contact_submissions" }, fetchCount)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contact_submissions", filter: "status=eq.new" }, fetchCount)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "recruitment_submissions" }, fetchCount)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "recruitment_submissions", filter: "status=eq.new" }, fetchCount)
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, fetchCount)
      .subscribe();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // Handle checkout entry from URL params (e.g. from AppointmentDetail).
  // Consume one-shot params (checkout=appointment&apptId=...) but keep ?tab.
  useEffect(() => {
    const mode = searchParams.get("checkout");
    const apptId = searchParams.get("apptId");
    if (mode === "appointment" && apptId) {
      setCheckoutIntent({ type: "appointment", appointmentId: apptId });
      const next = new URLSearchParams(searchParams);
      next.set("tab", "checkout");
      next.delete("checkout");
      next.delete("apptId");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openCheckoutWithIntent = useCallback((intent: CheckoutIntent) => {
    setCheckoutIntent(intent);
    setActiveTab("checkout");
  }, [setActiveTab]);

  const handleTabChange = useCallback((tab: TabId) => {
    if (tab !== "checkout") {
      setCheckoutIntent(null);
    }
    setActiveTab(tab);
  }, [setActiveTab]);

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
        {activeTab === "home" && <ResumenTab />}
        {activeTab === "calendar" && (
          <CalendarTab onOpenCheckout={openCheckoutWithIntent} />
        )}
        {activeTab === "checkout" && (
          <CheckoutTab
            intent={checkoutIntent}
            onIntentConsumed={() => setCheckoutIntent(null)}
          />
        )}
        {activeTab === "menu" && <MenuTab />}
      </div>

      
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} pendingCount={hamburgerPendingCount(pendingCount, clientDuplicateCount)} availableTabs={availableTabs} />
    </div>
  );
}
