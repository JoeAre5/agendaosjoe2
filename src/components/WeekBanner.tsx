import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MonthGrid } from "@/components/MonthGrid";
import { usePreferences } from "@/hooks/usePreferences";
import type { ReportScope } from "@/hooks/useWeekSelector";

interface Props {
  label: string;
  scope?: ReportScope;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onScopeChange?: (s: ReportScope) => void;
  onPickDate?: (d: Date) => void;
  showScopeToggle?: boolean;
  selectedDate?: Date;
  /** Disable the built-in `sticky top-0` (use when a parent already handles stickiness). */
  noStick?: boolean;
}

export function WeekBanner({
  label,
  scope,
  onPrev,
  onNext,
  onToday,
  onScopeChange,
  onPickDate,
  showScopeToggle = false,
  selectedDate,
  noStick = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [monthDate, setMonthDate] = useState<Date>(selectedDate ?? new Date());
  const { language } = usePreferences();

  return (
    <div
      className={`${noStick ? "" : "sticky top-0 z-30 "}flex flex-col gap-2 px-4 py-3`}
      style={{ background: "var(--bg-base)", borderBottom: "1px solid var(--divider)" }}
    >
      <div className="relative flex items-center justify-center">
        {/* Calendar picker on the left */}
        {onPickDate && (
          <Popover
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (o && selectedDate) setMonthDate(selectedDate);
            }}
          >
            <PopoverTrigger asChild>
              <button className="absolute left-0 p-1" aria-label="Pick date">
                <CalendarDays size={20} style={{ color: "var(--accent-color)" }} />
              </button>
            </PopoverTrigger>
            <PopoverContent
              className="w-auto p-0 z-50 pointer-events-auto"
              align="start"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--divider)" }}
            >
              <MonthGrid
                monthDate={monthDate}
                selectedDate={selectedDate ?? new Date()}
                onSelectDate={(d) => {
                  onPickDate(d);
                  setOpen(false);
                }}
                onChangeMonth={setMonthDate}
                language={language}
              />
            </PopoverContent>
          </Popover>
        )}

        <div className="flex items-center gap-2">
          <button onClick={onPrev} className="p-1">
            <ChevronLeft size={20} style={{ color: "var(--accent-color)" }} />
          </button>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {label}
          </span>
          <button onClick={onNext} className="p-1">
            <ChevronRight size={20} style={{ color: "var(--accent-color)" }} />
          </button>
        </div>
        <button
          onClick={onToday}
          className="absolute right-0 px-3 py-1 rounded-full text-xs font-semibold"
          style={{ background: "var(--accent-dim)", color: "var(--accent-color)" }}
        >
          Hoy
        </button>
      </div>

      {/* Scope toggle – only shown when explicitly enabled */}
      {showScopeToggle && onScopeChange && scope && (
        <div className="flex gap-3 self-center">
          {(["week", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onScopeChange(s)}
              className="text-[10px] font-semibold transition-colors"
              style={{
                color: scope === s ? "var(--accent-color)" : "var(--text-tertiary)",
                textDecoration: scope === s ? "underline" : "none",
                textUnderlineOffset: "3px",
              }}
            >
              {s === "week" ? "Semana Activa" : "Todo el CSV"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
