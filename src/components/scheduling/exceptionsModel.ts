// Modelo puro de las excepciones de horario por fecha: agrupa las filas de un mismo alcance y fecha.

export interface ExceptionRow {
  id: string;
  barber_id: string | null;
  exception_date: string;
  is_closed: boolean;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
}

export interface Group {
  key: string;
  date: string;
  barberId: string | null;
  closed: boolean;
  ranges: Array<{ start: string; end: string }>;
  note: string | null;
  ids: string[];
}

const hhmm = (v: string | null) => String(v ?? "").slice(0, 5);
export const ALL = "all";

/** Groups the rows of one scope and date (a split shift is several rows). */
export function groupExceptions(rows: ExceptionRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.exception_date}|${r.barber_id ?? ALL}`;
    let g = map.get(key);
    if (!g) {
      g = { key, date: r.exception_date, barberId: r.barber_id, closed: false, ranges: [], note: r.note, ids: [] };
      map.set(key, g);
    }
    g.ids.push(r.id);
    if (r.is_closed) g.closed = true;
    else g.ranges.push({ start: hhmm(r.start_time), end: hhmm(r.end_time) });
  }
  return [...map.values()]
    .map((g) => ({ ...g, ranges: g.ranges.sort((a, b) => a.start.localeCompare(b.start)) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}

