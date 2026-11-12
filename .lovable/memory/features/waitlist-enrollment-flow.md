---
name: Waitlist Enrollment Flow
description: Public /lista-exclusiva PWA-gated signup flow with chat-style install instructions, push activation, and BIENVENIDO20 launch code
type: feature
---

# Public Launch Waitlist (`/lista-exclusiva`)

Page: `src/pages/site/Waitlist.tsx` (single self-contained file).
Linked from `ComingSoonPage` secondary CTA.

## Screens
1. Splash — 3 benefit cards
2. Install chat — only shown when `isStandalone()` is false. iOS + Android branches detected via `isIOS()`. Final dead-end button re-checks standalone (advance) or shows toast (hint).
3. Signup — Nombre + Email + Tel + Password, calls `supabase.auth.signUp` directly + creates `clients` row with `booking_source='waitlist'`.
4. Push activation — uses `enablePush()` from `src/lib/push.ts`. iOS denial routes to full-screen iOS retry (5 numbered Settings steps).
5. Confirmation — AnimatedCheckmark + zero-padded member # + BIENVENIDO20 reward card.

## Database
- Table `waitlist_members` (client_id unique, member_number unique + auto-assigned via trigger `assign_waitlist_member_number`).
- Code stored per-row (default `'BIENVENIDO20'`) for future personalization.
- 3-attempt insert retry on member_number collision; logs to `audit_log` with action `waitlist_member_number_collision` after 3 failures.

## Design tokens (locked from this brief, no DESIGN.md exists)
- Buttons: 12px radius
- Cards: 14px radius
- Chat bubbles: 16px radius
- Accent: #ceb79e on #080808

## Manifest
- `name`: "Charlie's Barbershop" (unchanged)
- `short_name`: "Barbería" (renamed for home-screen label)
- `apple-touch-icon`: `/app-icon.png` (full color, NOT favicon)

## Returning users
Detected via auth session → clients lookup → existing `waitlist_members` row → jump straight to confirm screen.

## Out of scope
BIENVENIDO20 enforcement (Acuity-managed), launch-day push blast, ComingSoonPage interception removal.
