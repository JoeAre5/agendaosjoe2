// Native scheduling engine — unit tests.
//   cd supabase/functions && deno test _shared/availability/
//
// Fixture: Tuesday 2026-09-08 in America/Puerto_Rico (UTC-4, no DST).
// Barber "b1" works Tue–Sat 09:00–17:00; a 30-minute service on a 15-minute
// grid gives 31 candidate starts (09:00 … 16:30).
import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkSlot, computeAvailability, DEFAULT_RULES, localDateOf } from "./engine.ts";
import type { AvailabilityInput, BarberInput, WeeklyInterval } from "./types.ts";

const TZ = "America/Puerto_Rico";
const TUE = "2026-09-08";

function hours(days: number[], start = "09:00", end = "17:00"): WeeklyInterval[] {
  return days.map((dayOfWeek) => ({ dayOfWeek, start, end, isActive: true }));
}

function barber(overrides: Partial<BarberInput> = {}): BarberInput {
  return { id: "b1", workingHours: hours([2, 3, 4, 5, 6]), appointments: [], blocks: [], holds: [], ...overrides };
}

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    timezone: TZ,
    now: "2026-09-07T08:00:00-04:00", // Monday morning
    from: TUE,
    to: TUE,
    service: { durationMinutes: 30 },
    rules: { ...DEFAULT_RULES },
    shopHours: hours([2, 3, 4, 5, 6]),
    barbers: [barber()],
    ...overrides,
  };
}

const starts = (r: ReturnType<typeof computeAvailability>, date = TUE) =>
  (r.days.find((d) => d.date === date)?.slots ?? []).map((s) => s.startsAt.slice(11, 16));

Deno.test("basic day: 31 slots from 09:00 to 16:30 with shop offset", () => {
  const r = computeAvailability(input());
  assertEquals(r.timezone, TZ);
  assertEquals(r.durationMinutes, 30);
  assertEquals(r.days.length, 1);
  const s = starts(r);
  assertEquals(s.length, 31);
  assertEquals(s[0], "09:00");
  assertEquals(s[s.length - 1], "16:30");
  assertEquals(r.days[0].slots[0].startsAt, "2026-09-08T09:00:00-04:00");
  assertEquals(r.days[0].slots[0].endsAt, "2026-09-08T09:30:00-04:00");
  assertEquals(r.days[0].slots[0].barberId, "b1");
});

Deno.test("shop hours narrow the barber's working hours", () => {
  const r = computeAvailability(input({ shopHours: hours([2], "10:00", "16:00") }));
  const s = starts(r);
  assertEquals(s[0], "10:00");
  assertEquals(s[s.length - 1], "15:30");
  assertEquals(s.length, 23);
});

Deno.test("no shop hours configured: working hours apply alone", () => {
  assertEquals(starts(computeAvailability(input({ shopHours: [] }))).length, 31);
});

Deno.test("shop hours configured but silent for the day: closed", () => {
  assertEquals(computeAvailability(input({ shopHours: hours([3]) })).days, []);
});

Deno.test("add-ons extend the duration", () => {
  const r = computeAvailability(input({ addons: [{ durationMinutes: 15 }, { durationMinutes: 15 }] }));
  assertEquals(r.durationMinutes, 60);
  assertEquals(starts(r)[starts(r).length - 1], "16:00");
});

Deno.test("an active appointment removes every overlapping candidate (half-open)", () => {
  const r = computeAvailability(input({
    barbers: [barber({ appointments: [{ start: "2026-09-08T10:00:00-04:00", end: "2026-09-08T10:30:00-04:00" }] })],
  }));
  const s = starts(r);
  assert(s.includes("09:30"), "09:30-10:00 touches but does not overlap");
  assert(!s.includes("09:45"));
  assert(!s.includes("10:00"));
  assert(!s.includes("10:15"));
  assert(s.includes("10:30"));
  assertEquals(s.length, 28);
});

Deno.test("padding after the service keeps a gap before the next booking", () => {
  const r = computeAvailability(input({
    rules: { ...DEFAULT_RULES, paddingAfterMinutes: 15 },
    barbers: [barber({ appointments: [{ start: "2026-09-08T10:00:00-04:00", end: "2026-09-08T10:30:00-04:00" }] })],
  }));
  const s = starts(r);
  assert(s.includes("09:15"), "09:15 + 30 + 15 ends exactly at 10:00");
  assert(!s.includes("09:30"));
  assert(s.includes("16:30"), "padding may run past closing time");
  assertEquals(s.length, 27);
});

Deno.test("service padding and rule padding: the larger one wins", () => {
  const r = computeAvailability(input({
    service: { durationMinutes: 30, paddingBeforeMinutes: 30 },
    rules: { ...DEFAULT_RULES, paddingBeforeMinutes: 10 },
    barbers: [barber({ appointments: [{ start: "2026-09-08T10:00:00-04:00", end: "2026-09-08T10:30:00-04:00" }] })],
  }));
  const s = starts(r);
  assert(!s.includes("10:30"), "needs 30 free minutes before");
  assert(!s.includes("10:45"));
  assert(s.includes("11:00"));
});

Deno.test("blocks: all-day closes the day, timed removes its window", () => {
  const allDay = computeAvailability(input({
    barbers: [barber({ blocks: [{ start: "2026-09-08T00:00:00-04:00", end: "2026-09-08T23:59:00-04:00", isAllDay: true }] })],
  }));
  assertEquals(allDay.days, []);

  const timed = computeAvailability(input({
    barbers: [barber({ blocks: [{ start: "2026-09-08T12:00:00-04:00", end: "2026-09-08T13:00:00-04:00" }] })],
  }));
  const s = starts(timed);
  for (const t of ["11:45", "12:00", "12:15", "12:30", "12:45"]) assert(!s.includes(t), t);
  assert(s.includes("11:30"));
  assert(s.includes("13:00"));
  assertEquals(s.length, 26);
});

Deno.test("a multi-day block spanning midnight is clipped per day", () => {
  const r = computeAvailability(input({
    to: "2026-09-09",
    barbers: [barber({ blocks: [{ start: "2026-09-08T15:00:00-04:00", end: "2026-09-09T11:00:00-04:00" }] })],
  }));
  assertEquals(starts(r, TUE)[starts(r, TUE).length - 1], "14:30");
  assertEquals(starts(r, "2026-09-09")[0], "11:00");
});

Deno.test("slot holds (pending native drafts) are busy time", () => {
  const r = computeAvailability(input({
    barbers: [barber({ holds: [{ start: "2026-09-08T11:00:00-04:00", end: "2026-09-08T11:30:00-04:00" }] })],
  }));
  const s = starts(r);
  for (const t of ["10:45", "11:00", "11:15"]) assert(!s.includes(t), t);
  assertEquals(s.length, 28);
});

Deno.test("minimum advance: same-day slots start after now + minAdvance", () => {
  const r = computeAvailability(input({ now: "2026-09-08T09:30:00-04:00" }));
  const s = starts(r);
  assertEquals(s[0], "10:30");
  assertEquals(s.length, 25);
});

Deno.test("past days and days beyond maxAdvanceDays are omitted", () => {
  const past = computeAvailability(input({ now: "2026-09-09T08:00:00-04:00" }));
  assertEquals(past.days, []);

  const rules = { ...DEFAULT_RULES, maxAdvanceDays: 7 };
  const tooFar = computeAvailability(input({ rules, from: "2026-09-15", to: "2026-09-15" })); // Tue, 8 days out
  assertEquals(tooFar.days, []);
  const edge = computeAvailability(input({ rules, from: "2026-09-12", to: "2026-09-12" })); // Sat, 5 days out
  assertEquals(edge.days.length, 1);
});

Deno.test("maxPerDay: a full barber offers nothing that day", () => {
  const r = computeAvailability(input({
    rules: { ...DEFAULT_RULES, maxPerDay: 1 },
    barbers: [barber({ appointments: [{ start: "2026-09-08T10:00:00-04:00", end: "2026-09-08T10:30:00-04:00" }] })],
  }));
  assertEquals(r.days, []);
});

Deno.test("split shifts produce two windows", () => {
  const wh = [...hours([2], "09:00", "12:00"), ...hours([2], "14:00", "17:00")];
  const s = starts(computeAvailability(input({ barbers: [barber({ workingHours: wh })] })));
  assertEquals(s.length, 22);
  assert(s.includes("11:30"));
  assert(!s.includes("11:45"));
  assert(!s.includes("13:45"));
  assert(s.includes("14:00"));
});

Deno.test("inactive working-hours rows are ignored", () => {
  const wh = hours([2]).map((h) => ({ ...h, isActive: false }));
  assertEquals(computeAvailability(input({ barbers: [barber({ workingHours: wh })] })).days, []);
});

Deno.test("several barbers: each day lists every barber with a window", () => {
  const b2 = barber({ id: "b2", workingHours: hours([1, 2], "13:00", "15:00") });
  const r = computeAvailability(input({ from: "2026-09-07", to: TUE, shopHours: [], barbers: [barber(), b2] }));
  const mon = r.days.find((d) => d.date === "2026-09-07")!;
  assert(mon.slots.every((s) => s.barberId === "b2"));
  const tue = r.days.find((d) => d.date === TUE)!;
  assertEquals(new Set(tue.slots.map((s) => s.barberId)), new Set(["b1", "b2"]));
  assertEquals(tue.slots.filter((s) => s.barberId === "b2").length, 7);
});

Deno.test("DST: wall-clock hours keep their offset across the change (America/New_York)", () => {
  const r = computeAvailability(input({
    timezone: "America/New_York",
    now: "2026-03-01T08:00:00-05:00",
    from: "2026-03-07",
    to: "2026-03-08", // DST starts 2026-03-08 02:00
    shopHours: [],
    barbers: [barber({ workingHours: hours([0, 6], "09:00", "12:00") })],
  }));
  const sat = r.days.find((d) => d.date === "2026-03-07")!;
  const sun = r.days.find((d) => d.date === "2026-03-08")!;
  assertEquals(sat.slots[0].startsAt, "2026-03-07T09:00:00-05:00");
  assertEquals(sun.slots[0].startsAt, "2026-03-08T09:00:00-04:00");
  assertEquals(sat.slots.length, sun.slots.length);
});

Deno.test("firstSlotOnly: one slot per day is enough for a date listing", () => {
  const r = computeAvailability(input({ from: TUE, to: "2026-09-10" }), { firstSlotOnly: true });
  assertEquals(r.days.map((d) => d.date), [TUE, "2026-09-09", "2026-09-10"]);
  assert(r.days.every((d) => d.slots.length === 1));
  assertEquals(r.days[0].slots[0].startsAt, "2026-09-08T09:00:00-04:00");
  // A fully booked day still disappears.
  const busy = computeAvailability(input({
    rules: { ...DEFAULT_RULES, maxPerDay: 1 },
    barbers: [barber({ appointments: [{ start: "2026-09-08T10:00:00-04:00", end: "2026-09-08T10:30:00-04:00" }] })],
  }), { firstSlotOnly: true });
  assertEquals(busy.days, []);
});

Deno.test("checkSlot: reasons in priority order, off-grid times allowed", () => {
  const base = input({
    barbers: [barber({
      appointments: [{ start: "2026-09-08T10:00:00-04:00", end: "2026-09-08T10:30:00-04:00" }],
      blocks: [{ start: "2026-09-08T12:00:00-04:00", end: "2026-09-08T13:00:00-04:00" }],
    })],
  });
  assertEquals(checkSlot(base, "nope", "2026-09-08T09:00:00-04:00"), { ok: false, reason: "barber_unknown" });
  assertEquals(checkSlot(base, "b1", "garbage"), { ok: false, reason: "invalid_time" });
  assertEquals(checkSlot(base, "b1", "2026-09-07T10:00:00-04:00"), { ok: false, reason: "outside_hours" }); // Monday
  assertEquals(checkSlot(base, "b1", "2026-09-08T08:00:00-04:00"), { ok: false, reason: "outside_hours" });
  assertEquals(checkSlot(base, "b1", "2026-09-08T16:45:00-04:00"), { ok: false, reason: "outside_hours" });
  assertEquals(checkSlot(base, "b1", "2026-09-08T12:15:00-04:00"), { ok: false, reason: "blocked" });
  assertEquals(checkSlot(base, "b1", "2026-09-08T10:15:00-04:00"), { ok: false, reason: "overlap" });
  assertEquals(checkSlot(base, "b1", "2026-12-08T10:00:00-04:00"), { ok: false, reason: "too_far" });
  assertEquals(checkSlot({ ...base, now: "2026-09-08T09:00:00-04:00" }, "b1", "2026-09-08T09:30:00-04:00"), {
    ok: false,
    reason: "too_soon",
  });
  assertEquals(checkSlot(base, "b1", "2026-09-08T09:05:00-04:00"), {
    ok: true,
    startsAt: "2026-09-08T09:05:00-04:00",
    endsAt: "2026-09-08T09:35:00-04:00",
  });
  // UTC input is accepted and reported in the shop offset.
  assertEquals(checkSlot(base, "b1", "2026-09-08T13:05:00Z"), {
    ok: true,
    startsAt: "2026-09-08T09:05:00-04:00",
    endsAt: "2026-09-08T09:35:00-04:00",
  });
});

Deno.test("checkSlot: staff may skip advance rules and hours, never overlaps", () => {
  const base = input({
    now: "2026-09-08T09:00:00-04:00",
    barbers: [barber({ appointments: [{ start: "2026-09-08T10:00:00-04:00", end: "2026-09-08T10:30:00-04:00" }] })],
  });
  const opts = { ignoreAdvanceRules: true, ignoreHours: true };
  assertEquals(checkSlot(base, "b1", "2026-09-08T09:10:00-04:00", opts).ok, true);
  assertEquals(checkSlot(base, "b1", "2026-09-08T18:00:00-04:00", opts).ok, true);
  assertEquals(checkSlot(base, "b1", "2026-09-08T10:10:00-04:00", opts), { ok: false, reason: "overlap" });
});

Deno.test("input validation", () => {
  assertThrows(() => computeAvailability(input({ timezone: "Mars/Olympus" })), Error, "timezone");
  assertThrows(() => computeAvailability(input({ from: "2026-09-10", to: "2026-09-09" })), Error, "before");
  assertThrows(() => computeAvailability(input({ from: "2026-09-01", to: "2026-12-01" })), Error, "62 days");
  assertThrows(() => computeAvailability(input({ service: { durationMinutes: 0 } })), Error, "duration");
  assertThrows(() => computeAvailability(input({ from: "09/08/2026" })), Error, "date");
});

Deno.test("localDateOf converts an instant to the shop's calendar day", () => {
  assertEquals(localDateOf("2026-09-09T02:30:00Z", TZ), "2026-09-08");
  assertEquals(localDateOf("2026-09-08T22:30:00-04:00", TZ), "2026-09-08");
  assertEquals(localDateOf("nope", TZ), null);
});

// ─── Pedidos del cliente: almuerzo, intervalos de 30 min y excepciones por fecha ─────────────────

const lunchHours = (days: number[]): WeeklyInterval[] => [
  ...hours(days, "09:00", "12:00"),
  ...hours(days, "13:00", "17:00"),
];

Deno.test("almuerzo: 9-12 y 13-17 cierra la hora de almuerzo", () => {
  const r = computeAvailability(input({ barbers: [barber({ workingHours: lunchHours([2, 3, 4, 5, 6]) })] }));
  const s = starts(r);
  assert(s.includes("09:00") && s.includes("11:30"), "mañana");
  assert(!s.includes("12:00") && !s.includes("12:30") && !s.includes("11:45"), "almuerzo cerrado");
  assert(s.includes("13:00") && s.includes("16:30"), "tarde");
});

Deno.test("intervalo de 30 minutos: la rejilla avanza de 30 en 30 en cada tramo", () => {
  const r = computeAvailability(input({
    rules: { ...DEFAULT_RULES, slotIntervalMinutes: 30 },
    shopHours: lunchHours([2, 3, 4, 5, 6]),
    barbers: [barber({ workingHours: lunchHours([2, 3, 4, 5, 6]) })],
  }));
  assertEquals(starts(r), [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  ]);
});

Deno.test("excepcion: cerrar un dia concreto lo quita de la disponibilidad", () => {
  const r = computeAvailability(input({ exceptions: [{ barberId: "b1", date: TUE, closed: true }] }));
  assertEquals(starts(r), []);
  assertEquals(r.days.length, 0);
});

Deno.test("excepcion para todos los barberos (barberId null) cierra a todos", () => {
  const r = computeAvailability(input({
    barbers: [barber(), barber({ id: "b2" })],
    exceptions: [{ barberId: null, date: TUE, closed: true }],
  }));
  assertEquals(r.days.length, 0);
});

Deno.test("excepcion: horario especial reemplaza el horario normal de ese dia", () => {
  const r = computeAvailability(input({
    rules: { ...DEFAULT_RULES, slotIntervalMinutes: 30 },
    exceptions: [{ barberId: "b1", date: TUE, closed: false, start: "10:00", end: "14:00" }],
  }));
  assertEquals(starts(r), ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30"]);
});

Deno.test("excepcion puede abrir un dia que normalmente esta cerrado", () => {
  // Lunes 2026-09-14: el barbero y el negocio no trabajan los lunes.
  const MON = "2026-09-14";
  const base = input({ from: MON, to: MON });
  assertEquals(computeAvailability(base).days.length, 0);
  const r = computeAvailability({ ...base, exceptions: [{ barberId: "b1", date: MON, closed: false, start: "09:00", end: "11:00" }] });
  assertEquals(starts(r, MON), ["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30"]);
});

Deno.test("excepcion de un barbero gana a la de todos; el otro barbero sigue la general", () => {
  const r = computeAvailability(input({
    rules: { ...DEFAULT_RULES, slotIntervalMinutes: 30 },
    barbers: [barber(), barber({ id: "b2" })],
    exceptions: [
      { barberId: null, date: TUE, closed: true },
      { barberId: "b1", date: TUE, closed: false, start: "09:00", end: "10:00" },
    ],
  }));
  const day = r.days.find((d) => d.date === TUE);
  assertEquals((day?.slots ?? []).map((s) => `${s.barberId}@${s.startsAt.slice(11, 16)}`), ["b1@09:00", "b1@09:30"]);
});

Deno.test("excepcion con horario partido: varias filas el mismo dia", () => {
  const r = computeAvailability(input({
    rules: { ...DEFAULT_RULES, slotIntervalMinutes: 30 },
    exceptions: [
      { barberId: "b1", date: TUE, closed: false, start: "09:00", end: "10:00" },
      { barberId: "b1", date: TUE, closed: false, start: "15:00", end: "16:00" },
    ],
  }));
  assertEquals(starts(r), ["09:00", "09:30", "15:00", "15:30"]);
});

Deno.test("excepcion solo afecta a su fecha", () => {
  const WED = "2026-09-09";
  const r = computeAvailability(input({ from: TUE, to: WED, exceptions: [{ barberId: "b1", date: TUE, closed: true }] }));
  assertEquals(starts(r).length, 0);
  assert(starts(r, WED).length > 0);
});

Deno.test("checkSlot rechaza un horario en un dia cerrado por excepcion", () => {
  const res = checkSlot(input({ exceptions: [{ barberId: "b1", date: TUE, closed: true }] }), "b1", "2026-09-08T10:00:00-04:00");
  assertEquals(res.ok, false);
});
