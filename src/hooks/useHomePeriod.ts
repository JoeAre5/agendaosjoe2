import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { homeRange, moveHomeDate, normalizeHomeDate, parseHomeDate, prToday, type HomePeriod } from "@/lib/homePeriods";

/** Independent URL keys protect the shared accounting week selector. */
export function useHomePeriod() {
  const [params, setParams] = useSearchParams();
  const rawPeriod = params.get("homePeriod");
  const period: HomePeriod = rawPeriod === "week" || rawPeriod === "month" ? rawPeriod : "day";
  const anchorDate = parseHomeDate(params.get("homeDate")) ?? prToday();
  const date = normalizeHomeDate(anchorDate, period);
  const update = (nextDate: Date, nextPeriod = period) => {
    const next = new URLSearchParams(params);
    next.set("homePeriod", nextPeriod);
    next.set("homeDate", format(nextDate, "yyyy-MM-dd"));
    setParams(next);
  };
  return {
    period, date, ...homeRange(date, period),
    setPeriod: (value: HomePeriod) => update(anchorDate, value),
    goPrev: () => update(moveHomeDate(date, period, -1)),
    goNext: () => update(moveHomeDate(date, period, 1)),
    goToday: () => update(prToday()),
    goToDate: (value: Date) => update(value),
  };
}