import { useState, useCallback, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { startOfWeek, addWeeks, endOfWeek, format, parse, isValid } from "date-fns";
import { es } from "date-fns/locale";

export type ReportScope = "week" | "all";

const WEEK_PARAM = "week";

/** Parse YYYY-MM-DD safely; returns null when invalid. */
function parseWeekParam(raw: string | null): Date | null {
  if (!raw) return null;
  const d = parse(raw, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
}

export function useWeekSelector() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Phase 1B.UX — week selector now lives in the URL (?week=YYYY-MM-DD).
  // Survives Safari restore, refresh, back navigation, and is shareable.
  const initial = useMemo(() => {
    const fromUrl = parseWeekParam(searchParams.get(WEEK_PARAM));
    if (fromUrl) return startOfWeek(fromUrl, { weekStartsOn: 6 });
    return startOfWeek(new Date(), { weekStartsOn: 6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally compute once on mount

  // Weeks run Saturday (6) to Friday
  const [weekStart, setWeekStartState] = useState<Date>(initial);
  const [scope, setScope] = useState<ReportScope>("week");

  const weekEnd = useMemo(() => endOfWeek(weekStart, { weekStartsOn: 6 }), [weekStart]);

  // Push state → URL whenever weekStart changes
  const writeUrl = useCallback(
    (d: Date) => {
      const next = new URLSearchParams(searchParams);
      next.set(WEEK_PARAM, format(d, "yyyy-MM-dd"));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const setWeekStart = useCallback(
    (updater: Date | ((prev: Date) => Date)) => {
      setWeekStartState((prev) => {
        const next = typeof updater === "function" ? (updater as (p: Date) => Date)(prev) : updater;
        writeUrl(next);
        return next;
      });
    },
    [writeUrl]
  );

  // External URL change (back button, deep link) → state
  useEffect(() => {
    const fromUrl = parseWeekParam(searchParams.get(WEEK_PARAM));
    if (!fromUrl) return;
    const normalized = startOfWeek(fromUrl, { weekStartsOn: 6 });
    if (format(normalized, "yyyy-MM-dd") !== format(weekStart, "yyyy-MM-dd")) {
      setWeekStartState(normalized);
    }
  }, [searchParams, weekStart]);

  const goNext = useCallback(() => setWeekStart((w) => addWeeks(w, 1)), [setWeekStart]);
  const goPrev = useCallback(() => setWeekStart((w) => addWeeks(w, -1)), [setWeekStart]);
  const goToday = useCallback(
    () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 6 })),
    [setWeekStart]
  );
  const goToDate = useCallback(
    (d: Date) => setWeekStart(startOfWeek(d, { weekStartsOn: 6 })),
    [setWeekStart]
  );

  const label = `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM", { locale: es })}`;
  const rangeLabel = `${format(weekStart, "d MMM", { locale: es })} - ${format(weekEnd, "d MMM yyyy", { locale: es })}`;

  return { weekStart, weekEnd, goNext, goPrev, goToday, goToDate, scope, setScope, label, rangeLabel };
}
