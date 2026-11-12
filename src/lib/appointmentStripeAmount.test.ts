import { describe, expect, it } from "vitest";
import { appointmentStripeAmount } from "../../supabase/functions/_shared/appointmentStripeAmount";

const alex = { status: "scheduled", price_cents: 3000, amount_paid_cents: 2500, benefit_discount_cents: 0, payment_confirmed: true };

describe("additional appointment Stripe payments", () => {
  it("allows the outstanding $5 plus Alex's $7 tip despite earlier confirmation", () => {
    expect(appointmentStripeAmount(alex, 1200, 700)).toEqual({ balanceCents: 500, expectedCents: 1200 });
  });
  it("blocks another payment after the balance is settled", () => {
    expect(appointmentStripeAmount({ ...alex, amount_paid_cents: 3700 }, 1200, 700).error).toBe("already_paid");
  });
  it("does not charge the previously paid $25 again", () => {
    expect(appointmentStripeAmount(alex, 3700, 700).error).toBe("amount_mismatch");
  });
  it("keeps cancelled appointments blocked", () => {
    expect(appointmentStripeAmount({ ...alex, status: "cancelled" }, 1200, 700).error).toBe("appointment_cancelled");
  });
});