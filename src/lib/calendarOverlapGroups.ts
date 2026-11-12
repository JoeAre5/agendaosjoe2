export interface CalendarInterval { id: string; starts_at: string; ends_at: string; }

/** Connected half-open ranges, not rounded slots; adjacent appointments stay separate. */
export function calendarOverlapGroups<T extends CalendarInterval>(appointments: T[]): T[][] {
  const sorted = [...appointments].sort((a, b) =>
    Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.id.localeCompare(b.id));
  const groups: T[][] = [];
  let end = -Infinity;
  for (const appointment of sorted) {
    if (Date.parse(appointment.starts_at) >= end || groups.length === 0) {
      groups.push([appointment]);
      end = Date.parse(appointment.ends_at);
    } else {
      groups[groups.length - 1].push(appointment);
      end = Math.max(end, Date.parse(appointment.ends_at));
    }
  }
  return groups;
}