import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useAuth } from "@/hooks/useAuth";
import { useClientDuplicateBadges } from "@/contexts/ClientDuplicateBadgesContext";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import type { TabId } from "@/components/BottomNav";

const COLLAPSED_KEY = "admin-sidebar-collapsed";

/**
 * Desktop/tablet admin layout — keeps the Linear-style sidebar mounted
 * across every /admin/* route. Mobile renders just <Outlet/> so each
 * page keeps its existing mobile shell (AppShell / SubpageHeader).
 */
export function AdminLayout() {
  const bp = useBreakpoint();
  const { isOwner } = useAuth();
  const { count: clientDuplicateCount } = useClientDuplicateBadges();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [pendingCount, setPendingCount] = useState(0);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = window.localStorage.getItem(COLLAPSED_KEY);
    if (stored != null) return stored === "1";
    return window.innerWidth < 1024;
  });
  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Pending badge — same RPC strategy as AppShell
  useEffect(() => {
    if (bp === "mobile") return;
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

    runFetch();
    const channel = supabase
      .channel("pending-badge-layout")
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
  }, [bp]);

  if (bp === "mobile" || !isOwner) return <Outlet />;

  const onAdminRoot = location.pathname === "/admin";
  const urlTab = searchParams.get("tab") as TabId | null;
  // Only highlight a tab when we're on /admin (the tab host). On sub-routes
  // the sidebar highlights the route instead.
  const activeTab: TabId = (onAdminRoot && urlTab ? urlTab : "home") as TabId;

  const handleTabChange = (tab: TabId) => {
    navigate(`/admin?tab=${tab}`);
  };

  return (
    <div
      className="flex w-full min-h-screen"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      <AdminSidebar
        activeTab={onAdminRoot ? activeTab : ("__none__" as TabId)}
        onTabChange={handleTabChange}
        pendingCount={pendingCount}
        clientDuplicateCount={clientDuplicateCount}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
      />
      <main
        className="flex-1 min-w-0"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <Outlet />
      </main>
    </div>
  );
}
