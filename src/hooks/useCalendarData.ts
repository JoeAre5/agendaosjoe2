import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, endOfWeek, addWeeks, addDays, format, parse, isValid } from "date-fns";
import { writePersistent, readPersistent } from "@/lib/persistentState";
import { getShopProvider } from "@/lib/scheduling";

// Sync horizon: pull a wide window so reschedules outside the visible week
// (e.g. moved months ahead in Acuity) still propagate to the local DB.
const SYNC_PAST_DAYS = 60;
const SYNC_FUTURE_DAYS = 60;

const DATE_PARAM = "date";
const STORAGE_KEY = "calendar.lastDate"; // YYYY-MM-DD string

/** Parse YYYY-MM-DD safely; returns null when invalid. */
function parseDateParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = parse(raw, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
}

/** Initial date: URL → localStorage backup → today. */
function initialDate(urlValue: string | null): Date {
  const fromUrl = parseDateParam(urlValue);
  if (fromUrl) return fromUrl;
  const fromStorage = parseDateParam(readPersistent<string | null>(STORAGE_KEY, null));
  if (fromStorage) return fromStorage;
  return new Date();
}

export interface Appointment {
  id: string;
  barber_id: string;
  client_name: string;
  client_id?: string | null;
  date_of_birth?: string | null;
  service_name: string;
  addons: string[] | null;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  price_cents: number;
  amount_paid_cents: number;
  paid: boolean;
  payment_confirmed: boolean;
  payment_method: string | null;
  status: string;
  notes: string | null;
  label: string | null;
}

export interface BlockTime {
  id: string;
  barber_id: string;
  starts_at: string;
  ends_at: string;
  is_all_day: boolean;
  notes: string | null;
}

export interface Barber {
  id: string;
  name: string;
  color: string | null;
  is_active: boolean;
}

export function useCalendarData() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from URL → localStorage → today (single read on mount)
  const [selectedDate, setSelectedDateState] = useState<Date>(() =>
    initialDate(searchParams.get(DATE_PARAM))
  );
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(initialDate(searchParams.get(DATE_PARAM)), { weekStartsOn: 0 })
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockTimes, setBlockTimes] = useState<BlockTime[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const hasSynced = useRef(false);
  const [birthdays, setBirthdays] = useState<Record<string, string | null>>({});
  const clientIdsKey = [...new Set(appointments.map(a => a.client_id).filter((id): id is string => !!id))].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    setBirthdays({});
    const ids = clientIdsKey ? clientIdsKey.split(",") : [];
    if (!ids.length) return;
    const load = async () => {
      const result: Record<string, string | null> = {};
      for (let offset = 0; offset < ids.length; offset += 100) {
        const { data, error } = await supabase.from("clients").select("id,date_of_birth").in("id", ids.slice(offset, offset + 100));
        if (error) return;
        for (const client of data ?? []) result[client.id] = client.date_of_birth;
      }
      if (!cancelled) setBirthdays(result);
    };
    void load();
    return () => { cancelled = true; };
  }, [clientIdsKey]);

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 0 });

  const isCurrentWeek =
    startOfWeek(new Date(), { weekStartsOn: 0 }).getTime() === weekStart.getTime();

  // Sync URL ← state whenever selectedDate changes. replace:true keeps the
  // back button intuitive (history isn't polluted with each day-tap).
  const writeUrl = useCallback(
    (d: Date) => {
      const next = new URLSearchParams(searchParams);
      next.set(DATE_PARAM, format(d, "yyyy-MM-dd"));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Public setter — updates state, URL, and localStorage backup
  const setSelectedDate = useCallback(
    (d: Date) => {
      setSelectedDateState(d);
      // If the new date isn't in the visible week, jump the week too
      const newWeekStart = startOfWeek(d, { weekStartsOn: 0 });
      if (newWeekStart.getTime() !== weekStart.getTime()) {
        setWeekStart(newWeekStart);
      }
      writeUrl(d);
      writePersistent(STORAGE_KEY, format(d, "yyyy-MM-dd"));
    },
    [writeUrl, weekStart]
  );

  const goToWeek = useCallback((offset: number) => {
    setWeekStart((prev) => addWeeks(prev, offset));
  }, []);

  const goToDate = useCallback(
    (date: Date) => {
      setSelectedDateState(date);
      setWeekStart(startOfWeek(date, { weekStartsOn: 0 }));
      writeUrl(date);
      writePersistent(STORAGE_KEY, format(date, "yyyy-MM-dd"));
    },
    [writeUrl]
  );

  // Sync URL → state when it changes externally (e.g. back button, deep link).
  // Compares formatted strings to avoid React loops from new Date instances.
  useEffect(() => {
    const urlValue = searchParams.get(DATE_PARAM);
    if (!urlValue) return;
    const fromUrl = parseDateParam(urlValue);
    if (!fromUrl) return;
    if (format(fromUrl, "yyyy-MM-dd") !== format(selectedDate, "yyyy-MM-dd")) {
      setSelectedDateState(fromUrl);
      setWeekStart(startOfWeek(fromUrl, { weekStartsOn: 0 }));
    }
  }, [searchParams, selectedDate]);

  // Manual sync trigger — pulls a wide ±60d window so reschedules outside
  // the visible week are still picked up.
  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const today = new Date();
      const wideStart = format(addDays(today, -SYNC_PAST_DAYS), "yyyy-MM-dd");
      const wideEnd = format(addDays(today, SYNC_FUTURE_DAYS), "yyyy-MM-dd");
      if ((await getShopProvider()).kind !== "native") await supabase.functions.invoke("acuity-sync", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { minDate: wideStart, maxDate: wideEnd },
      });
      // Re-fetch only the visible week for display
      const wStartFull = format(weekStart, "yyyy-MM-dd'T'00:00:00");
      const wEndFull = format(endOfWeek(weekStart, { weekStartsOn: 0 }), "yyyy-MM-dd'T'23:59:59");
      const [apptRes, blockRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, barber_id, client_id, client_name, service_name, addons, starts_at, ends_at, duration_minutes, price_cents, amount_paid_cents, paid, payment_method, payment_confirmed, status, notes, label")
          .gte("starts_at", wStartFull)
          .lte("starts_at", wEndFull)
          .neq("status", "cancelled"),
        supabase
          .from("block_times")
          .select("id, barber_id, starts_at, ends_at, is_all_day, notes")
          .gte("starts_at", wStartFull)
          .lte("starts_at", wEndFull),
      ]);
      if (apptRes.data) setAppointments(apptRes.data);
      if (blockRes.data) setBlockTimes(blockRes.data);
    } catch {
      // non-blocking
    } finally {
      setSyncing(false);
    }
  }, [weekStart]);

  // Sync Acuity on first mount with a wide window so reschedules into the
  // future (or past) propagate even when the user lands on the current week.
  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;

    const syncAcuity = async () => {
      // Native shops have nothing to pull from Acuity.
      if ((await getShopProvider()).kind === "native") return;
      setSyncing(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const today = new Date();
        const wideStart = format(addDays(today, -SYNC_PAST_DAYS), "yyyy-MM-dd");
        const wideEnd = format(addDays(today, SYNC_FUTURE_DAYS), "yyyy-MM-dd");
        await supabase.functions.invoke("acuity-sync", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { minDate: wideStart, maxDate: wideEnd },
        });
      } catch {
        // Sync failure is non-blocking
      } finally {
        setSyncing(false);
      }
    };
    syncAcuity();
  }, []);

  // Fetch barbers
  useEffect(() => {
    const fetchBarbers = async () => {
      const { data } = await supabase
        .from("barbers_public")
        .select("id, name, color, is_active")
        .eq("is_active", true)
        .eq("is_bookable", true)
        .order("name");
      if (data) setBarbers(data);
    };
    fetchBarbers();
  }, []);

  // Fetch appointments + block times for current week
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const wStart = format(weekStart, "yyyy-MM-dd'T'00:00:00");
      const wEnd = format(weekEnd, "yyyy-MM-dd'T'23:59:59");

      const [apptRes, blockRes] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, barber_id, client_id, client_name, service_name, addons, starts_at, ends_at, duration_minutes, price_cents, amount_paid_cents, paid, payment_method, payment_confirmed, status, notes, label")
          .gte("starts_at", wStart)
          .lte("starts_at", wEnd)
          .neq("status", "cancelled"),
        supabase
          .from("block_times")
          .select("id, barber_id, starts_at, ends_at, is_all_day, notes")
          .gte("starts_at", wStart)
          .lte("starts_at", wEnd),
      ]);

      if (apptRes.data) setAppointments(apptRes.data);
      if (blockRes.data) setBlockTimes(blockRes.data);
      setLoading(false);
    };
    fetchData();
  }, [weekStart]);

  // Realtime subscription for appointments
  useEffect(() => {
    const channel = supabase
      .channel("calendar-appointments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setAppointments((prev) =>
              prev.filter((a) => a.id !== (payload.old as any).id)
            );
          } else {
            const row = payload.new as Appointment;
            // Remove cancelled appointments from view
            if (row.status === "cancelled") {
              setAppointments((prev) => prev.filter((a) => a.id !== row.id));
              return;
            }
            setAppointments((prev) => {
              const idx = prev.findIndex((a) => a.id === row.id);
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = row;
                return copy;
              }
              return [...prev, row];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Realtime subscription for block_times — mirrors appointments behavior so
  // blocks created either in-app or via Acuity sync appear instantly.
  useEffect(() => {
    const channel = supabase
      .channel("calendar-blocks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "block_times" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setBlockTimes((prev) =>
              prev.filter((b) => b.id !== (payload.old as any).id)
            );
          } else {
            const row = payload.new as BlockTime;
            setBlockTimes((prev) => {
              const idx = prev.findIndex((b) => b.id === row.id);
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = row;
                return copy;
              }
              return [...prev, row];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Re-sync from Acuity when the tab regains focus so blocks created
  // directly in Acuity appear without a hard reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        syncNow();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncNow]);

  return {
    weekStart,
    weekEnd,
    selectedDate,
    setSelectedDate,
    appointments: appointments.map(a => ({ ...a, date_of_birth: a.client_id ? birthdays[a.client_id] ?? null : null })),
    blockTimes,
    barbers,
    loading,
    syncing,
    isCurrentWeek,
    goToWeek,
    goToDate,
    syncNow,
  };
}
