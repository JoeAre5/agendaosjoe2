import { AppShell } from "@/components/AppShell";
import { DesktopAdminShell } from "@/components/admin/DesktopAdminShell";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useAuth } from "@/hooks/useAuth";

/**
 * Responsive entrypoint for /admin.
 * - Barbers: ALWAYS mobile AppShell (any viewport/orientation).
 * - Owners (admin) on <768px: mobile AppShell.
 * - Owners (admin) on ≥768px: Linear-style left sidebar + fluid content area.
 */
export function ResponsiveAdminShell() {
  const bp = useBreakpoint();
  const { isOwner } = useAuth();
  if (!isOwner) return <AppShell />;
  if (bp === "mobile") return <AppShell />;
  return <DesktopAdminShell />;
}
