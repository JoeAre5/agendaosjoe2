---
name: Client booking app-priority over Acuity webhook
description: Client app booking flow always owns payment + client_id; Acuity webhook preserves app-set fields on overwrite
type: feature
---
When a client books via the app (ClientNewAppointment), the appointment is created in Acuity then upserted into our DB with `created_by_role='client_app'` and `client_id` linked. The Acuity webhook fires ~1s later and used to overwrite our row, clearing app-set fields and skipping payment.

**Two-way sync rules now in place:**

1. **Webhook preserves app-owned fields** (`supabase/functions/acuity-webhook/index.ts`):
   - When a row already exists with `created_by_role` set, the webhook keeps `created_by_role`, `created_by_user_id`, `client_id`.
   - If `paid=true` OR `amount_paid_cents>0`, the webhook also preserves `paid`, `payment_method`, `amount_paid_cents`, `tip_cents` (never reverts a paid record).

2. **Client app recovers race-conditioned upserts** (`src/pages/ClientNewAppointment.tsx` `handleSubmit`):
   - If the post-Acuity upsert returns no id (because the webhook beat us), the app looks up the row by `acuity_id` and re-stamps `client_id` + `created_by_role` so the webhook honors them on subsequent updates.
   - Never silently shows success without payment — throws a user-visible error if it can't get an appointment id.

3. **Payment flow**: silent auto-charge runs first if `stripe_customer_id + card_last4 + priceCents>0`. Otherwise renders `<PaymentStep />` (same component as public booking).
