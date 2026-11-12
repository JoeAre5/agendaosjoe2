import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBookingRules } from "@/hooks/useBookingRules";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, CalendarCheck, Clock,
  Loader2, CheckCircle, X, ChevronDown,
} from "lucide-react";
import { format, addDays, startOfWeek, isToday, isSameDay, isBefore, startOfDay, addMinutes, addMonths } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { motion, AnimatePresence } from "motion/react";
import { schedulingProxy as acuityProxy, useShopProvider } from "@/lib/scheduling";


interface AcuityTimeSlot { time: string; slotsAvailable: number; }

export default function ClientReschedule() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const dfLocale = language === "en" ? enUS : es;
  const [searchParams] = useSearchParams();

  const apptId = searchParams.get("apptId");
  const acuityId = searchParams.get("acuityId");
  const serviceTypeId = searchParams.get("typeId");
  const barberId = searchParams.get("barberId");
  const serviceName = searchParams.get("service") || "";
  const barberName = searchParams.get("barber") || "";
  const durationMin = parseInt(searchParams.get("duration") || "30", 10);
  const startsAtParam = searchParams.get("startsAt");

  const [calendarId, setCalendarId] = useState<string | null>(null);

  // Booking rules - service-aware via hook
  const { getMinAdvance, maxAdvanceDays: hookMaxDays, cancelWindowHours } = useBookingRules();
  const minAdvanceMinutes = useMemo(() => getMinAdvance(serviceTypeId || null), [getMinAdvance, serviceTypeId]);
  const { provider } = useShopProvider();
  const isNative: boolean | null = provider ? provider.kind === "native" : null;
  const maxAdvanceDays = hookMaxDays;

  // Reschedule window enforcement (uses same window as cancel)
  const windowBlocked = useMemo(() => {
    if (!startsAtParam) return null;
    const hoursUntil = (new Date(startsAtParam).getTime() - Date.now()) / 36e5;
    if (hoursUntil < cancelWindowHours) {
      return { hoursLeft: Math.max(0, hoursUntil), required: cancelWindowHours };
    }
    return null;
  }, [startsAtParam, cancelWindowHours]);

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<AcuityTimeSlot[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = useState(false);
  const [loadingDates, setLoadingDates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1);
  const [monthViewOpen, setMonthViewOpen] = useState(false);
  const [monthViewDate, setMonthViewDate] = useState(new Date());
  const weekTouchRef = useRef<{ startX: number }>({ startX: 0 });

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const goToWeek = (dir: -1 | 1) => { setSwipeDir(dir); setWeekStart((prev) => addDays(prev, dir * 7)); };
  const goToDate = (date: Date) => { setSelectedDate(date); setWeekStart(startOfWeek(date, { weekStartsOn: 0 })); };

  const minDate = useMemo(() => addMinutes(new Date(), minAdvanceMinutes), [minAdvanceMinutes]);
  const maxDate = useMemo(() => addDays(new Date(), maxAdvanceDays), [maxAdvanceDays]);

  const isDateAllowed = useCallback((day: Date) => {
    const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59);
    return dayEnd >= startOfDay(minDate) && day <= maxDate;
  }, [minDate, maxDate]);

  // Load calendar ID from barber (native shops: the barber id is the calendar)
  useEffect(() => {
    const init = async () => {
      if (!barberId || isNative === null) return;
      if (isNative) {
        setCalendarId(barberId);
        return;
      }
      const { data } = await supabase.from("barbers_public").select("acuity_calendar_id").eq("id", barberId).single();
      if (data?.acuity_calendar_id) setCalendarId(String(data.acuity_calendar_id));
    };
    init();
  }, [barberId, isNative]);

  // Load available dates: BOTH selected date's month AND the month being browsed in picker.
  const reschedMonthsKey = useMemo(() => {
    const set = new Set<string>();
    set.add(format(selectedDate, "yyyy-MM"));
    if (monthViewOpen) set.add(format(monthViewDate, "yyyy-MM"));
    return Array.from(set).sort().join("|");
  }, [selectedDate, monthViewOpen, monthViewDate]);

  useEffect(() => {
    if (!serviceTypeId || !calendarId) return;
    setLoadingDates(true);
    const months = reschedMonthsKey.split("|").filter(Boolean);
    Promise.all(
      months.map((month) =>
        acuityProxy(`/availability/dates?appointmentTypeID=${serviceTypeId}&calendarID=${calendarId}&month=${month}`)
          .then((data) => (Array.isArray(data) ? data.map((d: any) => d.date as string) : []))
          .catch(() => [] as string[]),
      ),
    )
      .then((lists) => setAvailableDates(Array.from(new Set(lists.flat()))))
      .finally(() => setLoadingDates(false));
  }, [serviceTypeId, calendarId, reschedMonthsKey]);

  // Load time slots
  useEffect(() => {
    if (!serviceTypeId || !calendarId) return;
    setLoadingTimes(true);
    setSelectedTime(null);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    acuityProxy(`/availability/times?appointmentTypeID=${serviceTypeId}&calendarID=${calendarId}&date=${dateStr}`)
      .then((slotsData) => {
        const raw: AcuityTimeSlot[] = Array.isArray(slotsData) ? slotsData : [];
        // Filter past times based on min_advance_minutes
        const cutoff = addMinutes(new Date(), minAdvanceMinutes).getTime();
        setTimeSlots(raw.filter((s) => new Date(s.time).getTime() >= cutoff));
      })
      .catch(() => setTimeSlots([]))
      .finally(() => setLoadingTimes(false));
  }, [serviceTypeId, calendarId, format(selectedDate, "yyyy-MM-dd"), minAdvanceMinutes]);

  const handleReschedule = async () => {
    if (!selectedTime || !apptId || submitting) return;
    if (!isNative && !acuityId) return;
    setSubmitting(true);
    try {
      // Native shops: the local uuid identifies the appointment and the
      // server updates the row itself; Acuity shops mirror the change below.
      const result = await acuityProxy(`/appointments/${isNative ? apptId : acuityId}/reschedule`, "PUT", {
        datetime: selectedTime,
      });
      if (result?.error || result?.status_code >= 400) throw new Error(result.message || "Error al reagendar");

      if (!isNative) {
        const newEnd = new Date(new Date(selectedTime).getTime() + durationMin * 60_000).toISOString();
        await supabase.from("appointments").update({
          starts_at: selectedTime,
          ends_at: newEnd,
          status: "scheduled",
        }).eq("id", apptId);
      }

      // Fire-and-forget admin push notification
      supabase.functions.invoke("notify-owners-appointment", {
        body: { appointment_id: apptId, kind: "reschedule" },
      }).catch((e) => console.warn("[reschedule] notify-owners warn:", e));

      toast.success(t("portal.reschedule.successToast"));
      setSuccessOpen(true);
    } catch (err: any) {
      toast.error(err.message || t("portal.reschedule.successError"));
    } finally {
      setSubmitting(false);
    }
  };

  // Block view if outside window
  if (windowBlocked) {
    return (
      <div className="min-h-screen flex flex-col mx-auto w-full"
        style={{ maxWidth: 430, background: "var(--bg-base)", color: "var(--text-primary)", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <header className="sticky top-0 z-30 px-4 pt-14 pb-3" style={{ background: "var(--bg-base)" }}>
          <button onClick={() => navigate("/app/cliente")} className="p-1 -ml-1">
            <ChevronLeft size={24} style={{ color: "var(--accent-color)" }} />
          </button>
        </header>
        <div className="px-6 pt-8 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center rounded-full"
            style={{ width: 64, height: 64, background: "rgba(239,68,68,0.1)" }}>
            <X size={32} style={{ color: "var(--red)" }} />
          </div>
          <h1 className="text-xl font-black mb-2" style={{ color: "var(--text-primary)" }}>{t("portal.reschedule.blockedTitle")}</h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            {t("portal.reschedule.blockedBody", { required: windowBlocked.required, hoursLeft: Math.round(windowBlocked.hoursLeft) })}
          </p>
          <button onClick={() => navigate("/app/cliente")}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{ background: "var(--cta-bg)", color: "var(--cta-fg)" }}>
            {t("portal.reschedule.backHome")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col mx-auto w-full"
      style={{ maxWidth: 430, background: "var(--bg-base)", color: "var(--text-primary)", paddingTop: "env(safe-area-inset-top, 0px)" }}>

      {/* Header */}
      <header className="sticky top-0 z-30 px-4 pt-14 pb-3" style={{ background: "var(--bg-base)" }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => navigate("/app/cliente")} className="p-1 -ml-1">
            <ChevronLeft size={24} style={{ color: "var(--accent-color)" }} />
          </button>
          <button onClick={() => navigate("/app/cliente")} className="p-1 -mr-1">
            <X size={20} style={{ color: "var(--text-tertiary)" }} />
          </button>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("portal.reschedule.title")}</h1>
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
          {serviceName} - {barberName}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto pb-32">
        {/* Month title */}
        <div className="px-4 pt-2 pb-2 flex items-center justify-between">
          <button onClick={() => { setMonthViewOpen(!monthViewOpen); if (!monthViewOpen) setMonthViewDate(selectedDate); }}
            className="flex items-center gap-1.5">
            <span className="text-lg font-bold capitalize" style={{ color: "var(--text-primary)" }}>
              {format(selectedDate, "MMMM yyyy", { locale: dfLocale })}
            </span>
            <ChevronDown size={16} className="transition-transform duration-200"
              style={{ color: "var(--text-tertiary)", transform: monthViewOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>
          <button onClick={() => { goToDate(new Date()); setMonthViewOpen(false); }}
            className="w-10 h-10 flex items-center justify-center rounded-full" style={{ border: "1px solid var(--border)" }}>
            <CalendarCheck size={18} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        {/* Month Grid */}
        <AnimatePresence>
          {monthViewOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden px-4">
              <RescheduleMonthGrid monthDate={monthViewDate} selectedDate={selectedDate}
                availableDates={availableDates} isDateAllowed={isDateAllowed} dfLocale={dfLocale}
                onSelectDate={(d) => { goToDate(d); setMonthViewOpen(false); }}
                onChangeMonth={setMonthViewDate} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Week Row */}
        {!monthViewOpen && (
          <div className="px-2 pb-4" style={{ borderBottom: "1px solid var(--divider)" }}>
            <div className="flex items-center gap-1">
              <button onClick={() => goToWeek(-1)} aria-label={t("portal.reschedule.weekPrev")}
                className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                <ChevronLeft size={20} style={{ color: "var(--text-secondary)" }} />
              </button>
              <div className="flex-1 overflow-hidden"
                onTouchStart={(e) => { weekTouchRef.current = { startX: e.touches[0].clientX }; }}
                onTouchEnd={(e) => {
                  const diff = (e.changedTouches[0]?.clientX || 0) - weekTouchRef.current.startX;
                  if (Math.abs(diff) > 50) { if (diff > 0) goToWeek(-1); else goToWeek(1); }
                }}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div key={weekStart.toISOString()}
                    initial={{ x: swipeDir * 120, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
                    exit={{ x: swipeDir * -120, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 600, damping: 22, mass: 0.6 }}
                    className="flex items-center justify-around">
                    {weekDays.map((day, i) => {
                      const selected = isSameDay(day, selectedDate);
                      const todayDay = isToday(day);
                      const allowed = isDateAllowed(day);
                      const dateStr = format(day, "yyyy-MM-dd");
                      const available = (availableDates.length === 0 || availableDates.includes(dateStr)) && allowed;
                      const dayName = format(day, "EEEE", { locale: dfLocale });
                      return (
                        <button key={i} onClick={() => { if (available) setSelectedDate(day); }}
                          disabled={!available}
                          className="flex flex-col items-center gap-1.5 py-1"
                          style={{ opacity: available ? 1 : 0.25, flex: 1 }}>
                          <span className="flex items-center justify-center text-base font-bold rounded-full"
                            style={{
                              width: 44, height: 44,
                              background: selected ? "var(--accent-color)" : "transparent",
                              color: selected ? "#fff" : todayDay ? "var(--accent-color)" : "var(--text-primary)",
                              border: todayDay && !selected ? "2px solid var(--text-tertiary)" : "2px solid transparent",
                            }}>
                            {format(day, "d")}
                          </span>
                          <span className="text-[10px] font-medium capitalize"
                            style={{ color: selected ? "var(--accent-color)" : "var(--text-secondary)" }}>
                            {dayName}
                          </span>
                        </button>
                      );
                    })}
                  </motion.div>
                </AnimatePresence>
              </div>
              <button onClick={() => goToWeek(1)} aria-label={t("portal.reschedule.weekNext")}
                className="shrink-0 w-7 h-11 flex items-center justify-center rounded-lg active:opacity-60 transition-opacity">
                <ChevronRight size={20} style={{ color: "var(--text-secondary)" }} />
              </button>
            </div>
          </div>
        )}

        {/* Time Slots */}
        <div className="px-4 pt-4 space-y-2">
          {loadingTimes || loadingDates ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-14 w-full rounded-xl animate-pulse" style={{ background: "var(--bg-surface)" }} />)}</div>
          ) : timeSlots.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: "var(--text-tertiary)" }}>{t("portal.reschedule.noTimes")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {timeSlots.map((slot) => {
                const isSelected = selectedTime === slot.time;
                return (
                  <button key={slot.time}
                    onClick={() => setSelectedTime(slot.time)}
                    className="py-3 rounded-xl text-[14px] font-semibold text-center active:scale-[0.96]"
                    style={{
                      border: isSelected ? "1.5px solid var(--accent-color)" : "1.5px solid var(--border)",
                      background: isSelected ? "var(--accent-dim)" : "transparent",
                      color: "var(--text-primary)",
                    }}>
                    {format(new Date(slot.time), "h:mm a")}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 z-30" style={{ background: "var(--bg-base)", borderTop: "1px solid var(--divider)" }}>
        <button onClick={handleReschedule}
          disabled={!selectedTime || submitting}
          className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
          style={{
            background: selectedTime ? "var(--cta-bg)" : "var(--bg-surface-2)",
            color: selectedTime ? "var(--cta-fg)" : "var(--text-tertiary)",
            opacity: submitting ? 0.7 : 1,
          }}>
          {submitting && <Loader2 size={18} className="animate-spin" />}
          {t("portal.reschedule.confirm")}
        </button>
      </div>

      {/* Success */}
      <AnimatePresence>
        {successOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", background: "rgba(0,0,0,0.25)" }}
            onClick={() => { setSuccessOpen(false); navigate("/app/cliente"); }}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[340px] flex flex-col items-center gap-3 px-6 py-7"
              style={{ background: "#ffffff", borderRadius: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}>
              <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: [0, 1.2, 1], rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}>
                <CheckCircle className="icon-bold" size={56} color="#22c55e" />
              </motion.div>
              <p className="text-[22px] font-black text-center uppercase" style={{ color: "#111", letterSpacing: "-1px" }}>
                {t("portal.reschedule.successTitle")}
              </p>
              <p className="text-[13px] text-center" style={{ color: "rgba(0,0,0,0.45)" }}>
                {t("portal.reschedule.successDesc")}
              </p>
              <button onClick={() => { setSuccessOpen(false); navigate("/app/cliente"); }}
                className="w-full py-3 font-semibold text-[13px]"
                style={{ background: "#111", color: "#fff", borderRadius: "var(--radius-control)" }}>
                {t("portal.reschedule.backHome")}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Month Grid for Reschedule ─── */
function RescheduleMonthGrid({ monthDate, selectedDate, availableDates, isDateAllowed, onSelectDate, onChangeMonth, dfLocale }: {
  monthDate: Date; selectedDate: Date; availableDates: string[];
  isDateAllowed: (d: Date) => boolean;
  onSelectDate: (d: Date) => void; onChangeMonth: (d: Date) => void;
  dfLocale: typeof es;
}) {
  const dayLabels = dfLocale === enUS ? ["S", "M", "T", "W", "T", "F", "S"] : ["D", "L", "M", "M", "J", "V", "S"];
  const days = useMemo(() => {
    const start = startOfWeek(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1), { weekStartsOn: 0 });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthDate]);

  return (
    <div className="pb-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => onChangeMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} className="p-1">
          <ChevronLeft size={18} style={{ color: "var(--text-tertiary)" }} />
        </button>
        <span className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
          {format(monthDate, "MMMM yyyy", { locale: dfLocale })}
        </span>
        <button onClick={() => onChangeMonth(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} className="p-1">
          <ChevronRight size={18} style={{ color: "var(--text-tertiary)" }} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {dayLabels.map((l, i) => (
          <div key={i} className="text-center text-[10px] font-semibold py-1" style={{ color: "var(--text-tertiary)" }}>{l}</div>
        ))}
        {days.map((day, i) => {
          const inMonth = day.getMonth() === monthDate.getMonth();
          const selected = isSameDay(day, selectedDate);
          const todayDay = isToday(day);
          const dateStr = format(day, "yyyy-MM-dd");
          const available = inMonth && isDateAllowed(day) && (availableDates.length === 0 || availableDates.includes(dateStr));
          return (
            <button key={i} onClick={() => { if (available) onSelectDate(day); }}
              disabled={!available}
              className="flex items-center justify-center py-1.5"
              style={{ opacity: inMonth ? (available ? 1 : 0.2) : 0.1 }}>
              <span className="flex items-center justify-center text-xs font-medium rounded-full"
                style={{
                  width: 30, height: 30,
                  background: selected ? "var(--accent-color)" : "transparent",
                  color: selected ? "var(--bg-base)" : todayDay ? "var(--accent-color)" : "var(--text-primary)",
                  border: todayDay && !selected ? "2px solid var(--accent-color)" : "2px solid transparent",
                }}>
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
