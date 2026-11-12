import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { ChevronLeft, ChevronRight, Loader2, Clock } from "lucide-react";
import { SubpageHeader } from "@/components/SubpageHeader";
import { motion, AnimatePresence } from "motion/react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { format, addMonths, subMonths, startOfMonth, getDaysInMonth, getDay, isSameDay, isToday, parseISO } from "date-fns";
import { es, enUS } from "date-fns/locale";

/* ─── Barber colors ─── */
const BARBER_COLORS: Record<string, string> = {
  charlie: "#c9a882",
  pito: "#8aaec9",
  joseph: "#7ab893",
};

function getBarberColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(BARBER_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return "var(--accent-color)";
}

/* ─── Acuity proxy ─── */
async function acuityProxy(path: string): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/acuity-proxy`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ path, method: "GET" }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Acuity error");
  return json;
}

interface AcuityType {
  id: number;
  name: string;
  duration: number;
  calendarIDs: number[];
}

interface AcuityCalendar {
  id: number;
  name: string;
}

interface TimeSlot {
  time: string;
  slotsAvailable: number;
}

const WEEKDAY_LABELS_ES = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];
const WEEKDAY_LABELS_EN = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function Availability() {
  const navigate = useNavigate();
  const { language } = useTranslation();
  const locale = language === "es" ? es : enUS;
  const weekLabels = language === "es" ? WEEKDAY_LABELS_ES : WEEKDAY_LABELS_EN;

  const [calendars, setCalendars] = useState<AcuityCalendar[]>([]);
  const [types, setTypes] = useState<AcuityType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCalIdx, setSelectedCalIdx] = useState(0);
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [availDates, setAvailDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingTimes, setLoadingTimes] = useState(false);

  // Load calendars + types
  useEffect(() => {
    Promise.all([acuityProxy("/calendars"), acuityProxy("/appointment-types")])
      .then(([cals, tps]) => {
        if (Array.isArray(cals)) setCalendars(cals);
        if (Array.isArray(tps)) setTypes(tps.filter((t: any) => !t.private && t.active !== false));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedCal = calendars[selectedCalIdx] || null;

  // Find a default type for this calendar to check availability
  const defaultTypeForCal = useMemo(() => {
    if (!selectedCal) return null;
    return types.find((t) => t.calendarIDs?.includes(selectedCal.id)) || null;
  }, [selectedCal, types]);

  // Fetch available dates for selected calendar + month
  useEffect(() => {
    if (!selectedCal || !defaultTypeForCal) return;
    setLoadingDates(true);
    setAvailDates([]);
    setSelectedDate(null);
    setTimeSlots([]);
    const monthStr = format(month, "yyyy-MM");
    acuityProxy(
      `/availability/dates?appointmentTypeID=${defaultTypeForCal.id}&calendarID=${selectedCal.id}&month=${monthStr}`
    )
      .then((data) => {
        if (Array.isArray(data)) {
          setAvailDates(data.map((d: any) => d.date));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDates(false));
  }, [selectedCal, defaultTypeForCal, month]);

  // Fetch time slots for selected date
  useEffect(() => {
    if (!selectedDate || !selectedCal || !defaultTypeForCal) return;
    setLoadingTimes(true);
    setTimeSlots([]);
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    acuityProxy(
      `/availability/times?appointmentTypeID=${defaultTypeForCal.id}&calendarID=${selectedCal.id}&date=${dateStr}`
    )
      .then((data) => {
        if (Array.isArray(data)) setTimeSlots(data);
      })
      .catch(() => {})
      .finally(() => setLoadingTimes(false));
  }, [selectedDate, selectedCal, defaultTypeForCal]);

  // Calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(month);
    const firstDow = getDay(startOfMonth(month));
    const blanks = Array.from({ length: firstDow }, () => null);
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(month.getFullYear(), month.getMonth(), i + 1);
      const dateStr = format(d, "yyyy-MM-dd");
      return { date: d, available: availDates.includes(dateStr) };
    });
    return [...blanks, ...days];
  }, [month, availDates]);

  const barberColor = selectedCal ? getBarberColor(selectedCal.name) : "var(--accent-color)";

  if (loading) {
    return (
      <div
        className="relative mx-auto w-full min-h-screen flex items-center justify-center"
        style={{ maxWidth: 430, background: "var(--bg-base)" }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--accent-color)" }} />
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto w-full min-h-screen"
      style={{
        maxWidth: 430,
        background: "var(--bg-base)",
        color: "var(--text-primary)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <SubpageHeader
        sticky
        title={language === "es" ? "Disponibilidad" : "Availability"}
        onBack={() => navigate("/admin?tab=menu")}
      />

      {/* Barber tabs — unified SegmentedTabs */}
      {calendars.length > 0 && (
        <div className="px-4 pb-3">
          <SegmentedTabs
            layoutId="availability-barber-pill"
            value={String(selectedCalIdx)}
            onChange={(id) => setSelectedCalIdx(Number(id))}
            tabs={calendars.map((cal, i) => {
              const color = getBarberColor(cal.name);
              return {
                id: String(i),
                label: cal.name.split(" ")[0],
                activeBg: color,
                activeColor: "#fff",
              };
            })}
          />
        </div>
      )}

      {/* Month nav */}
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="p-2 rounded-full active:opacity-60"
          style={{ color: "var(--text-secondary)" }}
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
          {format(month, "MMMM yyyy", { locale })}
        </span>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="p-2 rounded-full active:opacity-60"
          style={{ color: "var(--text-secondary)" }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 px-4 mb-1">
        {weekLabels.map((l) => (
          <div
            key={l}
            className="text-center text-xs font-medium py-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {l}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 px-4 mb-4 relative">
        {loadingDates && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 size={20} className="animate-spin" style={{ color: barberColor }} />
          </div>
        )}
        {calendarDays.map((day, i) => {
          if (!day) {
            return <div key={`blank-${i}`} className="aspect-square" />;
          }
          const sel = selectedDate && isSameDay(day.date, selectedDate);
          const today = isToday(day.date);
          return (
            <button
              key={i}
              disabled={!day.available}
              onClick={() => setSelectedDate(day.date)}
              className="aspect-square flex items-center justify-center rounded-full text-sm relative transition-all"
              style={{
                background: sel ? barberColor : "transparent",
                color: sel
                  ? "#fff"
                  : day.available
                  ? "var(--text-primary)"
                  : "var(--text-muted)",
                fontWeight: sel || today ? 700 : 400,
                opacity: loadingDates ? 0.3 : day.available ? 1 : 0.35,
              }}
            >
              {day.date.getDate()}
              {today && !sel && (
                <span
                  className="absolute bottom-1 w-1 h-1 rounded-full"
                  style={{ background: barberColor }}
                />
              )}
              {day.available && !sel && (
                <span
                  className="absolute bottom-1.5 w-1 h-1 rounded-full"
                  style={{ background: barberColor, opacity: 0.5 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Time slots */}
      <AnimatePresence mode="wait">
        {selectedDate && (
          <motion.div
            key={selectedDate.toISOString()}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="px-4 pb-8"
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} style={{ color: barberColor }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {format(selectedDate, "EEEE, d MMM", { locale })}
              </span>
              <span className="text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>
                {timeSlots.length} {language === "es" ? "horarios" : "slots"}
              </span>
            </div>

            {loadingTimes ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin" style={{ color: barberColor }} />
              </div>
            ) : timeSlots.length === 0 ? (
              <p className="text-center py-6 text-sm" style={{ color: "var(--text-secondary)" }}>
                {language === "es" ? "No hay horarios disponibles" : "No available slots"}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {timeSlots.map((slot) => {
                  const t = parseISO(slot.time);
                  return (
                    <div
                      key={slot.time}
                      className="rounded-xl py-2.5 text-center text-sm font-medium"
                      style={{
                        background: "var(--card-surface)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--divider)",
                      }}
                    >
                      {format(t, "h:mm a")}
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!selectedDate && !loadingDates && (
        <p className="text-center py-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          {language === "es"
            ? "Selecciona una fecha para ver horarios"
            : "Select a date to see available times"}
        </p>
      )}
    </div>
  );
}
