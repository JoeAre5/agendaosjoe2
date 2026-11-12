import { describe, expect, it } from "vitest";
import { mapNativeAppointment, sanitizeSearchTerm, translateAcuityRequest } from "./nativeProxy";
import { appointmentRef, calendarBarber } from "./index";

const SVC = "40000000-0000-4000-8000-000000000021";
const BARBER = "30000000-0000-4000-8000-000000000021";
const APPT = "70000000-0000-4000-8000-000000000001";

describe("translateAcuityRequest", () => {
  it("maps catalog reads", () => {
    expect(translateAcuityRequest("/calendars")).toEqual({ kind: "edge", call: { action: "list-calendars", payload: {} } });
    expect(translateAcuityRequest("/appointment-types")).toEqual({ kind: "edge", call: { action: "list-services", payload: {} } });
    expect(translateAcuityRequest("/appointment-addons")).toEqual({ kind: "edge", call: { action: "list-addons", payload: {} } });
    expect(translateAcuityRequest(`/appointment-types/${SVC}`)).toMatchObject({ kind: "edge", pickId: SVC });
  });

  it("maps availability queries with the Acuity parameter names", () => {
    const dates = translateAcuityRequest(`/availability/dates?appointmentTypeID=${SVC}&calendarID=${BARBER}&month=2026-10`);
    expect(dates).toMatchObject({ kind: "edge", call: { action: "list-dates", payload: { serviceId: SVC, barberId: BARBER, month: "2026-10" } } });
    const times = translateAcuityRequest(`/availability/times?appointmentTypeID=${SVC}&calendarID=${BARBER}&date=2026-10-01`);
    expect(times).toMatchObject({ kind: "edge", call: { action: "list-times", payload: { serviceId: SVC, barberId: BARBER, date: "2026-10-01" } } });
  });

  it("maps a create with native-only extras and drops the placeholder email", () => {
    const t = translateAcuityRequest("/appointments", "POST", {
      appointmentTypeID: SVC,
      calendarID: BARBER,
      datetime: "2026-10-01T10:00:00-04:00",
      firstName: "Ana",
      lastName: "Torres",
      email: "7875550000@placeholder.local",
      phone: "7875550000",
      notes: "hi",
      addonIDs: ["a1"],
      admin: true,
      respectAvailability: true,
      native: { clientId: "c1", bookingSource: "barber_manual", recurringGroupId: "g1" },
    });
    expect(t).toMatchObject({
      kind: "edge",
      call: {
        action: "create",
        payload: {
          serviceId: SVC,
          barberId: BARBER,
          startsAt: "2026-10-01T10:00:00-04:00",
          addonIds: ["a1"],
          client: { client_id: "c1", first_name: "Ana", last_name: "Torres", phone: "7875550000", email: null },
          notes: "hi",
          respectAvailability: true,
          bookingSource: "barber_manual",
          recurringGroupId: "g1",
        },
      },
    });
  });

  it("maps appointment reads and writes by local id", () => {
    expect(translateAcuityRequest(`/appointments/${APPT}`)).toEqual({ kind: "edge", call: { action: "get-appointment", payload: { appointmentId: APPT } } });
    expect(translateAcuityRequest(`/appointments/${APPT}/reschedule`, "PUT", { datetime: "2026-10-01T11:00:00-04:00", calendarID: BARBER, admin: true, noEmail: true }))
      .toMatchObject({ call: { action: "reschedule", payload: { appointmentId: APPT, startsAt: "2026-10-01T11:00:00-04:00", barberId: BARBER, noEmail: true } } });
    expect(translateAcuityRequest(`/appointments/${APPT}/cancel`, "PUT", { admin: true, cancelNote: "bye" }))
      .toMatchObject({ call: { action: "cancel", payload: { appointmentId: APPT, reason: "bye", noEmail: false } } });
    expect(translateAcuityRequest(`/appointments/${APPT}`, "PUT", { canceled: true }))
      .toMatchObject({ call: { action: "cancel", payload: { appointmentId: APPT } } });
    expect(translateAcuityRequest(`/appointments/${APPT}`, "PUT", { appointmentTypeID: SVC, addonIDs: [], notes: "n", firstName: "A", phone: "1" }))
      .toMatchObject({ call: { action: "update", payload: { appointmentId: APPT, serviceId: SVC, addonIds: [], notes: "n", client: { firstName: "A", phone: "1" } } } });
  });

  it("serves client search locally and refuses block paths", () => {
    expect(translateAcuityRequest("/clients?search=787")).toEqual({ kind: "clients-search", query: "787" });
    expect(translateAcuityRequest("/clients/12", "PUT", {})).toEqual({ kind: "clients-update" });
    expect(translateAcuityRequest("/blocks", "POST", {}).kind).toBe("unsupported");
    expect(translateAcuityRequest("/webhooks").kind).toBe("unsupported");
  });
});

describe("mapNativeAppointment", () => {
  it("shapes a row like an Acuity appointment", () => {
    const out = mapNativeAppointment({
      id: APPT,
      client_name: "Ana Torres Ruiz",
      client_email: "ana@x.test",
      client_phone: "7875550000",
      service_name: "Fade",
      service_ref_id: SVC,
      barber_id: BARBER,
      starts_at: "2026-10-01T14:00:00+00:00",
      ends_at: "2026-10-01T14:40:00+00:00",
      duration_minutes: 40,
      price_cents: 3000,
      addon_ref_ids: ["a1"],
      addons: ["Line-up"],
      status: "scheduled",
      notes: null,
      client_id: "c1",
      recurring_group_id: null,
    });
    expect(out).toMatchObject({
      id: APPT,
      localId: APPT,
      provider: "native",
      datetime: "2026-10-01T14:00:00+00:00",
      endTime: "2026-10-01T14:40:00+00:00",
      duration: 40,
      type: "Fade",
      appointmentTypeID: SVC,
      calendarID: BARBER,
      firstName: "Ana",
      lastName: "Torres Ruiz",
      email: "ana@x.test",
      phone: "7875550000",
      notes: "",
      price: "30.00",
      addons: [{ id: "a1", name: "Line-up" }],
      canceled: false,
    });
    expect(mapNativeAppointment(null)).toBeNull();
  });
});

describe("appointment refs and calendar → barber", () => {
  it("uses the Acuity id on Acuity shops and the uuid on native shops", () => {
    expect(appointmentRef({ id: APPT, acuity_id: 123 }, false)).toBe(123);
    expect(appointmentRef({ id: APPT, acuity_id: 123 }, true)).toBe(APPT);
    expect(appointmentRef({ id: APPT, acuity_id: null }, false)).toBe(APPT);
  });

  it("strips filter syntax from client search terms", () => {
    expect(sanitizeSearchTerm("Pérez, Ana")).toBe("Pérez Ana");
    expect(sanitizeSearchTerm("Ana (mamá)")).toBe("Ana mamá");
    expect(sanitizeSearchTerm('a.b"c\\d%e_f')).toBe("a b c d e f");
    expect(sanitizeSearchTerm("  787 555 0000 ")).toBe("787 555 0000");
  });

  it("finds the barber by barberId, uuid, Acuity calendar id, then first name", () => {
    const barbers = [
      { id: BARBER, name: "Alex Méndez", acuity_calendar_id: null },
      { id: "b2", name: "Luis Rivera", acuity_calendar_id: 555 },
    ];
    expect(calendarBarber({ id: BARBER, name: "Alex Méndez", barberId: BARBER }, barbers)?.id).toBe(BARBER);
    expect(calendarBarber({ id: BARBER }, barbers)?.id).toBe(BARBER);
    expect(calendarBarber({ id: 555, name: "LUIS" }, barbers)?.id).toBe("b2");
    expect(calendarBarber({ id: 999, name: "Luis R." }, barbers)?.id).toBe("b2");
    expect(calendarBarber({ id: 999, name: "Nobody" }, barbers)).toBeNull();
  });
});
