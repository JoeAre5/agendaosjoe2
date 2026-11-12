---
name: Recurring appointment consolidation
description: How recurring appointments avoid duplicates/shadow-blocks and how to clean up legacy ones
type: feature
---
**Recurring creation (current behavior)**
- `src/pages/NewAppointment.tsx` creates ONE appointment per occurrence directly in Acuity (with `noEmail: true`) and inserts one matching row in `appointments` per occurrence, sharing a `recurring_group_id`. No shadow `block_times` are created — the two-way Acuity sync handles visibility on both sides.

**Cleanup of legacy duplicates / shadow blocks**
- Edge function: `consolidate-recurring` (owner-only). Body: `{ dryRun: true|false, horizonDays?: number }` (default 365, max 730).
- **Duplicate match key:** `lowercase(trim(client_name)) + barber_id + exact starts_at`. Service is intentionally ignored.
- **Permanent DB guard after 2026-04-28:** `appointments_one_active_exact_slot` enforces one active appointment per `barber_id + starts_at + ends_at`. Sync/webhook must skip Acuity shadow records that collide with an existing active slot instead of reinserting them.
- **Hard rule after 2026-04-28:** if a non-recurring unpaid appointment has the same `barber_id + starts_at + ends_at` as a recurring appointment, delete the non-recurring row even when the client names differ or contain typos (e.g. José Villafañe vs Jose Villafeñe).
- **Keep rule:** prefer `is_recurring=true`, then earliest `created_at`, then lowest `acuity_id` (so positive Acuity ids beat negative local-only ids).
- **Shadow blocks:** any `block_times` row whose `(barber_id, starts_at, ends_at)` exactly matches a recurring appointment in the horizon is treated as a shadow and deleted (Acuity DELETE `/blocks/{id}` if `acuity_block_id` present, then local delete).
- **Acuity cancel:** PUT `/appointments/{id}/cancel?admin=true&noEmail=true`. Acuity 400 ("already cancelled") is treated as success.

**UI entry point**
- Settings page → "Consolidar recurrentes" button: runs dry-run first (shows preview counts + samples), then a confirm runs the real execution.
