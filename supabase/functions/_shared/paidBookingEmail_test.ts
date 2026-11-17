// cd supabase/functions && deno test --no-check --node-modules-dir=auto _shared/paidBookingEmail_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { paidBookingEmailKey, sendPaidBookingConfirmation } from "./paidBookingEmail.ts";

const INPUT = {
  email: "cliente@example.com", firstName: "Ana", appointmentId: "appt-1", acuityId: null,
  startsAt: "2026-11-18T14:00:00.000Z", serviceName: "CERQUILLO", barberName: "Charlie", amountPaidCents: 2000,
};

function fakeAdmin(opts: { switchValue?: boolean | null; invokeError?: unknown } = {}) {
  const invoked: any[] = [];
  return {
    invoked,
    from(_t: string) {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() {
          return opts.switchValue === null ? { data: null, error: null } : { data: { app_booking_emails: opts.switchValue ?? true }, error: null };
        },
      };
    },
    functions: { async invoke(name: string, args: any) { invoked.push({ name, args }); return { error: opts.invokeError ?? null }; } },
  };
}

Deno.test("key is the same one pay-then-book uses", () => {
  assertEquals(paidBookingEmailKey(null, "appt-1"), "booking-paid-appt-1");
  assertEquals(paidBookingEmailKey(77, "appt-1"), "booking-paid-77");
});

Deno.test("sends the paid confirmation with the amount and the Puerto Rico date", async () => {
  const admin = fakeAdmin();
  assertEquals(await sendPaidBookingConfirmation(admin, INPUT), true);
  const sent = admin.invoked[0];
  assertEquals(sent.name, "send-transactional-email");
  assertEquals(sent.args.body.templateName, "booking-confirmation");
  assertEquals(sent.args.body.idempotencyKey, "booking-paid-appt-1");
  assertEquals(sent.args.body.templateData.totalLabel, "$20.00");
  assertEquals(sent.args.body.templateData.isPaid, true);
});

Deno.test("no email address: nothing is sent", async () => {
  const admin = fakeAdmin();
  assertEquals(await sendPaidBookingConfirmation(admin, { ...INPUT, email: "  " }), false);
  assertEquals(admin.invoked.length, 0);
});

Deno.test("switch off (the CRM sends it): nothing is sent", async () => {
  const admin = fakeAdmin({ switchValue: false });
  assertEquals(await sendPaidBookingConfirmation(admin, INPUT), false);
  assertEquals(admin.invoked.length, 0);
});

Deno.test("an email failure never throws into the booking", async () => {
  const admin = fakeAdmin({ invokeError: new Error("queue down") });
  assertEquals(await sendPaidBookingConfirmation(admin, INPUT), false);
});
