import { createContext, useCallback, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  isOwner: boolean;
  isBarber: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  role: null,
  isOwner: false,
  isBarber: false,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

async function fetchRole(userId: string): Promise<AppRole | null> {
  // Use .select() (not maybeSingle) because a user may legitimately have
  // multiple rows (e.g. owner + client). maybeSingle() returns null in that
  // case and strands the user on /login. Pick the highest-privilege role.
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data || data.length === 0) return null;
  const roles = data.map((r) => r.role as AppRole);
  const priority: AppRole[] = ["owner", "barber", "client"];
  for (const p of priority) {
    if (roles.includes(p)) return p;
  }
  return roles[0] ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const roleRequestRef = useRef(0);

  const syncSessionRole = useCallback(async (nextSession: Session | null) => {
    const requestId = ++roleRequestRef.current;

    setSession(nextSession);

    if (!nextSession?.user) {
      setRole(null);
      setLoading(false);
      return;
    }

    setRole(null);
    setLoading(true);

    let nextRole = await fetchRole(nextSession.user.id);

    // Auto-provision/repair client role + profile if user has no role yet.
    // If the user already has role=client, still call it once so orphaned
    // auth users get a clients row before /app/cliente loads.
    if ((!nextRole || nextRole === "client") && roleRequestRef.current === requestId) {
      try {
        const { data } = await supabase.functions.invoke("provision-oauth-client", {
          body: { booking_source: "self-signup" },
        });
        if (data?.role) {
          nextRole = data.role;
        }
      } catch (e) {
        console.error("Auto-provision failed:", e);
      }
    }

    if (roleRequestRef.current !== requestId) {
      return;
    }

    setRole(nextRole);
    setLoading(false);
  }, []);

  useEffect(() => {
    let initialResolved = false;
    const pendingEvents: Array<{ event: string; session: Session | null }> = [];

    // Set up listener BEFORE getSession per Supabase best practice.
    // Buffer events until the initial getSession() resolves so we don't
    // flash the login screen on PWA resume (where INITIAL_SESSION can fire
    // with a null session before storage rehydration completes).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!initialResolved) {
          pendingEvents.push({ event, session: newSession });
          return;
        }
        setTimeout(() => {
          void syncSessionRole(newSession);
        }, 0);
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      // Prefer any buffered event that actually carries a session — protects
      // against races where the listener fired with null before storage was
      // ready, then getSession resolved with the real session (or vice versa).
      const buffered = pendingEvents.find((e) => e.session) ?? pendingEvents[pendingEvents.length - 1];
      const resolvedSession = initialSession ?? buffered?.session ?? null;
      initialResolved = true;
      pendingEvents.length = 0;
      void syncSessionRole(resolvedSession);
    });

    return () => {
      roleRequestRef.current += 1;
      subscription.unsubscribe();
    };
  }, [syncSessionRole]);


  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
    try { sessionStorage.removeItem("agendaos.client.portal.cache"); } catch { /* noop */ }
    try { sessionStorage.removeItem("agendaos.force_onboarding"); } catch { /* noop */ }
    try { localStorage.removeItem("agendaos.force_onboarding"); } catch { /* noop */ }
  };

  const user = session?.user ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        isOwner: role === "owner",
        isBarber: role === "barber",
        loading,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
