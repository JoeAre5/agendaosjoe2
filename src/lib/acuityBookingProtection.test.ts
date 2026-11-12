import { describe, expect, it } from "vitest";
import { prepareAcuityRequest, uncoveredAcuityIntervals } from "../../supabase/pending/acuityBookingProtection";

const interval = (start: string, end: string, calendarId = 1872907) => ({
  calendarId,
  startsAt: `2026-11-10T${start}:00-04:00`,
  endsAt: `2026-11-10T${end}:00-04:00`,
});

describe("staged Acuity protection policy", () => {
  it.each(["owner", "barber"] as const)("retains intentional %s Acuity override", role => {
    expect(prepareAcuityRequest(role, "/appointments?admin=false", "POST").path).toBe("/appointments?admin=true");
  });
  it("clients cannot inject admin overrides through duplicate query parameters or body", () => {
    const original = { admin: true, Admin: true, respectAvailability: false, appointmentTypeID: 123, addonIDs: [4, 5] };
    const result = prepareAcuityRequest("client", "/appointments?admin=true&admin=1&ADMIN=true", "POST", original);
    expect(result.path).toBe("/appointments");
    expect(result.body).toEqual({ appointmentTypeID: 123, addonIDs: [4, 5] });
    expect(original.admin).toBe(true);
  });
  it("client rescheduling cannot bypass remote availability", () => {
    expect(prepareAcuityRequest("client", "/appointments/123/reschedule?admin=true", "PUT", { admin: true, datetime: "2026-11-10T10:00:00-04:00" }))
      .toEqual({ path: "/appointments/123/reschedule", method: "PUT", body: { datetime: "2026-11-10T10:00:00-04:00" } });
  });
  it("availability reads do not acquire admin override", () => {
    expect(prepareAcuityRequest("owner", "/availability/times?calendarID=1872907&admin=true", "GET").path)
      .toBe("/availability/times?calendarID=1872907");
  });
  it("staff block access retains the required Acuity admin mode", () => {
    expect(prepareAcuityRequest("barber", "/blocks/123", "DELETE").path).toBe("/blocks/123?admin=true");
  });
  it.each(["https://other.example/appointments", "//other.example/appointments", "/appointments#fragment", "/appointments\\evil"])("rejects unsafe path %s", path => {
    expect(() => prepareAcuityRequest("client", path, "POST")).toThrow("Invalid Acuity path");
  });
});

describe("staged direct-hosted occupancy comparison", () => {
  it("does not add a duplicate block to an already occupied one-hour interval", () => {
    expect(uncoveredAcuityIntervals(interval("10:00", "11:00"), interval("10:00", "11:00"))).toEqual([]);
  });
  it("protects only uncovered extra time without changing services or price", () => {
    expect(uncoveredAcuityIntervals(interval("10:00", "11:00"), interval("10:00", "10:30")))
      .toEqual([interval("10:30", "11:00")]);
  });
  it("protects the entire interval when the appointment is local only", () => {
    expect(uncoveredAcuityIntervals(interval("10:00", "11:00"), null)).toEqual([interval("10:00", "11:00")]);
  });
  it("does not count another barber calendar as coverage", () => {
    expect(uncoveredAcuityIntervals(interval("10:00", "11:00"), interval("10:00", "11:00", 2006582)))
      .toEqual([interval("10:00", "11:00")]);
  });
  it("adjacent intervals do not cover this appointment", () => {
    expect(uncoveredAcuityIntervals(interval("10:00", "11:00"), interval("09:00", "10:00")))
      .toEqual([interval("10:00", "11:00")]);
  });
  it("covers both exposed edges when the remote interval is smaller", () => {
    expect(uncoveredAcuityIntervals(interval("10:00", "11:00"), interval("10:15", "10:45")))
      .toEqual([interval("10:00", "10:15"), interval("10:45", "11:00")]);
  });
  it("fails closed on unknown or invalid duration", () => {
    expect(() => uncoveredAcuityIntervals(interval("10:00", "10:00"), null)).toThrow("Invalid occupied interval");
  });
});