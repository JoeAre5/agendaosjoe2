---
name: Invite barber flow
description: Adding a barber email in Settings auto-provisions auth user, profile link, and barber role via invite-barber edge function
type: feature
---

When an owner adds or edits a barber in `src/pages/Settings.tsx` and provides an `email`, saving calls the `invite-barber` edge function (`supabase/functions/invite-barber/index.ts`).

The function (service-role) does, in order:
1. Verifies caller is an `owner` (via `user_roles`).
2. Looks up the auth user by email; if missing, creates one with `email_confirm: true` and a random password.
3. Upserts a `profiles` row linking `id = auth user id` to `barber_id`.
4. Writes the email back onto the `barbers` row.
5. Removes any non-`barber` role for that user, then upserts `user_roles { role: 'barber' }`.
6. For newly created auth users, sends `resetPasswordForEmail` so the barber sets their own password.

UI: the email input lives in the barber card under the name field with a hint that an account+invite email will be created on save. Helps avoid manual onboarding.

Edge function deploys automatically; no `verify_jwt` override needed (default is fine — it validates the bearer token in code via `auth.getClaims`).
