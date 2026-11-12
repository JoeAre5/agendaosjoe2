---
name: Launch Roadmap (MVP)
description: Definition of "launch" + checklist of remaining work. Source of truth for the % shown on ComingSoonPage. Bump LAUNCH_PROGRESS in src/components/site/ComingSoonPage.tsx as items move from [ ] to [x].
type: feature
---

# Launch = unlock the public site

The full public site and paywall booking flow are already built at
`/cb-build-2026/*`. "Launch" means flipping that into the real public routes
(`/`, `/citas`, `/contacto`, `/unete`, `/servicios/*`) and removing the
ComingSoonPage interceptor in `src/App.tsx`.

Everything below is what stands between today and that flip.

## Current progress: 73%

16 items shipped of ~22 launch-blocking items. Bump `LAUNCH_PROGRESS` in
`src/components/site/ComingSoonPage.tsx` whenever an item moves to [x].

## Already done (do not re-litigate)
- [x] Admin platform (calendar, sales, reports, payroll, inventory, paystubs)
- [x] Acuity 2-way sync
- [x] Push notifications + broadcasts
- [x] Client portal v2 + booking + reschedule
- [x] Public booking flow with Stripe + PayPal + ATH Móvil + 18% tip
- [x] Booking confirmation transactional email
- [x] Booking receipt transactional email
- [x] Headlines (blog) reader live at `/titulares`
- [x] Newsletter signup (GHL → clients table)
- [x] "Send headline to subscribers" broadcast email
- [x] Email infrastructure (notify.charliesbarbershop.co verified)
- [x] Auth (Admin, Barbers, Clients) with RLS isolation
- [x] Privacy policy + Terms pages
- [x] Public waitlist enrollment (`/lista-exclusiva`)
- [x] PWA / manifest / service worker
- [x] Global typography migration (Inter → Montserrat)

## Launch-blocking — must ship before flipping public site
- [ ] **End-to-end booking QA** — 3 real bookings on a real phone, one per payment method (Stripe, PayPal, ATH). Verify: appointment lands in Acuity, in admin, confirmation email received, deposit captured, tip recorded.
- [ ] **Mobile QA pass** — every public page on iPhone Safari at 430px. Hero, nav, footer, booking flow, headlines, contact, join team.
- [ ] **SEO sweep** — sitemap.xml current, robots.txt allows production, every public page has unique title + meta description + og:image.
- [ ] **Remove ComingSoonPage interceptor** in `src/App.tsx` (the 9 routes currently rendering `<ComingSoonPage />`). Wire `/`, `/citas/:barberSlug?`, `/contacto`, `/unete`, `/servicios/*` to their real components inside `<PublicLayout />`.
- [ ] **Delete `/cb-build-2026/*` mirror routes** once the real routes are live (avoid duplicate-content SEO penalty).
- [ ] **Production domain check** — confirm charliesbarbershop.co serves the published build, not the preview, and SSL is valid.

## Post-launch (deferred — does NOT block launch)
- GHL replacement Phase 1: native inbox for contact + careers forms
- GHL replacement Phase 2: email reply threads
- GHL replacement Phase 3: drip sequences + segments
- GHL replacement Phase 4: SMS via Twilio
- GHL replacement Phase 5: cancel GHL subscription
- Stripe 3DS / requires_action handling
- Real gateway fees from Stripe `balance_transaction.fee`
- Visible cancellation/refund policy on paywall
- "Expired by system" status flag for auto-cancelled appointments
- Apple Pay / Google Pay via Stripe PRB
- Resend payment link on abandonment
- Abandonment metrics dashboard

## Rules
- If a future request would add scope to "Launch-blocking", the agent MUST warn that it pushes the launch date and ask for confirmation.
- The `LAUNCH_PROGRESS` constant in ComingSoonPage is the single visible source of truth — keep it in sync with the [x] count above. Formula: `round((done / total) * 100)` where total = done + blocking items remaining.
