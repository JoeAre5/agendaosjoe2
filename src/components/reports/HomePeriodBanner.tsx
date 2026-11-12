import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, LocateFixed } from "lucide-react";
import { format } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { operatingDayNumber, type HomePeriod } from "@/lib/homePeriods";
import type { useHomePeriod } from "@/hooks/useHomePeriod";

export function HomePeriodBanner({ selection, es, spacious = false }: { selection: ReturnType<typeof useHomePeriod>; es: boolean; spacious?: boolean }) {
  const [open, setOpen] = useState(false);
  const locale = es ? esLocale : enUS;
  const { period, date, start, end } = selection;
  const label = period === "day" ? format(date, "EEE, d MMM yyyy", { locale })
    : period === "month" ? format(date, "MMMM yyyy", { locale })
    : `${format(start, "d MMM", { locale })} - ${format(end, "d MMM yyyy", { locale })}`;
  const periods: { value: HomePeriod; label: string }[] = [
    { value: "day", label: es ? "Diario" : "Daily" },
    { value: "week", label: es ? "Semanal" : "Weekly" },
    { value: "month", label: es ? "Mensual" : "Monthly" },
  ];
  return (
    <div className={spacious ? "px-4 pt-3 pb-5 border-b border-border space-y-5" : "px-4 pb-3 border-b border-border space-y-2"}>
      <SegmentedTabs tabs={periods.map(item => ({ id: item.value, label: item.label }))} value={period} onChange={selection.setPeriod} height={spacious ? 48 : 36} layoutId="home-period-pill" labelClassName="text-xs font-semibold" />
      <div className="grid grid-cols-[36px_36px_minmax(0,1fr)_36px_36px] items-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild><Button variant="ghost" size="icon" className="w-9 h-9 text-foreground" title={es ? "Elegir fecha" : "Choose date"} aria-label={es ? "Elegir fecha" : "Choose date"}><CalendarDays /></Button></PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} defaultMonth={date} locale={locale} disabled={period === "day" ? day => operatingDayNumber(day) === null : undefined} onSelect={day => { if (day) { selection.goToDate(day); setOpen(false); } }} />
          </PopoverContent>
        </Popover>
        <Button variant="ghost" size="icon" className="w-9 h-9 text-foreground" aria-label={es ? "Período anterior" : "Previous period"} onClick={selection.goPrev}><ChevronLeft /></Button>
        <div className="min-w-0 text-center">
          <p className="text-xs font-semibold capitalize text-foreground leading-5">{label}</p>
          {period === "day" && <p className="text-[10px] text-muted-foreground">{es ? "Día operativo" : "Operating day"} {operatingDayNumber(date)}</p>}
        </div>
        <Button variant="ghost" size="icon" className="w-9 h-9 text-foreground" aria-label={es ? "Período siguiente" : "Next period"} onClick={selection.goNext}><ChevronRight /></Button>
        <Button variant="ghost" size="icon" className="w-9 h-9 text-foreground" title={es ? "Hoy" : "Today"} aria-label={es ? "Hoy" : "Today"} onClick={selection.goToday}><LocateFixed /></Button>
      </div>
    </div>
  );
}