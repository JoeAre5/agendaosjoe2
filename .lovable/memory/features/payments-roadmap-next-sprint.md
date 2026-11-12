---
name: Payments Roadmap (Next Sprint)
description: Pending payment-flow improvements deferred to next sprint — 3DS handling, legal copy, real gateway fees, expired-status flag, Apple/Google Pay, payment-link resend, abandonment metrics.
type: feature
---
**DONE (Apr 2026):**
- ✅ **Full deposit upfront with suggested 18% tip**: PaymentStep now defaults `tipPercent` to 18 and shows TipSelector for ALL methods (Stripe/PayPal/ATH). TIP_PERCENTS = [18, 20, 25]. Total charged = service price (incl. addons, from Acuity) + suggested tip (editable). Applied to both `ClientNewAppointment` (authenticated app) and `PublicBookingFlow` (public site). ATH Móvil receives the combined total via SDK.

**Importantes (next sprint):**
5. **3DS / requires_action handling on saved card (one-tap)** — Stripe off_session can return `requires_action`; current flow fails silently. Detect → fall back to on_session confirmation in client (`stripe.confirmCardPayment`).
6. **Visible cancellation/refund policy** — legal copy on paywall (Stripe/PayPal compliance requirement).
7. **Capture real gateway fees** — `transactions.gateway_fee_cents` is hardcoded to 0; populate from Stripe `balance_transaction.fee` (via webhook or post-charge fetch) so Cuadre/Profit are accurate.
8. **"Expired" status visible in admin** — appointments auto-cancelled by payment timeout currently use `status='cancelled'`, indistinguishable from manual cancels. Add `cancelled_by_role='system_expired'` or new status value.

**Nice-to-have:**
9. Apple Pay / Google Pay via Stripe Payment Request Button (one-tap on iOS/Android).
10. Resend payment link if client abandons and returns.
11. Metrics: abandonment rate by payment method (Stripe vs ATH vs PayPal).
