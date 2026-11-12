import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { readAllRowsBounded } from "@/lib/retentionPagination";
import { prRangeTimestamps } from "@/lib/homePeriods";
import {
  earliestRecord, pendingClientsAsOf,
  type CopyEvent, type CreditRow, type OutreachAppt, type PendingClient,
} from "@/lib/outreach";

const sel = (s: string): string => s;
const POLL_MS = 20_000;
/** Shared cache root; every key also carries the signed-in user and role so sessions never share data. */
export const OUTREACH_QUERY_ROOT = "outreach";

export interface OutreachRange { start: Date; end: Date; comparisonStart: Date; comparisonEnd: Date }

export interface OutreachData {
  loading: boolean;
  error: boolean;
  /** clientId -> clear barber id, or null when ambiguous. Scoped by the backend. */
  affinity: Map<string, string | null>;
  pending: PendingClient[];
  pendingComparison: number | null;
  copies: CopyEvent[];
  credits: CreditRow[];
  creditsComparison: number | null;
  barbers: { id: string; name: string; color: string | null }[];
  clientNames: Map<string, string>;
  now: Date;
  refresh: () => void;
}

interface BaseData {
  appts: OutreachAppt[];
  contacts: { id: string; phone: string | null }[];
  affinityRows: { client_id: string; barber_id: string | null }[];
  barbers: OutreachData["barbers"];
}

interface ActivityData { copies: CopyEvent[]; credits: CreditRow[]; creditsComparison: number | null; at: number }

/** As-of instant for a period: its end, or now while the period is still running. */
function asOfFor(endIso: string, now: Date): Date {
  const end = new Date(endIso);
  return end.getTime() > now.getTime() ? now : end;
}

async function loadBase(): Promise<BaseData> {
  const [apRes, affRes, bRes, contactsRes] = await Promise.all([
    readAllRowsBounded<OutreachAppt>(
      () => supabase.from("appointments").select("id", { count: "exact", head: true })
        .neq("status", "cancelled").not("client_id", "is", null),
      (from, to) => supabase.from("appointments")
        .select(sel("id,client_id,client_name,client_phone,barber_id,starts_at,status,price_cents,amount_paid_cents,created_at"))
        .neq("status", "cancelled").not("client_id", "is", null)
        .order("starts_at", { ascending: true }).order("id", { ascending: true })
        .range(from, to).returns<OutreachAppt[]>(),
    ),
    supabase.rpc("outreach_affinities"),
    supabase.from("barbers_public").select(sel("id,name,color")).returns<OutreachData["barbers"]>(),
    readAllRowsBounded<{ id: string; phone: string | null }>(
      () => supabase.from("clients").select("id", { count: "exact", head: true }),
      (from, to) => supabase.from("clients").select(sel("id,phone")).order("id").range(from, to)
        .returns<{ id: string; phone: string | null }[]>(),
    ),
  ]);
  // Fail closed: a partial history must never be shown as fewer pending clients.
  if (apRes.error || affRes.error || contactsRes.error) throw new Error("outreach_base_unavailable");
  return {
    appts: apRes.data,
    contacts: contactsRes.data,
    affinityRows: (affRes.data ?? []) as BaseData["affinityRows"],
    barbers: bRes.data ?? [],
  };
}

export function useOutreachData(range: OutreachRange): OutreachData {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const scope = [user?.id ?? "anon", role ?? "none"] as const;
  const cur = prRangeTimestamps(range.start, range.end);
  const cmp = prRangeTimestamps(range.comparisonStart, range.comparisonEnd);

  // Appointments and affinity change slowly: cached and shared by the Home card and Outreach page.
  const base = useQuery({
    queryKey: [OUTREACH_QUERY_ROOT, "base", "profile-phones", ...scope],
    queryFn: loadBase,
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  // Activity is shared between team members: polled and refreshed on focus.
  const activity = useQuery({
    queryKey: [OUTREACH_QUERY_ROOT, "activity", ...scope, cur.start, cur.end, cmp.start, cmp.end],
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ActivityData> => {
      const since = new Date(Math.min(new Date(cur.start).getTime(), Date.now()) - 4 * 86_400_000).toISOString();
      const [hRes, cRes, ccRes, firstRes] = await Promise.all([
        supabase.rpc("outreach_copy_history", { p_since: since }),
        supabase.rpc("outreach_credits", { p_start: cur.start, p_end: cur.end }),
        supabase.rpc("outreach_credits", { p_start: cmp.start, p_end: cmp.end }),
        supabase.from("outreach_activity_logs").select("copied_at").order("copied_at", { ascending: true }).limit(1),
      ]);
      if (hRes.error || cRes.error) throw new Error("outreach_activity_unavailable");
      // Before outreach existed there is no comparable activity: report unavailable, not zero.
      const first = (firstRes.data?.[0] as { copied_at: string } | undefined)?.copied_at;
      return {
        copies: (hRes.data ?? []) as CopyEvent[],
        credits: (cRes.data ?? []) as CreditRow[],
        creditsComparison: !ccRes.error && first && new Date(first) <= new Date(cmp.end) ? (ccRes.data ?? []).length : null,
        at: Date.now(),
      };
    },
  });

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: [OUTREACH_QUERY_ROOT, "activity"] });
  }, [qc]);

  const appts = base.data?.appts;
  const affinityRows = base.data?.affinityRows;
  const profilePhones = useMemo(() => new Map((base.data?.contacts ?? []).map((c) => [c.id, c.phone])), [base.data?.contacts]);
  const now = useMemo(() => new Date(activity.data?.at ?? Date.now()), [activity.data?.at]);

  const clientNames = useMemo(() => new Map((appts ?? []).filter((a) => a.client_id).map((a) => [a.client_id as string, a.client_name || "-"])), [appts]);
  const affinity = useMemo(() => new Map((affinityRows ?? []).map((r) => [r.client_id, r.barber_id])), [affinityRows]);

  const { pending, pendingComparison } = useMemo(() => {
    if (!appts?.length) return { pending: [] as PendingClient[], pendingComparison: null };
    const visible = (p: PendingClient) => affinity.has(p.history.clientId);
    const pendingNow = pendingClientsAsOf(appts, asOfFor(cur.end, now), profilePhones).filter(visible);
    const cmpAsOf = asOfFor(cmp.end, now);
    const first = earliestRecord(appts);
    const comparable = first !== null && first.getTime() < cmpAsOf.getTime() - 90 * 86_400_000;
    return {
      pending: pendingNow,
      pendingComparison: comparable ? pendingClientsAsOf(appts, cmpAsOf, profilePhones).filter(visible).length : null,
    };
  }, [appts, affinity, profilePhones, cur.end, cmp.end, now]);

  return {
    loading: base.isPending || activity.isPending,
    error: base.isError || (activity.isError && !activity.data),
    affinity, pending, pendingComparison,
    copies: activity.data?.copies ?? [],
    credits: activity.data?.credits ?? [],
    creditsComparison: activity.data?.creditsComparison ?? null,
    barbers: base.data?.barbers ?? [],
    clientNames, now, refresh,
  };
}
