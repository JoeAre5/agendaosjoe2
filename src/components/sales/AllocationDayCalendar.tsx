// Compact calendar preview used when assigning a pending payment.
// Same visual language as the main Calendar view (barber columns, time grid,
// $ badge for paid/partial) without the extra detail.
import { useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, DollarSign, CheckCircle2 } from "lucide-react";
import { format, isSameDay, addDays } from "date-fns";
import { es } from "date-fns/locale";

export interface CalAppt {
  id: string;
  starts_at: string;
  ends_at: string;
  client_name: string;
  service_name: string;
  price_cents: number;
  amount_paid_cents: number;
  tip_cents: number;
  payment_confirmed: boolean;
  paid: boolean;
  barber_id: string;
  barber_name: string;
  barber_color: string | null;
  settled: boolean;
}

const START_HOUR = 7;
const END_HOUR = 21;
const HOUR_H = 56;

interface Props {
  appts: CalAppt[];
  day: Date;
  minDay: Date;
  maxDay: Date;
  onDayChange: (d: Date) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  txTotal: number;
  balanceOf: (a: CalAppt) => number;
}

export function AllocationDayCalendar({ appts, day, minDay, maxDay, onDayChange, selectedId, onSelect, search, txTotal, balanceOf }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayAppts = useMemo(() => appts.filter((a) => isSameDay(new Date(a.starts_at), day)), [appts, day]);

  const barbers = useMemo(() => {
    const m = new Map<string, { id: string; name: string; color: string | null }>();
    appts.forEach((a) => m.set(a.barber_id, { id: a.barber_id, name: a.barber_name, color: a.barber_color }));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [appts]);

  // Scroll to first appointment of the day
  useEffect(() => {
    if (!scrollRef.current) return;
    const first = dayAppts.reduce<number | null>((min, a) => {
      const d = new Date(a.starts_at);
      const h = d.getHours() + d.getMinutes() / 60;
      return min === null || h < min ? h : min;
    }, null);
    scrollRef.current.scrollTop = first !== null ? Math.max(0, (first - START_HOUR - 0.5) * HOUR_H) : 0;
  }, [day, dayAppts]);

  const days: Date[] = [];
  for (let d = new Date(minDay); d <= maxDay; d = addDays(d, 1)) days.push(new Date(d));
  const canPrev = !isSameDay(day, minDay);
  const canNext = !isSameDay(day, maxDay);
  const q = search.trim().toLowerCase();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Day strip */}
      <div className="flex items-center gap-1 px-2 pb-2">
        <button disabled={!canPrev} onClick={() => onDayChange(addDays(day, -1))} className="p-1.5 disabled:opacity-25">
          <ChevronLeft size={18} style={{ color: "var(--text-secondary)" }} />
        </button>
        <div className="flex-1 flex justify-between">
          {days.map((d) => {
            const sel = isSameDay(d, day);
            const today = isSameDay(d, new Date());
            return (
              <button key={d.toISOString()} onClick={() => onDayChange(d)} className="flex flex-col items-center gap-0.5 px-1">
                <span className="text-[9px] uppercase font-semibold" style={{ color: sel ? "var(--accent-color)" : "var(--text-tertiary)" }}>
                  {format(d, "EEE", { locale: es }).replace(".", "")}
                </span>
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold"
                  style={{
                    background: sel ? "var(--accent-color)" : "transparent",
                    color: sel ? "var(--cta-fg)" : "var(--text-primary)",
                    border: today && !sel ? "1.5px solid var(--accent-color)" : undefined,
                  }}
                >
                  {format(d, "d")}
                </span>
              </button>
            );
          })}
        </div>
        <button disabled={!canNext} onClick={() => onDayChange(addDays(day, 1))} className="p-1.5 disabled:opacity-25">
          <ChevronRight size={18} style={{ color: "var(--text-secondary)" }} />
        </button>
      </div>

      {/* Barber header */}
      <div className="flex pl-10 pr-1" style={{ borderTop: "1px solid var(--divider)", borderBottom: "1px solid var(--divider)" }}>
        {barbers.map((b) => (
          <div key={b.id} className="flex-1 py-1.5 text-center text-[10px] font-bold truncate" style={{ color: b.color || "var(--text-primary)" }}>
            {b.name.split(" ")[0]}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: (END_HOUR - START_HOUR) * HOUR_H }}>
          <div className="w-10 flex-shrink-0 relative">
            {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
              <span key={i} className="absolute right-1 text-[9px] -translate-y-1/2" style={{ top: i * HOUR_H, color: "var(--text-tertiary)" }}>
                {i === 0 ? "" : format(new Date(2000, 0, 1, START_HOUR + i), "h a")}
              </span>
            ))}
          </div>
          <div className="flex-1 flex relative pr-1">
            {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
              <div key={i} className="absolute left-0 right-0" style={{ top: i * HOUR_H, borderTop: "1px solid var(--divider)" }} />
            ))}
            {barbers.map((b) => (
              <div key={b.id} className="flex-1 relative" style={{ borderLeft: "1px solid var(--divider)" }}>
                {dayAppts.filter((a) => a.barber_id === b.id).map((a) => {
                  const s = new Date(a.starts_at);
                  const e = new Date(a.ends_at || a.starts_at);
                  const sh = s.getHours() + s.getMinutes() / 60;
                  const eh = Math.max(sh + 0.4, e.getHours() + e.getMinutes() / 60);
                  const color = b.color || "var(--accent-color)";
                  const isSel = selectedId === a.id;
                  const matches = !q || a.client_name.toLowerCase().includes(q) || a.service_name.toLowerCase().includes(q);
                  const confirmedPaid = a.paid && a.payment_confirmed;
                  const partial = !a.paid && a.amount_paid_cents > 0;
                  const bal = balanceOf(a);
                  const exact = !a.settled && bal === txTotal;
                  return (
                    <button
                      key={a.id}
                      disabled={a.settled}
                      onClick={() => onSelect(a.id)}
                      className="absolute left-0.5 right-0.5 text-left overflow-hidden px-1 py-0.5 transition-all"
                      style={{
                        top: (sh - START_HOUR) * HOUR_H + 1,
                        height: Math.max(24, (eh - sh) * HOUR_H - 2),
                        background: isSel ? color : `${color}22`,
                        borderLeft: `3px solid ${color}`,
                        outline: isSel ? "2px solid var(--text-primary)" : exact ? "1.5px dashed #22c55e" : undefined,
                        opacity: !matches ? 0.2 : a.settled ? 0.45 : 1,
                        zIndex: isSel ? 5 : 2,
                      }}
                    >
                      <p className="text-[10px] font-bold leading-tight truncate" style={{ color: isSel ? "#fff" : "var(--text-primary)" }}>
                        {a.client_name}
                      </p>
                      <p className="text-[9px] leading-tight truncate" style={{ color: isSel ? "#fff" : "var(--text-secondary)" }}>
                        {format(s, "h:mm")} · {a.settled ? "pagada" : `$${(bal / 100).toFixed(0)}`}
                      </p>
                      {isSel ? (
                        <CheckCircle2 size={12} className="absolute top-0.5 right-0.5" style={{ color: "#fff" }} />
                      ) : (confirmedPaid || partial) && (
                        <DollarSign size={11} className="absolute bottom-0.5 right-0.5 icon-bold" style={{ color: confirmedPaid ? "var(--green)" : "#E95125" }} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
