import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import { AdminHeader } from "@/components/AdminHeader";
import { Button } from "@/components/ui/button";
import { calendarOverlapGroups } from "@/lib/calendarOverlapGroups";
import { BirthdayIcon } from "@/components/BirthdayIcon";
import { isBirthdayOn } from "@/lib/birthdays";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useCalendarData, Appointment, BlockTime, Barber } from "@/hooks/useCalendarData";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/hooks/usePreferences";
import { supabase } from "@/integrations/supabase/client";
import {
  format,
  isSameDay,
  isToday,
  isBefore,
  startOfDay,
  addDays,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  getDay,
  isSameMonth,
} from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Scissors,
  BellOff,
  Receipt,
  Ban,
  RotateCw,
  CalendarCheck,
  MoreHorizontal,
  Search,
  X,
  Loader2,
  Eye,
  EyeOff,
  DollarSign,
  Footprints,
  Clock,
  Hourglass,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { usePersistentState } from "@/lib/persistentState";

const HOUR_HEIGHT = 80;
const START_HOUR = 0;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const WORK_START = 9;
const WORK_END = 17;
const LUNCH_START = 12;
const LUNCH_END = 13;

interface CalendarTabProps {
  onOpenCheckout?: (intent: import("@/components/tabs/CheckoutTab").CheckoutIntent) => void;
}

export function CalendarTab({ onOpenCheckout }: CalendarTabProps = {}) {
  const { t } = useTranslation();
  const { language } = usePreferences();
  const { isOwner, user } = useAuth();
  const navigate = useNavigate();

  // Fetch shop name + user first name for personalized header
  const [shopName, setShopName] = useState<string>("");
  const [userFirstName, setUserFirstName] = useState<string>("");

  useEffect(() => {
    supabase.from("shop_settings").select("shop_name").limit(1).single()
      .then(({ data }) => { if (data?.shop_name) setShopName(data.shop_name); });
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) {
          setUserFirstName(data.full_name.split(" ")[0]);
        }
      });
  }, [user?.id]);
  const {
    weekStart,
    selectedDate,
    setSelectedDate,
    appointments,
    blockTimes,
    barbers,
    loading,
    syncing,
    isCurrentWeek,
    goToWeek,
    goToDate,
    syncNow,
  } = useCalendarData();

  const gridRef = useRef<HTMLDivElement>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [waitlistCount, setWaitlistCount] = useState(0);

  // Realtime waitlist count
  useEffect(() => {
    const fetchCount = async () => {
      const { count } = await supabase
        .from("waitlist")
        .select("*", { count: "exact", head: true })
        .eq("status", "waiting");
      setWaitlistCount(count || 0);
    };
    fetchCount();
    const channel = supabase
      .channel("waitlist-fab-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist" }, () => fetchCount())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  const [monthViewOpen, setMonthViewOpen] = useState(false);
  const [monthViewDate, setMonthViewDate] = useState(new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  // Persist hidden barbers across sessions (Phase 1B.UX, decision #5)
  const [hiddenBarberIds, setHiddenBarberIds] = usePersistentState<string[]>("calendar.hiddenBarbers", []);
  const hiddenBarbers = useMemo(() => new Set(hiddenBarberIds), [hiddenBarberIds]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1);

  const dateFnsLocale = language === "es" ? esLocale : enUS;

  // Generate 7 days of the week
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Visible barbers (filtered by toggle)
  const visibleBarbers = useMemo(
    () => barbers.filter((b) => !hiddenBarbers.has(b.id)),
    [barbers, hiddenBarbers]
  );

  // Filter appointments for selected date
  const dayAppointments = useMemo(
    () => appointments.filter((a) => isSameDay(new Date(a.starts_at), selectedDate)),
    [appointments, selectedDate]
  );

  const dayBlocks = useMemo(
    () => blockTimes.filter((b) => isSameDay(new Date(b.starts_at), selectedDate)),
    [blockTimes, selectedDate]
  );

  // Count appointments per barber for selected day
  const barberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    dayAppointments.forEach((a) => {
      counts[a.barber_id] = (counts[a.barber_id] || 0) + 1;
    });
    return counts;
  }, [dayAppointments]);

  // Current time line position
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(iv);
  }, []);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (gridRef.current && !loading) {
      const h = new Date().getHours() + new Date().getMinutes() / 60;
      const scrollTo = Math.max(0, (h - 1) * HOUR_HEIGHT);
      gridRef.current.scrollTop = scrollTo;
    }
  }, [loading]);

  const currentTimeTop = useMemo(() => {
    const h = now.getHours() + now.getMinutes() / 60;
    if (h < START_HOUR || h > END_HOUR) return null;
    return (h - START_HOUR) * HOUR_HEIGHT;
  }, [now]);

  const dayLabels = language === "es"
    ? ["D", "L", "M", "M", "J", "V", "S"]
    : ["S", "M", "T", "W", "T", "F", "S"];

  // Month title
  const monthTitleRaw = format(selectedDate, "MMMM yyyy", { locale: dateFnsLocale });
  const monthTitle = monthTitleRaw.charAt(0).toUpperCase() + monthTitleRaw.slice(1);

  // Toggle month view
  const handleMonthTitleTap = () => {
    if (!monthViewOpen) {
      setMonthViewDate(selectedDate);
    }
    setMonthViewOpen(!monthViewOpen);
  };

  // Today button
  const handleTodayTap = () => {
    const today = new Date();
    goToDate(today);
    setMonthViewOpen(false);
    // Auto-scroll to current time
    setTimeout(() => {
      if (gridRef.current) {
        const h = today.getHours() + today.getMinutes() / 60;
        gridRef.current.scrollTop = Math.max(0, (h - 1) * HOUR_HEIGHT);
      }
    }, 100);
  };

  // Refresh button
  const handleRefresh = async () => {
    toast.info(language === "es" ? "Sincronizando..." : "Syncing...");
    await syncNow();
    toast.success(language === "es" ? "Sincronizado" : "Synced");
  };

  // Month view: select a date
  const handleMonthDateSelect = (date: Date) => {
    goToDate(date);
    setMonthViewOpen(false);
  };

  // Barber toggle — persists via usePersistentState (decision #5)
  const toggleBarber = (barberId: string) => {
    setHiddenBarberIds((prev) => {
      const set = new Set(prev);
      if (set.has(barberId)) set.delete(barberId);
      else set.add(barberId);
      return Array.from(set);
    });
  };

  // Client search via Acuity
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = useCallback(
    (val: string) => {
      setSearchQuery(val);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (val.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      searchTimeoutRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const q = val.trim();
          const digits = q.replace(/\D/g, "");
          // Search local clients table (single source of truth, includes latest edits)
          let query = supabase
            .from("clients")
            .select("id, first_name, last_name, email, phone")
            .order("first_name", { ascending: true })
            .limit(10);
          if (digits.length >= 3) {
            query = query.ilike("phone", `%${digits}%`);
          } else {
            query = query.or(
              `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`
            );
          }
          const { data } = await query;
          const mapped = (data || []).map((c: any) => ({
            id: c.id,
            firstName: c.first_name,
            lastName: c.last_name || "",
            email: c.email || "",
            phone: c.phone || "",
          }));
          setSearchResults(mapped);
        } catch {
          // ignore
        } finally {
          setSearching(false);
        }
      }, 400);
    },
    []
  );

  // Week swipe handlers
  const weekTouchRef = useRef<{ startX: number; moved: boolean }>({ startX: 0, moved: false });

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg-base)" }}>
      {/* ═══ HEADER ═══ */}
      <AdminHeader
        es={language === "es"}
        title={monthTitle}
        onTitleClick={handleMonthTitleTap}
        titleAdornment={<ChevronDown open={monthViewOpen} />}
        actions={
          <>
            <button
              onClick={handleRefresh}
              disabled={syncing}
              className="p-2 rounded-full transition-opacity"
              style={{ opacity: syncing ? 0.5 : 1 }}
            >
              <RotateCw
                size={16}
                className={syncing ? "animate-spin" : ""}
                style={{ color: "var(--text-secondary)" }}
              />
            </button>
            <button onClick={handleTodayTap} className="p-2 rounded-full">
              <CalendarCheck
                size={16}
                style={{ color: isCurrentWeek && isToday(selectedDate) ? "var(--accent-color)" : "var(--text-secondary)" }}
              />
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded-full">
              <MoreHorizontal size={16} style={{ color: "var(--text-secondary)" }} />
            </button>
          </>
        }
      />

      {/* ═══ CALENDAR SECTION (month view + week row) ═══ */}
      <div
        className="px-4 pb-2 shrink-0"
        style={{
          background: "var(--bg-base)",
          borderBottom: monthViewOpen ? "none" : "1px solid var(--divider)",
        }}
      >

        {/* ═══ MONTH VIEW (expandable) ═══ */}
        <AnimatePresence>
          {monthViewOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              <MonthGrid
                monthDate={monthViewDate}
                selectedDate={selectedDate}
                onSelectDate={handleMonthDateSelect}
                onChangeMonth={setMonthViewDate}
                language={language}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══ WEEK ROW ═══ */}
        {!monthViewOpen && (
          <div className="flex items-center">
            <button onClick={() => { setSwipeDir(-1); goToWeek(-1); }} className="p-1 shrink-0">
              <ChevronLeft size={18} style={{ color: "var(--text-tertiary)" }} />
            </button>

            <div
              className="flex-1 overflow-hidden relative"
              style={{ touchAction: "pan-y" }}
              onTouchStart={(e) => {
                weekTouchRef.current = { startX: e.touches[0].clientX, moved: false };
              }}
              onTouchMove={(e) => {
                const diff = e.touches[0].clientX - weekTouchRef.current.startX;
                if (Math.abs(diff) > 8) weekTouchRef.current.moved = true;
              }}
              onTouchEnd={(e) => {
                const diff = (e.changedTouches[0]?.clientX || 0) - weekTouchRef.current.startX;
                // More sensitive: 25px is enough
                if (Math.abs(diff) > 25) {
                  if (diff > 0) { setSwipeDir(-1); goToWeek(-1); }
                  else { setSwipeDir(1); goToWeek(1); }
                }
              }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={weekStart.toISOString()}
                  initial={{ x: swipeDir * 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: swipeDir * -40, opacity: 0 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="flex items-center justify-around w-full"
                >
                  {weekDays.map((day, i) => {
                    const selected = isSameDay(day, selectedDate);
                    const todayDay = isToday(day);
                    const past = isBefore(day, startOfDay(new Date())) && !todayDay;

                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDate(day)}
                        className="flex flex-col items-center gap-0.5 py-1 px-1.5 rounded-full transition-colors"
                        style={{ opacity: past ? 0.4 : 1 }}
                      >
                        <span
                          className="text-[10px] font-semibold uppercase"
                          style={{ color: selected ? "var(--accent-color)" : "var(--text-tertiary)" }}
                        >
                          {dayLabels[i]}
                        </span>
                        <span
                          className="flex items-center justify-center text-xs font-bold rounded-full"
                          style={{
                            width: 32,
                            height: 32,
                            background: selected ? "var(--accent-color)" : "transparent",
                            color: selected
                              ? "var(--bg-base)"
                              : todayDay
                                ? "var(--accent-color)"
                                : "var(--text-primary)",
                            border: todayDay && !selected
                              ? "2px solid var(--accent-color)"
                              : "2px solid transparent",
                          }}
                        >
                          {format(day, "d")}
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              </AnimatePresence>
            </div>

            <button onClick={() => { setSwipeDir(1); goToWeek(1); }} className="p-1 shrink-0">
              <ChevronRight size={18} style={{ color: "var(--text-tertiary)" }} />
            </button>
          </div>
        )}
      </div>

      {/* SEARCH BAR (owner only) */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-4 pb-2"
            style={{ borderBottom: "1px solid var(--divider)" }}
          >
            <div className="flex items-center gap-2 mt-2">
              <Search size={16} style={{ color: "var(--text-tertiary)" }} />
              <Input
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={language === "es" ? "Buscar cliente..." : "Search client..."}
                className="border-0 bg-transparent p-0 h-8 focus-visible:ring-0"
                autoFocus
              />
              <button onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}>
                <X size={16} style={{ color: "var(--text-tertiary)" }} />
              </button>
            </div>
            {searching && (
              <div className="flex justify-center py-2">
                <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent-color)" }} />
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-1 pb-2">
                {searchResults.map((client: any) => (
                  <button
                    key={client.id}
                    className="w-full flex items-center justify-between py-2 px-2 rounded-lg text-left"
                    style={{ background: "var(--bg-surface)" }}
                    onClick={() => {
                      toast.info(`${client.firstName} ${client.lastName}`);
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {client.firstName} {client.lastName}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {[client.email, client.phone].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* BARBER COLUMN HEADERS */}
      {visibleBarbers.length > 0 && (
        <div
          className="flex"
          style={{
            borderBottom: "1px solid var(--divider)",
            paddingLeft: 44,
          }}
        >
          {visibleBarbers.map((barber) => (
            <div
              key={barber.id}
              className="flex-1 flex items-center justify-center gap-1.5 py-2"
              style={{ borderRight: "1px solid var(--border)" }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: barber.color || "var(--accent-color)" }}
              />
              <span
                className="text-[10px] font-bold uppercase tracking-wide"
                style={{ color: "var(--text-secondary)" }}
              >
                {barber.name.split(" ")[0]}
              </span>
              <span
                className="text-[10px] font-medium"
                style={{ color: "var(--text-tertiary)" }}
              >
                {barberCounts[barber.id] || 0}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* TIME GRID */}
      <div className="flex-1 overflow-auto" ref={gridRef}>
        {loading ? (
          <CalendarSkeleton />
        ) : (
          <div className="relative flex" style={{ minHeight: TOTAL_HOURS * HOUR_HEIGHT }}>
            {/* Hour labels */}
            <div className="flex-shrink-0" style={{ width: 44 }}>
              {Array.from({ length: TOTAL_HOURS }, (_, i) => {
                const hour = START_HOUR + i;
                const label =
                  hour === 0
                    ? "12 AM"
                    : hour === 12
                      ? "12 PM"
                      : hour < 12
                        ? `${hour} AM`
                        : `${hour - 12} PM`;
                return (
                  <div
                    key={hour}
                    className="flex items-start justify-end pr-2 text-[10px]"
                    style={{
                      height: HOUR_HEIGHT,
                      color: "var(--text-tertiary)",
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            {/* Barber columns */}
            <div className="flex flex-1 relative">
              {/* Hour shading + grid lines */}
              {Array.from({ length: TOTAL_HOURS }, (_, i) => {
                const hour = START_HOUR + i;
                const isActive = hour >= WORK_START && hour < WORK_END && !(hour >= LUNCH_START && hour < LUNCH_END);
                return (
                  <div key={`shade-${i}`}>
                    {/* Hour top border */}
                    <div
                      className="absolute left-0 right-0 z-[1]"
                      style={{
                        top: i * HOUR_HEIGHT,
                        height: 0.5,
                        background: "var(--border-strong)",
                      }}
                    />
                    {/* Background shading */}
                    <div
                      className="absolute left-0 right-0"
                      style={{
                        top: i * HOUR_HEIGHT,
                        height: HOUR_HEIGHT,
                        background: isActive ? "var(--bg-surface)" : "var(--inactive-hour)",
                        pointerEvents: "none",
                      }}
                    />
                  </div>
                );
              })}

              {/* Current time line */}
              {isToday(selectedDate) && currentTimeTop !== null && (
                <div
                  className="absolute left-0 right-0 z-20 flex items-center"
                  style={{ top: currentTimeTop }}
                >
                  <div
                    className="w-2 h-2 rounded-full -ml-1"
                    style={{ background: "var(--red)" }}
                  />
                  <div
                    className="flex-1"
                    style={{ height: 1.5, background: "var(--red)" }}
                  />
                </div>
              )}

              {visibleBarbers.map((barber) => (
                <BarberColumn
                  key={barber.id}
                  barber={barber}
                  appointments={dayAppointments.filter(
                    (a) => a.barber_id === barber.id
                  )}
                  blocks={dayBlocks.filter((b) => b.barber_id === barber.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Waitlist badge floating above FAB */}
      <AnimatePresence>
        {waitlistCount > 0 && !fabOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => navigate("/admin/waitlist")}
            className="fixed z-[91] flex items-center gap-1.5 px-3 py-2 rounded-full shadow-lg"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 196px)", right: 20, background: "var(--accent-color)" }}
          >
            <Hourglass size={14} color="#fff" />
            <span className="text-xs font-bold text-white">{waitlistCount}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* FAB */}
      <div className="fixed z-[90]" style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 128px)", right: 20 }}>
        <AnimatePresence>
          {fabOpen && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="absolute bottom-16 right-0 flex flex-col gap-2 items-end"
            >
              <FabOption icon={Scissors} label={language === "es" ? "Cita" : "Appointment"} onClick={() => { setFabOpen(false); navigate(`/admin/appointment/new?ndate=${format(selectedDate, "yyyy-MM-dd")}`); }} />
              <FabOption icon={BellOff} label={language === "es" ? "Bloquear" : "Block Time"} onClick={() => { setFabOpen(false); navigate("/admin/block/new"); }} />
              <FabOption icon={Receipt} label={language === "es" ? "Producto" : "Product"} onClick={() => { setFabOpen(false); onOpenCheckout?.({ type: "focusSearch" }); }} />
              <FabOption icon={Footprints} label="Walk-In" onClick={() => { setFabOpen(false); navigate("/admin/walk-in"); }} />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setFabOpen(!fabOpen)}
          className="flex items-center justify-center rounded-full shadow-lg transition-transform"
          style={{
            width: 52,
            height: 52,
            background: "var(--text-primary)",
            transform: fabOpen ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          <Plus size={24} style={{ color: "var(--bg-base)" }} />
        </button>
      </div>

      {/* Overlay to close FAB */}
      {fabOpen && (
        <div
          className="fixed inset-0 z-[89]"
          onClick={() => setFabOpen(false)}
        />
      )}

      {/* ═══ THREE DOTS FLOATING CARD ═══ */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[95]"
              style={{ background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", damping: 28, stiffness: 340 }}
              className="fixed inset-0 z-[96] flex items-center justify-center pointer-events-none px-6"
            >
              <div
                className="w-full max-w-[320px] pointer-events-auto"
                style={{
                  background: "#ffffff",
                  borderRadius: 28,
                  boxShadow: "0 25px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)",
                  padding: "28px 24px 24px",
                }}
              >
              <div className="flex justify-center mb-4">
                <span className="text-[11px] font-semibold tracking-wide px-3.5 py-1" style={{ borderRadius: 10, background: "rgba(201,168,130,0.15)", color: "rgba(160,128,96,1)" }}>
                  {language === "es" ? "Opciones" : "Options"}
                </span>
              </div>
              <h2
                className="text-center uppercase mb-1"
                style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-1px", lineHeight: 1.2, color: "#111111" }}
              >
                {language === "es" ? "CALENDARIO" : "CALENDAR"}
              </h2>
              <p className="text-[13px] text-center mb-5" style={{ color: "rgba(0,0,0,0.45)" }}>
                {language === "es" ? "Filtra y personaliza tu vista" : "Filter and customize your view"}
              </p>
              <div className="space-y-3">
                <div>
                  <p
                    className="text-xs font-semibold uppercase tracking-wider mb-2 px-1"
                    style={{ color: "rgba(0,0,0,0.4)" }}
                  >
                    {language === "es" ? "Calendarios" : "Calendars"}
                  </p>
                  <div className="space-y-1">
                    {barbers.map((barber) => {
                      const isVisible = !hiddenBarbers.has(barber.id);
                      return (
                        <button
                          key={barber.id}
                          onClick={() => toggleBarber(barber.id)}
                          className="w-full flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all"
                          style={{
                            background: isVisible ? "rgba(0,0,0,0.05)" : "transparent",
                          }}
                        >
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{
                              background: barber.color || "#ceb79e",
                              opacity: isVisible ? 1 : 0.3,
                            }}
                          />
                          <span
                            className="flex-1 text-sm font-medium text-left"
                            style={{ color: "#111111", opacity: isVisible ? 1 : 0.4 }}
                          >
                            {barber.name}
                          </span>
                          {isVisible ? (
                            <Eye size={14} style={{ color: "#111111" }} />
                          ) : (
                            <EyeOff size={14} style={{ color: "rgba(0,0,0,0.3)" }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {isOwner && (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setSearchOpen(true);
                    }}
                    className="w-full text-center font-semibold transition-all active:scale-[0.97]"
                    style={{
                      background: "#111111",
                      color: "#ffffff",
                      fontSize: 13,
                      padding: "10px 0",
                      borderRadius: "var(--radius-control)",
                      border: "none",
                    }}
                  >
                    {language === "es" ? "Buscar Cliente" : "Search Client"}
                  </button>
                )}
              </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}

/* ─── Chevron Down animated ─── */
function ChevronDown({ open }: { open: boolean }) {
  return (
    <motion.span
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: 0.2 }}
      className="inline-flex"
    >
      <ChevronRight
        size={16}
        style={{ color: "var(--text-tertiary)", transform: "rotate(90deg)" }}
      />
    </motion.span>
  );
}

/* ─── Month Grid ─── */
function MonthGrid({
  monthDate,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  language,
}: {
  monthDate: Date;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onChangeMonth: (d: Date) => void;
  language: string;
}) {
  const dateFnsLocale = language === "es" ? esLocale : enUS;
  const dayLabels = language === "es"
    ? ["D", "L", "M", "M", "J", "V", "S"]
    : ["S", "M", "T", "W", "T", "F", "S"];

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const startDay = getDay(monthStart); // 0=Sun

  const daysInMonth: (Date | null)[] = [];
  // Leading blanks
  for (let i = 0; i < startDay; i++) daysInMonth.push(null);
  // Actual days
  let d = monthStart;
  while (d <= monthEnd) {
    daysInMonth.push(d);
    d = addDays(d, 1);
  }

  // Touch swipe for month nav
  const touchRef = useRef<number>(0);

  return (
    <div
      className="pb-3"
      onTouchStart={(e) => { touchRef.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const diff = (e.changedTouches[0]?.clientX || 0) - touchRef.current;
        if (Math.abs(diff) > 60) {
          if (diff > 0) onChangeMonth(subMonths(monthDate, 1));
          else onChangeMonth(addMonths(monthDate, 1));
        }
      }}
    >
      {/* Month nav header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => onChangeMonth(subMonths(monthDate, 1))} className="p-1">
          <ChevronLeft size={18} style={{ color: "var(--text-secondary)" }} />
        </button>
        <span
          className="text-sm font-semibold capitalize"
          style={{ color: "var(--text-primary)" }}
        >
          {format(monthDate, "MMMM yyyy", { locale: dateFnsLocale })}
        </span>
        <button onClick={() => onChangeMonth(addMonths(monthDate, 1))} className="p-1">
          <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map((label, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-semibold uppercase"
            style={{ color: "var(--text-tertiary)" }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-y-1">
        {daysInMonth.map((day, i) => {
          if (!day) {
            return <div key={`blank-${i}`} />;
          }
          const isSelected = isSameDay(day, selectedDate);
          const todayDay = isToday(day);
          const inMonth = isSameMonth(day, monthDate);

          return (
            <button
              key={i}
              onClick={() => onSelectDate(day)}
              className="flex items-center justify-center mx-auto rounded-full"
              style={{
                width: 32,
                height: 32,
                background: isSelected ? "var(--accent-color)" : "transparent",
                color: isSelected
                  ? "var(--bg-base)"
                  : todayDay
                    ? "var(--accent-color)"
                    : inMonth
                      ? "var(--text-primary)"
                      : "var(--text-tertiary)",
                border: todayDay && !isSelected
                  ? "2px solid var(--accent-color)"
                  : "2px solid transparent",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function FabOption({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full card-elevated"
    >
      <Icon size={16} style={{ color: "var(--accent-color)" }} />
      <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
    </button>
  );
}

function BarberColumn({
  barber,
  appointments,
  blocks,
}: {
  barber: Barber;
  appointments: Appointment[];
  blocks: BlockTime[];
}) {
  const groups = useMemo(() => calendarOverlapGroups(appointments), [appointments]);

  return (
    <div className="flex-1 relative" style={{ borderRight: "1px solid var(--border)" }}>
      {groups.flatMap((group) => group.map((appt, slot) => (
        <AppointmentBlock
          key={appt.id}
          appt={appt}
          color={barber.color}
          slot={slot}
          stackSize={group.length}
        />
      )))}
      {blocks.map((block) => <BlockTimeBlock key={block.id} block={block} />)}
    </div>
  );
}

function AppointmentBlock({ appt, color, slot, stackSize }: {
  appt: Appointment;
  color: string | null;
  slot: number;
  stackSize: number;
}) {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const start = new Date(appt.starts_at);
  const end = new Date(appt.ends_at);
  const startH = start.getHours() + start.getMinutes() / 60;
  const endH = end.getHours() + end.getMinutes() / 60;
  const top = Math.max(0, (startH - START_HOUR) * HOUR_HEIGHT);
  const height = Math.max(24, (endH - startH) * HOUR_HEIGHT - 2);
  const startStr = format(start, "h:mm");
  const endStr = format(end, "h:mma").toLowerCase();

  return (
    <div className="absolute min-w-0 z-[10]" style={{ top, height, left: `calc(${slot * 100 / stackSize}% + 2px)`, width: `calc(${100 / stackSize}% - 4px)` }}>
      <Button
        variant="ghost"
        aria-label={`${appt.client_name}, ${appt.service_name}, ${startStr}, ${language === "es" ? "abrir cita" : "open appointment"}`}
        onClick={() => navigate(`/admin/appointment/${appt.id}`)}
        className="calendar-appointment-card relative block h-full w-full !rounded-none !px-1.5 !py-1 text-left whitespace-normal overflow-hidden"
        style={{ "--calendar-appointment-bg": color || "var(--calendar-appointment-fallback)" } as CSSProperties}
      >
      <div className="absolute inset-0 px-1.5 py-1">
      {(() => {
        const isConfirmedPaid = appt.paid && (appt as any).payment_confirmed;
        const isUnconfirmedPaid = appt.paid && !(appt as any).payment_confirmed;
        const isPartial = !appt.paid && appt.amount_paid_cents > 0 && appt.amount_paid_cents < appt.price_cents;
        if (!isConfirmedPaid && !isUnconfirmedPaid && !isPartial) return null;
        const dotColor = isConfirmedPaid ? "var(--calendar-appointment-paid)" : isPartial ? "var(--calendar-appointment-partial)" : "var(--calendar-appointment-muted)";
        const opacity = (!isConfirmedPaid && !isPartial) ? 0.25 : 1;
        return (
          <DollarSign
            size={11}
            className="absolute bottom-0.5 right-0.5 icon-bold"
            style={{ color: dotColor, opacity }}
          />
        );
      })()}
      <p
        className="text-[10px] font-bold leading-tight flex items-center gap-1"
        style={{ color: "var(--calendar-appointment-fg)" }}
      >
        <span className="truncate">{appt.client_name}</span>
        {isBirthdayOn(appt.date_of_birth, appt.starts_at) && <BirthdayIcon size={11} />}
      </p>
      <p
        className="text-[9px] leading-tight truncate"
        style={{ color: "var(--calendar-appointment-muted)" }}
      >
        {appt.service_name}
      </p>
      {appt.addons && appt.addons.length > 0 && (
        <p
          className="text-[8px] leading-tight truncate"
          style={{ color: "var(--calendar-appointment-tertiary)" }}
        >
          {appt.addons.map((a) => `*${a}`).join(", ")}
        </p>
      )}
      {height > 36 && (
        <p
          className="text-[8px] leading-tight mt-0.5 truncate"
          style={{ color: "var(--calendar-appointment-tertiary)" }}
        >
          {startStr}-{endStr}
        </p>
      )}

      </div>
      </Button>
    </div>
  );
}

function BlockTimeBlock({ block }: { block: BlockTime }) {
  const navigate = useNavigate();
  const start = new Date(block.starts_at);
  const end = new Date(block.ends_at);
  const startH = start.getHours() + start.getMinutes() / 60;
  // For all-day or multi-day blocks ends_at can roll to the next day → clamp endH to END_HOUR
  let endH = end.getHours() + end.getMinutes() / 60;
  if (end.toDateString() !== start.toDateString() || (block as any).is_all_day) {
    endH = END_HOUR;
  }

  const top = Math.max(0, (startH - START_HOUR) * HOUR_HEIGHT);
  const height = Math.max(24, (endH - Math.max(startH, START_HOUR)) * HOUR_HEIGHT - 2);
  const isAllDay = (block as any).is_all_day;

  return (
    <div
      onClick={() => navigate(`/admin/block/${block.id}`)}
      className="absolute left-0.5 right-0.5 rounded-lg overflow-hidden flex flex-col items-center justify-center gap-1 cursor-pointer z-[1]"
      style={{
        top,
        height,
        background: `repeating-linear-gradient(
          135deg,
          rgba(220, 38, 38, 0.22),
          rgba(220, 38, 38, 0.22) 6px,
          rgba(220, 38, 38, 0.08) 6px,
          rgba(220, 38, 38, 0.08) 12px
        )`,
        border: "1.5px solid rgba(220, 38, 38, 0.55)",
        backdropFilter: "blur(1px)",
      }}
    >
      <Ban size={isAllDay ? 18 : 13} style={{ color: "rgba(220, 38, 38, 0.95)" }} />
      <span
        className="font-bold text-center px-1 leading-tight"
        style={{
          color: "rgba(220, 38, 38, 0.95)",
          fontSize: isAllDay ? 11 : 9,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {block.notes || (isAllDay ? "Día bloqueado" : "Bloqueado")}
      </span>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="flex p-4 gap-2" style={{ minHeight: 400 }}>
      <div className="flex-shrink-0" style={{ width: 44 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="rounded mb-1 animate-pulse"
            style={{
              height: 12,
              width: 32,
              background: "var(--bg-surface-2)",
              marginTop: i === 0 ? 0 : HOUR_HEIGHT - 12,
            }}
          />
        ))}
      </div>
      {[1, 2, 3].map((c) => (
        <div key={c} className="flex-1 flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="rounded-lg animate-pulse"
              style={{
                height: 48 + Math.random() * 40,
                background: "var(--bg-surface)",
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
