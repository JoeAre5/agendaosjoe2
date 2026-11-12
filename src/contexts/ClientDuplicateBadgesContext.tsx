import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { canReadClientDuplicateBadges, countClientDuplicateGroups, CLIENT_DUPLICATE_QUERY_ROOT, CLIENT_DUPLICATE_REFRESH_MS, CLIENT_DUPLICATE_DEBOUNCE_MS } from "@/lib/clientDuplicateBadges";

interface BadgeState {
  count: number | null;
  refresh: () => Promise<void>;
}

const ClientDuplicateBadgesContext = createContext<BadgeState>({ count: null, refresh: async () => {} });

export function ClientDuplicateBadgesProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const enabled = canReadClientDuplicateBadges(user?.id, role);
  const queryKey = [CLIENT_DUPLICATE_QUERY_ROOT, user?.id ?? "anon", role ?? "none"];
  const query = useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      // Use the existing authorized matching function, not a second matching engine.
      // Cache only the count, never identity/contact details in navigation.
      const { data, error } = await supabase.rpc("find_duplicate_client_groups");
      if (error) throw error;
      return countClientDuplicateGroups(data);
    },
    staleTime: 15_000,
    gcTime: 60_000,
    retry: 1,
    // clients is not published for live events in the current backend.
    // This fallback also covers a missed event after a network interruption.
    refetchInterval: enabled ? CLIENT_DUPLICATE_REFRESH_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    await qc.invalidateQueries({ queryKey: [CLIENT_DUPLICATE_QUERY_ROOT, user?.id ?? "anon", role ?? "none"], exact: true });
  }, [qc, enabled, user?.id, role]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void refresh(); }, CLIENT_DUPLICATE_DEBOUNCE_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const channel = supabase.channel(`client-duplicate-badges-${user?.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, scheduleRefresh)
      .subscribe();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh, user?.id]);

  return (
    <ClientDuplicateBadgesContext.Provider value={{ count: enabled ? query.data ?? null : null, refresh }}>
      {children}
    </ClientDuplicateBadgesContext.Provider>
  );
}

export function useClientDuplicateBadges() {
  return useContext(ClientDuplicateBadgesContext);
}