import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePendingTransactionAlerts } from "@/hooks/usePendingTransactionAlerts";
import { useAutoEnablePush } from "@/hooks/useAutoEnablePush";
import { usePreferences } from "@/hooks/usePreferences";

import { ResumenTab } from "@/components/tabs/ResumenTab";
import { CalendarTab } from "@/components/tabs/CalendarTab";
import { CheckoutTab, type CheckoutIntent } from "@/components/tabs/CheckoutTab";
import { MenuTab } from "@/components/tabs/MenuTab";
import type { TabId } from "@/components/BottomNav";

/**
 * Desktop & tablet tab content for /admin.
 * The sidebar lives in AdminLayout so it persists across all /admin/* routes.
 * This component just renders the active tab inside the layout's <Outlet/>.
 */
export function DesktopAdminShell() {
  const { role } = useAuth();
  const isBarber = role === "barber";

  usePendingTransactionAlerts({ enabled: role === "owner" || role === "barber" });

  const { language } = usePreferences();
  useAutoEnablePush(language === "en" ? "en" : "es");

  const [searchParams, setSearchParams] = useSearchParams();
  const [checkoutIntent, setCheckoutIntent] = useState<CheckoutIntent | null>(null);

  const defaultTab: TabId = isBarber ? "calendar" : "home";
  const urlTab = searchParams.get("tab") as TabId | null;
  const validTabs: TabId[] = ["home", "calendar", "checkout", "menu"];
  const activeTab: TabId =
    urlTab && validTabs.includes(urlTab) && (!isBarber || urlTab !== "home")
      ? urlTab
      : defaultTab;

  const setActiveTab = useCallback(
    (tab: TabId) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", tab);
      if (tab !== "checkout") {
        next.delete("checkout");
        next.delete("apptId");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  useEffect(() => {
    if (isBarber && urlTab === "home") setActiveTab("calendar");
  }, [isBarber, urlTab, setActiveTab]);

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



  return (
    <div
      className="mx-auto w-full"
      style={{
        maxWidth: 430,
        paddingBottom: 48,
      }}
    >
      {activeTab === "home" && <ResumenTab />}
      {activeTab === "calendar" && <CalendarTab onOpenCheckout={openCheckoutWithIntent} />}
      {activeTab === "checkout" && (
        <CheckoutTab
          intent={checkoutIntent}
          onIntentConsumed={() => setCheckoutIntent(null)}
        />
      )}
      {activeTab === "menu" && <MenuTab />}
    </div>
  );
}

