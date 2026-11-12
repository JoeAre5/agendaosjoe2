import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { appBookingEmailsEnabled } from "./appEmailSwitch.ts";

const fake = (result: unknown) => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(result) }) }) }),
});

Deno.test("encendido por defecto y ante fila ausente o error", async () => {
  assertEquals(await appBookingEmailsEnabled(fake({ data: { app_booking_emails: true }, error: null })), true);
  assertEquals(await appBookingEmailsEnabled(fake({ data: null, error: null })), true);
  assertEquals(await appBookingEmailsEnabled(fake({ data: null, error: { message: "x" } })), true);
  assertEquals(await appBookingEmailsEnabled({ from: () => { throw new Error("boom"); } }), true);
});

Deno.test("solo un false explicito lo apaga", async () => {
  assertEquals(await appBookingEmailsEnabled(fake({ data: { app_booking_emails: false }, error: null })), false);
});
