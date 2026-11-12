import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { readAllRowsBounded } from "@/lib/retentionPagination";
import { hasRetentionPhone } from "@/lib/retentionContacts";
import {
  buildClientHistory,
  type ClientHistory,
  type RawApptForRetention,
} from "@/lib/retention";

export interface RetentionBarber {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

export interface RetentionData {
  loading: boolean;
  error: boolean;
  histories: ClientHistory[];              // one per client, all-time
  barbers: RetentionBarber[];
  apptsAll: RawApptForRetention[];         // raw completed appointments (for trends)
  now: Date;
}

// Keep query strings out of the type system for tsgo performance.
const sel = (s: string): string => s;

interface Loaded { appts: RawApptForRetention[]; barbers: RetentionBarber[]; names: [string, string][]; at: number }

async function load(): Promise<Loaded> {
  const nowIso = new Date().toISOString();
  // Any past appointment that wasn't cancelled counts as a completed visit.
  // (Acuity-synced rows stay "scheduled" even after the date passes.)
  const [apRes, bRes, cRes] = await Promise.all([
    readAllRowsBounded<RawApptForRetention>(
      () => supabase.from("appointments").select("id", { count: "exact", head: true }).neq("status", "cancelled").lt("starts_at", nowIso),
      (from, to) => supabase.from("appointments")
        .select(sel("id,client_id,client_name,barber_id,starts_at,status,price_cents,amount_paid_cents"))
        .neq("status", "cancelled").lt("starts_at", nowIso)
        .order("starts_at", { ascending: true }).order("id", { ascending: true })
        .range(from, to).returns<RawApptForRetention[]>(),
    ),
    supabase.from("barbers_public").select(sel("id,name,color,is_active")).returns<RetentionBarber[]>(),
    readAllRowsBounded<{ id: string; first_name: string | null; last_name: string | null; phone: string | null }>(
      () => supabase.from("clients").select("id", { count: "exact", head: true }),
      (from, to) => supabase.from("clients").select(sel("id,first_name,last_name,phone")).order("id").range(from, to)
        .returns<{ id: string; first_name: string | null; last_name: string | null; phone: string | null }[]>(),
    ),
  ]);
  // Fail closed: never present a truncated history as real retention.
  if (apRes.error || cRes.error) throw new Error("retention_unavailable");
  const contactable = new Set(cRes.data.filter((c) => hasRetentionPhone(c.phone)).map((c) => c.id));
  return {
    appts: apRes.data.filter((a) => a.client_id && contactable.has(a.client_id)),
    barbers: (bRes.data || []) as RetentionBarber[],
    names: (cRes.data || []).filter((c) => c.id).map((c) => [c.id, [c.first_name || "", c.last_name || ""].join(" ").trim() || "-"]),
    at: Date.now(),
  };
}

/** All past non-cancelled appointments + minimal client/barber tables, one
 *  ClientHistory per client. History is all-time because cadence calculations
 *  need the full record; the UI applies its own window. Cached per account. */
export function useRetentionData(): RetentionData {
  const { user, role } = useAuth();
  const q = useQuery({
    queryKey: ["retention", "base", "profile-phones", user?.id ?? "anon", role ?? "none"],
    queryFn: load,
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
  const apptsAll = useMemo(() => q.data?.appts ?? [], [q.data]);
  const now = useMemo(() => new Date(q.data?.at ?? Date.now()), [q.data?.at]);

  const histories: ClientHistory[] = useMemo(() => {
    const clientNames = new Map(q.data?.names ?? []);
    // Group by client_id (fallback to client_name for legacy orphan rows)
    const byClient = new Map<string, RawApptForRetention[]>();
    for (const a of apptsAll) {
      const key = a.client_id || `name:${a.client_name || "unknown"}`;
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)?.push(a);
    }
    const out: ClientHistory[] = [];
    byClient.forEach((rows, key) => {
      const isReal = !key.startsWith("name:");
      const name = isReal ? clientNames.get(key) || rows[0]?.client_name || "-"
                          : (rows[0]?.client_name || "-");
      out.push(buildClientHistory(key, name, rows, now));
    });
    return out;
  }, [apptsAll, q.data?.names, now]);

  return { loading: q.isPending, error: q.isError, histories, barbers: q.data?.barbers ?? [], apptsAll, now };
}
