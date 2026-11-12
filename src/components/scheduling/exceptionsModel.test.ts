import { describe, expect, it } from "vitest";
import { groupExceptions } from "./exceptionsModel";

const r = (id: string, date: string, barber: string | null, closed: boolean, s: string | null = null, e: string | null = null) => ({
  id, barber_id: barber, exception_date: date, is_closed: closed, start_time: s, end_time: e, note: null,
});

describe("groupExceptions", () => {
  it("agrupa las filas de un mismo alcance y fecha (horario partido) en orden de hora", () => {
    const g = groupExceptions([r("2", "2026-12-24", "b1", false, "15:00:00", "16:00:00"), r("1", "2026-12-24", "b1", false, "09:00:00", "10:00:00")]);
    expect(g).toHaveLength(1);
    expect(g[0].ranges).toEqual([{ start: "09:00", end: "10:00" }, { start: "15:00", end: "16:00" }]);
    expect(g[0].ids.sort()).toEqual(["1", "2"]);
    expect(g[0].closed).toBe(false);
  });

  it("separa 'todos' de un barbero y ordena por fecha", () => {
    const g = groupExceptions([r("a", "2026-12-25", null, true), r("b", "2026-12-24", "b1", true), r("c", "2026-12-24", null, true)]);
    expect(g.map((x) => `${x.date}|${x.barberId ?? "todos"}`)).toEqual(["2026-12-24|todos", "2026-12-24|b1", "2026-12-25|todos"]);
    expect(g.every((x) => x.closed)).toBe(true);
  });

  it("sin filas no hay grupos", () => {
    expect(groupExceptions([])).toEqual([]);
  });
});
