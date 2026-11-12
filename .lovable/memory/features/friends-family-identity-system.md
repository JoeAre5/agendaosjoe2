---
name: Friends & Family + Unified Client Identity
description: POST-LAUNCH ONLY. Scoped spec for F&F members, booking attribution, soft duplicate detection, and contact-match on edit. Do NOT scaffold tables, UI, or flows until explicitly greenlit after launch.
type: feature
---

# Friends & Family + Unified Client Identity (v1)

**Status: Post-Launch backlog. DO NOT BUILD YET.**
Do not modify booking flow, edit-appointment, client portal tabs, admin views, or create tables/columns for this until launch checklist is cleared and the user explicitly greenlights.

## Four connected surfaces (one shared engine)

### Surface 1 — F&F Member Management (Client Portal)
- Path: Profile → Friends & Family → Add Member
- Fields: first_name, last_name, relationship (son, daughter, partner, sibling, friend, pet), optional preferred_barber_id
- Members are NOT independent accounts — inherit holder's phone/email/session
- Clean detach path if member later creates own account

### Surface 2 — "Who Is This For?" Booking Step
- Public flow + client portal
- Inject step BEFORE confirmation only when logged-in client has ≥1 member
- Options: For Me / [Member Name…] / + Add New
- Save: `client_id` (holder) + `booked_for_member_id` (member, nullable)
- Skip step entirely when no members exist

### Surface 3 — Soft Duplicate Detection at Booking
- Public booking with phone/email matching existing client but different name
- Prompt: "Are you booking for a family member?" → convert to F&F member of existing profile instead of creating duplicate client

### Surface 4 — Contact Match on Appointment Edit
- On edit appointment submit, if phone/email changed, run match check
- If match found with different name, prompt: Link / Keep separate / Convert to F&F member
- Fires BEFORE Supabase update

## Shared engine
`findMatchingClient(phone, email)` — single utility, queries `clients` for phone OR email match, null-safe to prevent false positives. Used by Surfaces 3 & 4. Surface 2 writes via it on "+ Add New". Surface 1 is the management layer.

## Per-portal behavior
- **Client**: manage members, see "who is this for?", get duplicate prompt, see all (own + members') appointments under one account
- **Admin**: every appt shows client_id + booked_for_member_id, manual link/unlink/merge, dup flag on appt card, full audit trail
- **Barber**: calendar shows "Liam (son of Charlie)", history per member, all reminders/no-show contact route to holder

## Infra it will touch (when built)
- Auth: members inherit holder session, no new login
- DB: new `family_members` table + `appointments.booked_for_member_id` column
- Notifications: send to holder, body references member by name
- Booking flow: additive injection, not rebuild
- Edit appointment: additive match check pre-save
- Barber calendar: display logic only, reads `booked_for_member_id`

## Reference: Booksy comparison
Booksy = manual creation only, no auto-detect by email/phone. Our hybrid adds Surfaces 3 & 4 as soft prompts (not auto-merge) to catch duplicates Booksy misses.
