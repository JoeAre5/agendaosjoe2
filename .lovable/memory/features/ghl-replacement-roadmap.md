---
name: Native Inbox & Marketing Roadmap
description: Native AgendaOS inbox, email, marketing automation, and SMS — replaces former GHL plan
type: feature
---

# Status
GHL is **fully removed**. All public forms (contact, careers, newsletter) submit to the native edge function `inbox-submit`, which writes to `contact_submissions`, `recruitment_submissions`, and `clients` (newsletter opt-in). Confirmation + owner-alert emails go via Resend (`send-transactional-email`). No external CRM forwarding.

# Forms → endpoint
- `ContactForm`, `NewsletterForm`, `RecruitmentForm` → `supabase.functions.invoke("inbox-submit", { body: { source: "contact"|"newsletter"|"recruitment", language, ...fields } })`
- Old `ghl-form-submit` and `ghl-newsletter-webhook` edge functions: deleted.
- Old `ghl_forwarded` columns: dropped.

# Phase 2 — Reply / Email threading (next)
- Reuse `send-transactional-email` (Resend) to reply from inbox.
- New table `inbox_replies` for thread history.
- Auto-reply templates per source (configurable in `notification_templates`).

# Phase 3 — Marketing automation
- Add `tags text[]` to `clients`.
- New table `marketing_segments` (filter rules JSON).
- New table `drip_sequences` + `drip_steps` (offset_days, template_id, channel).
- Scheduler reuses pattern from `flush-recurring-pushes` / `send-appointment-reminders`.
- Extend existing `broadcasts` to support email/SMS (currently push-only).

# Phase 4 — SMS
- Twilio integration (requires user Twilio account + secret).
- STOP/HELP compliance handlers.
- Respect `notify_sms_marketing` flag on `clients`.

# Constraints
- Never reintroduce GHL or any external form forwarder.
- All marketing sends must respect `notify_*_marketing` opt-in flags on `clients`.
