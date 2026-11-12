import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { SplashScreen } from "@/components/SplashScreen";

type AppRole = Database["public"]["Enums"]["app_role"];

const STAFF_ROLES: AppRole[] = ["owner", "barber"];

function getSafeRedirect(role: AppRole | null) {
  if (role === "client") return "/portal";
  if (role === "owner" || role === "barber") return "/admin";
  return "/login";
}

interface RoleGuardProps {
  children: ReactNode;
  ownerOnly?: boolean;
  allowedRoles?: AppRole[];
  unauthenticatedRedirect?: string;
  unauthorizedRedirect?: string;
}

export function RoleGuard({
  children,
  ownerOnly = false,
  allowedRoles,
  unauthenticatedRedirect = "/login",
  unauthorizedRedirect,
}: RoleGuardProps) {
  const { session, role, loading } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return <SplashScreen />;
  }

  if (!session) {
    return <Navigate to={unauthenticatedRedirect} replace />;
  }

  // Session exists but role hasn't resolved yet (e.g. provision-oauth-client
  // edge call is in flight or transiently failed on a Safari bfcache restore).
  // Show splash instead of redirecting — redirecting to /login would
  // trigger sign-out and break the session unnecessarily.
  if (!role) {
    return <SplashScreen />;
  }

  const permittedRoles = allowedRoles ?? (ownerOnly ? ["owner"] : STAFF_ROLES);

  if (!permittedRoles.includes(role)) {
    toast.error(t("auth.noAccess"));
    return <Navigate to={unauthorizedRedirect ?? getSafeRedirect(role)} replace />;
  }

  return <>{children}</>;
}
