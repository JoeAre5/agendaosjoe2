import { describe, expect, it } from "vitest";
import { canSplitLunch, dayProblem, emptyDay, splitLunch, weekFromRows } from "./hoursModel";

const row = (id: string, day_of_week: number, start_time: string, end_time: string, is_active = true) => ({ id, day_of_week, start_time, end_time, is_active });

describe("hoursModel", () => {
  it("una semana vacia trae 7 dias apagados con 09:00-17:00 de plantilla", () => {
    const w = weekFromRows([]);
    expect(w).toHaveLength(7);
    expect(w.every((d) => !d.active && d.ranges.length === 1 && d.ranges[0].start === "09:00" && d.ranges[0].end === "17:00")).toBe(true);
  });

  it("varias filas del mismo dia forman un horario partido, ordenado por hora", () => {
    const w = weekFromRows([row("b", 5, "13:00:00", "17:00:00"), row("a", 5, "09:00:00", "12:00:00")]);
    expect(w[5].active).toBe(true);
    expect(w[5].ranges.map((r) => `${r.start}-${r.end}`)).toEqual(["09:00-12:00", "13:00-17:00"]);
    expect(w[5].origIds).toEqual(["a", "b"]);
    expect(w[4].ranges).toHaveLength(1); // los demas dias no cambian
  });

  it("un dia con todas sus filas inactivas queda apagado pero conserva los rangos", () => {
    const w = weekFromRows([row("a", 2, "09:00:00", "17:00:00", false)]);
    expect(w[2].active).toBe(false);
    expect(w[2].ranges[0].id).toBe("a");
  });

  it("valida el orden y la superposicion de rangos", () => {
    const d = { ...emptyDay(), active: true };
    expect(dayProblem(d)).toBeNull();
    expect(dayProblem({ ...d, ranges: [{ id: null, start: "10:00", end: "09:00" }] })).toBe("order");
    expect(dayProblem({ ...d, ranges: [{ id: null, start: "09:00", end: "12:00" }, { id: null, start: "11:30", end: "17:00" }] })).toBe("overlap");
    expect(dayProblem({ ...d, ranges: [{ id: null, start: "09:00", end: "12:00" }, { id: null, start: "12:00", end: "17:00" }] })).toBeNull();
    expect(dayProblem({ ...d, active: false, ranges: [{ id: null, start: "10:00", end: "09:00" }] })).toBeNull(); // dia apagado no valida
  });

  it("Almuerzo 12-1 parte 09:00-17:00 en 09:00-12:00 y 13:00-17:00 y conserva el id del primero", () => {
    const d = { active: true, origIds: ["x"], ranges: [{ id: "x", start: "09:00", end: "17:00" }] };
    expect(canSplitLunch(d)).toBe(true);
    const s = splitLunch(d);
    expect(s.ranges).toEqual([{ id: "x", start: "09:00", end: "12:00" }, { id: null, start: "13:00", end: "17:00" }]);
    expect(canSplitLunch(s)).toBe(false); // ya esta partido
  });

  it("no se parte el almuerzo si el rango no cubre 12:00-13:00", () => {
    const d = { active: true, origIds: [], ranges: [{ id: null, start: "13:00", end: "17:00" }] };
    expect(canSplitLunch(d)).toBe(false);
    expect(splitLunch(d)).toBe(d);
  });
});

describe("hoursModel con datos reales (la base de Charlie trae 6 filas repetidas por dia)", () => {
  const r = (id: string, d: number, s: string, e: string) => ({ id, day_of_week: d, start_time: s, end_time: e, is_active: true });

  it("seis filas identicas 09:00-17:00 se muestran como un solo rango y conservan todos los ids para limpiar", () => {
    const w = weekFromRows(["a", "b", "c", "d", "e", "f"].map((id) => r(id, 2, "09:00:00", "17:00:00")));
    expect(w[2].ranges).toEqual([{ id: "a", start: "09:00", end: "17:00" }]);
    expect(w[2].origIds).toHaveLength(6); // al guardar se borran las 5 sobrantes
    expect(dayProblem(w[2])).toBeNull();
  });

  it("filas contiguas se unen; con almuerzo de por medio siguen siendo dos rangos", () => {
    expect(weekFromRows([r("a", 3, "09:00:00", "12:00:00"), r("b", 3, "12:00:00", "17:00:00")])[3].ranges).toEqual([{ id: "a", start: "09:00", end: "17:00" }]);
    const lunch = weekFromRows([r("a", 3, "09:00:00", "12:00:00"), r("b", 3, "13:00:00", "17:00:00"), r("c", 3, "09:00:00", "12:00:00")]);
    expect(lunch[3].ranges.map((x) => `${x.start}-${x.end}`)).toEqual(["09:00-12:00", "13:00-17:00"]);
  });
});
