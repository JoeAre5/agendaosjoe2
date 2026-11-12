// A confirmed earlier payment is not terminal when staff added a new charge.
export function appointmentStripeAmount(
  appt: { status: string; price_cents: number | null; amount_paid_cents: number | null; benefit_discount_cents: number | null },
  amountCents: number,
  tipCents: number,
) {
  const balanceCents = Math.max(0, Number(appt.price_cents || 0) - Number(appt.amount_paid_cents || 0));
  if (appt.status === "cancelled") return { error: "appointment_cancelled", balanceCents };
  if (balanceCents <= 0) return { error: "already_paid", balanceCents };
  if (!Number.isInteger(tipCents) || tipCents < 0 || tipCents > Math.max(balanceCents, 10000)) {
    return { error: "invalid_tip", balanceCents };
  }
  const minServiceCents = Math.max(0, balanceCents - Math.max(0, Number(appt.benefit_discount_cents || 0)));
  const serviceCents = amountCents - tipCents;
  if (!Number.isInteger(amountCents) || serviceCents < minServiceCents || serviceCents > balanceCents || serviceCents <= 0) {
    return { error: "amount_mismatch", balanceCents };
  }
  return { balanceCents, expectedCents: serviceCents + tipCents };
}