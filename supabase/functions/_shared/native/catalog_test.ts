// Request parsing shared by availability / native-scheduling / public-booking-create.
//   cd supabase/functions && deno test --node-modules-dir=none _shared/native/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseCatalogQuery } from "./catalog.ts";

Deno.test("parseCatalogQuery: native field names", () => {
  const q = parseCatalogQuery({
    serviceId: "svc",
    barberId: "b1",
    addonIds: ["a1", "a2"],
    month: "2026-10",
    date: "2026-10-01",
    startsAt: "2026-10-01T10:00:00-04:00",
    excludeAppointmentId: "x",
    appointmentId: "y",
  });
  assertEquals(q, {
    serviceId: "svc",
    barberId: "b1",
    addonIds: ["a1", "a2"],
    month: "2026-10",
    date: "2026-10-01",
    startsAt: "2026-10-01T10:00:00-04:00",
    excludeAppointmentId: "x",
    appointmentId: "y",
  });
});

Deno.test("parseCatalogQuery: Acuity-era aliases and empty values", () => {
  const q = parseCatalogQuery({
    appointmentTypeID: "svc",
    calendarID: "b1",
    addonIDs: [1, "a2", ""],
    datetime: "2026-10-01T10:00:00-04:00",
    month: "",
    date: 42,
  });
  assertEquals(q.serviceId, "svc");
  assertEquals(q.barberId, "b1");
  assertEquals(q.addonIds, ["1", "a2"]);
  assertEquals(q.startsAt, "2026-10-01T10:00:00-04:00");
  assertEquals(q.month, null);
  assertEquals(q.date, null);
  assertEquals(q.excludeAppointmentId, null);
  assertEquals(q.appointmentId, null);
});

Deno.test("parseCatalogQuery: explicit names win over aliases", () => {
  const q = parseCatalogQuery({ serviceId: "new", appointmentTypeID: "old", barberId: " b ", calendarID: "c" });
  assertEquals(q.serviceId, "new");
  assertEquals(q.barberId, "b");
});
