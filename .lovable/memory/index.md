# Memory: index.md
Updated: just now

# Project Memory

## Core
AgendaOS: Barbershop app (Camuy, PR). Owner: Charlie Corchado. Watermark: Renova360™.
PR Timezone only (AST, UTC-4). Always append '-04:00' to DB timestamps.
Spanish-first (es-PR) app/site, English toggle.
Mobile-first (430px max), Dark mode default (#000000 bg).
Lean minimalism: standard motion/react, no unused packages.
No password reset for staff/barbers; clients only.
Client accounts created strictly via login/signup routes.
No WebAuthn/FaceID — removed, do not re-add.
AI assistant is named "Filho" (Portuguese for son). Never "Filo". Marks: <AiOrb /> + <AnimatedOrbNavIcon />.
Services page is view-only — edits happen in Acuity only.
Recurring appointments: 1 row per occurrence in Acuity + DB; no shadow block_times.

## Memories
- [State Persistence](mem://features/state-persistence) — URL-first state (?tab, ?date, ?week) + localStorage backups for hidden barbers, Clients filters
- [Recurring Consolidation](mem://features/recurring-consolidation) — Edge function + Settings UI to clean duplicate recurring appts and shadow blocks
- [Acuity Two-way Sync](mem://features/acuity-two-way-sync) — Webhook subscriptions, sync window, push direction
- [Acuity Desync Audit SOP](mem://reference/acuity-desync-audit-sop) — MANDATORY steps + pattern codes (P1-P4) for "in Acuity, not in app" audits
- [Client Booking Payment Priority](mem://features/client-booking-payment-priority) — App owns payment + client_id; webhook preserves app-set fields
- [Barber Identity](mem://style/design-system/barber-colors) — Colors and Acuity IDs for Charlie, Pito, Joseph
- [Financial Rules](mem://logic/business-rules/financial-formulas) — Production math, pass-through gateway fees, default cash fallback
- [Transaction Fees](mem://logic/business-rules/transaction-fee-logic) — Hybrid fee tracking, 10% digital fallback rate
- [Week Boundary](mem://logic/business-rules/week-boundary) — Reports run Saturday-to-Friday
- [Payroll Systems](mem://features/reports/paystub-system) — Custom check numbering, Yvette surplus triggers, SINOT deductions
- [Payment Integrations](mem://tech/payment-integration/payment-gateways) — Stripe, PayPal, ATH Móvil handling and webhooks
- [ATH Móvil Constraints](mem://tech/payment-integration/ath-movil-api-constraints) — Relies exclusively on webhooks, no manual pull API
- [Stripe Wallet](mem://tech/payment-integration/stripe-wallet) — Saved cards via setup_future_usage for POS
- [Booking Rules](mem://features/booking-rules) — Advance limits, padding, intervals, max limits
- [RLS — Barbers Lockdown](mem://security/rls-configuration) — barbers table column-locked; reads go through barbers_public view
- [Acuity Fallbacks](mem://tech/scheduling-architecture/acuity-email-fallback) — Fallback email/names for missing client info
- [Payments Roadmap](mem://features/payments-roadmap-next-sprint) — Next sprint: 3DS handling, real gateway fees, expired status flag, Apple/Google Pay, abandonment metrics
- [Auth System](mem://auth/authentication-system-v2) — Entry points for Admin, Barbers, and Clients
- [RLS Security](mem://security/rls-configuration) — Financial isolation per barber, full calendar access
- [Public Content](mem://features/public-website/content-preferences) — Copy rules, pricing display, review constraints
- [Public Images](mem://features/public-website/image-specifications) — Aspect ratios for hero, profiles, and blog
- [Public Integrations](mem://features/public-website/contact-and-social-integrations) — WhatsApp, GHL proxy forms, Maps
- [GHL Proxy](mem://features/public-website/form-integration-strategy) — Custom Supabase Edge Function proxy for CRM forms
- [SEO Strategy](mem://seo/strategy) — Claude Code playbook, AI-friendly strict rules
- [Test Accounts](mem://auth/test-accounts) — Credentials for staging and validation
- [Environment Vars](mem://auth/environment-variables) — Acuity Owner ID and fallback keys
- [Project Roadmap](mem://project/roadmap) — Phases to achieve full Acuity independence
- [Launch Roadmap](mem://project/launch-roadmap) — MVP launch checklist; source of truth for LAUNCH_PROGRESS % on ComingSoonPage
- [Design Tokens](mem://style/design-system-and-tokens) — Dark/light modes, spacing, typography constraints
- [Project Identity](mem://project/identity) — Basic context and business owner info
- [Localization](mem://style/localization) — Spanish-first, locale paths
- [No WebAuthn](mem://constraints/no-webauthn) — FaceID/biometric removed, do not re-add
- [Services View-Only](mem://constraints/services-view-only) — No edit drawer, Acuity is source of truth
- [Unified UI Patterns](mem://style/unified-ui-patterns) — Header padding, back buttons, card styles across views
- [Unified Barber Picker](mem://style/unified-barber-picker) — Shared BarberPickerRow component for all barber selection UIs
- [Public Booking Account Claim](mem://features/public-booking-account-claim) — Email required on public form; inline "create password" card on /citas/confirmado triggers onboarding
- [Invite Barber Flow](mem://features/invite-barber-flow) — Adding email to a barber in Settings auto-creates auth user, profile link, and barber role via invite-barber edge function
- [Dark Cards Global](mem://style/design-system/dark-cards-global) — Global dark cards: #0F1011 bg, #1B1B1E border/divider, fading border on .card-elevated; hero cards have their own style
- [Radius Tokens](mem://style/design-system/radius-tokens) — `--radius-control` 12px / `--radius-input` 10px / `--radius-pill` 9999px; shadcn Button/Input/Textarea/Toggle patched
- [Newsletter Section](mem://features/newsletter-section-naming) — Admin section is "Boletín"/"Newsletter" (NOT "Contenido"); broadcasts stay in Notifications page
- [GHL Replacement Roadmap](mem://features/ghl-replacement-roadmap) — Phased plan to replace GoHighLevel with native inbox, email, marketing automation, SMS
- [Filho AI Avatar](mem://style/filho-ai-avatar) — Filho (Portuguese "son") = our AI assistant. <AiOrb /> standalone mark + <AnimatedOrbNavIcon /> nav variant. CTA "Generar con Filho". iMessage typing dots.
- [Responsive Layout Roadmap](mem://project/responsive-layout-roadmap) — Phased plan: Phase 3 (public nav) done pre-launch; sidebar/portrait-lock/screen migration deferred post-launch
- [F&F Identity System (POST-LAUNCH)](mem://features/friends-family-identity-system) — DO NOT BUILD YET. Spec for Friends & Family members, "who is this for?" booking step, soft duplicate detection, contact-match on edit. Shared `findMatchingClient` engine.
