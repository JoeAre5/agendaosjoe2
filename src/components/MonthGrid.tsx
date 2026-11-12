import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  getDay,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";

interface Props {
  monthDate: Date;
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
  onChangeMonth: (d: Date) => void;
  language?: string;
}

export function MonthGrid({
  monthDate,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  language = "es",
}: Props) {
  const dateFnsLocale = language === "es" ? esLocale : enUS;
  const dayLabels =
    language === "es"
      ? ["D", "L", "M", "M", "J", "V", "S"]
      : ["S", "M", "T", "W", "T", "F", "S"];

  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const startDay = getDay(monthStart);

  const daysInMonth: (Date | null)[] = [];
  for (let i = 0; i < startDay; i++) daysInMonth.push(null);
  let d = monthStart;
  while (d <= monthEnd) {
    daysInMonth.push(d);
    d = addDays(d, 1);
  }

  const touchRef = useRef<number>(0);

  return (
    <div
      className="pb-3 px-3 pt-3"
      style={{ minWidth: 280 }}
      onTouchStart={(e) => {
        touchRef.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const diff = (e.changedTouches[0]?.clientX || 0) - touchRef.current;
        if (Math.abs(diff) > 60) {
          if (diff > 0) onChangeMonth(subMonths(monthDate, 1));
          else onChangeMonth(addMonths(monthDate, 1));
        }
      }}
    >
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

      <div className="grid grid-cols-7 gap-y-1">
        {daysInMonth.map((day, i) => {
          if (!day) return <div key={`blank-${i}`} />;
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
                border:
                  todayDay && !isSelected
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
