---
name: Acuity two-way sync
description: How Acuity ↔ App stays in sync — webhook subscriptions, sync window, and push direction
type: feature
---
**Sync direction: full two-way**

**Acuity → App (incoming)**
- Webhooks registered in Acuity (IDs 919229–919232) point to `acuity-webhook` for events: `appointment.scheduled`, `appointment.rescheduled`, `appointment.canceled`, `appointment.changed`.
- The `acuity-webhook` function parses both `application/x-www-form-urlencoded` (Acuity's real format) and JSON. Every event is logged to `acuity_webhook_log`.
- A duplicate guard skips writes when the local row has `payment_confirmed = true` (native record leads), except for status-change events which still update status.
- Manage subscriptions via `acuity-webhook-setup` edge function (owner-only). Actions: `list`, `register`, `delete`.

**App → Acuity (outgoing)**
- Already wired: `src/pages/AppointmentDetail.tsx` and `src/pages/NewAppointment.tsx` call `acuityProxy()` for create / reschedule / cancel / edit / notes / blocks (including bulk recurring with `noEmail: true`).
- No separate `acuity-push` function needed.

**Sync window**
- `useCalendarData.ts` syncs ±60 days from today on mount and on manual refresh, then displays only the current week. This catches reschedules that move appointments outside the visible week.

**Loop prevention infrastructure**
- `appointments.last_pushed_at` and `block_times.last_pushed_at` columns exist (timestamptz, indexed). When/if echo loops appear, set them in `acuityProxy()` callsites and have the webhook ignore events arriving within ~5s.
