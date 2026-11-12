// Modelo puro del editor de horarios semanales (sin acceso a la base): una semana con uno o varios
// rangos por dia. Un dia con varios rangos es un horario partido (por ejemplo con almuerzo).

export interface HourRow {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  barber_id?: string | null;
}

export interface HourRange {
  /** Row id when it already exists in the database. */
  id: string | null;
  start: string;
  end: string;
}

/** Editable week: one entry per weekday, each with one or more ranges. */
export interface DayState {
  active: boolean;
  ranges: HourRange[];
  /** Ids loaded for this day: rows missing from `ranges` on save are deleted. */
  origIds: string[];
}

const DEFAULT_START = "09:00";
const DEFAULT_END = "17:00";
const LUNCH_START = "12:00";
const LUNCH_END = "13:00";
const hhmm = (v: string) => String(v).slice(0, 5);

export function emptyDay(): DayState {
  return { active: false, ranges: [{ id: null, start: DEFAULT_START, end: DEFAULT_END }], origIds: [] };
}

/** Builds the editable week from stored rows (several rows per day = split shift). */
export function weekFromRows(rows: HourRow[]): DayState[] {
  const week: DayState[] = Array.from({ length: 7 }, () => emptyDay());
  const sorted = [...rows].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
  const seen = new Set<number>();
  for (const r of sorted) {
    const d = week[r.day_of_week];
    if (!d) continue;
    if (!seen.has(r.day_of_week)) {
      seen.add(r.day_of_week);
      d.ranges = [];
      d.active = false;
    }
    d.ranges.push({ id: r.id, start: hhmm(r.start_time), end: hhmm(r.end_time) });
    d.origIds.push(r.id);
    if (r.is_active) d.active = true;
  }
  return week;
}

/** Why a day cannot be saved, or null when its ranges are valid (ordered, no overlaps). */
export function dayProblem(d: DayState): "order" | "overlap" | null {
  if (!d.active) return null;
  const sorted = [...d.ranges].sort((a, b) => a.start.localeCompare(b.start));
  for (const r of sorted) if (r.end <= r.start) return "order";
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) return "overlap";
  return null;
}

/** True when a single range covers the lunch hour (12:00–13:00), so it can be split. */
export function canSplitLunch(d: DayState): boolean {
  return d.ranges.length === 1 && d.ranges[0].start <= LUNCH_START && d.ranges[0].end >= LUNCH_END;
}

/** Splits the only range around the lunch hour: 09:00–17:00 becomes 09:00–12:00 and 13:00–17:00. */
export function splitLunch(d: DayState): DayState {
  if (!canSplitLunch(d)) return d;
  const [r] = d.ranges;
  const first: HourRange = { id: r.id, start: r.start, end: LUNCH_START };
  const second: HourRange = { id: null, start: LUNCH_END, end: r.end };
  const ranges = [first, second].filter((x) => x.end > x.start);
  return { ...d, ranges };
}

