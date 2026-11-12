# Hasib branch integration review (draft, REVIEW ONLY)

Source: charliesbarbershop-app/agendaos `Hasib` @ 395451cf, ancestor 89186805. 155 files, 22 ahead / 249 behind main.

## Backend isolation: NOT isolated
The draft's backend project ref equals the main project's (same live database). No migrations, function deploys or data writes were made. Authenticated booking/edit/reschedule/cancel and checkout on Hasib's code cannot be verified here.

## Key compatibility finding
Every tenant, branding, onboarding and native-scheduling file depends on schema objects that do not exist in production
(read-only check: `request_shop_id`, `require_shop_access`, `resolve_scoped_shop` absent; client lookup RPCs have no `_shop_id` argument).
They come from Hasib's own migration chain (a1/a2/a4-a6/b1-b5/c1-c2/d1-d3/sec1, several thousand lines), written against the September 6 schema.
- SEC1 (client lookup leak) fixes a hole introduced by his a2 migration; production is not exposed to it today.
- Frontend pieces (BrandWordmark, useBrandedDocument, ShopSwitcher, Shops page, shopScope, types.ts) read those new objects, so porting them alone would break or silently blank Charlie's UI.

## Ported
- Nothing to runtime. Added `src/lib/hasibIntegrationGuards.test.ts` (5 checks) locking the exclusions below.

## Excluded
.env, generated types/client, edits to historical migrations, DEV_LOGINS/credential docs, dev-reset/seed scripts, vercel.json,
deletion of acuity-proxy/sync/webhook/block-sync/sync-services/find-duplicates and acuityConflict, d1_shops_off_acuity cutover,
src/lib/scheduling routing (sends everything native), bookingProvider (treats acuity as external),
native-scheduling update endpoint (rejects acuity_id, overwrites price/duration from catalog), and his rewrites of
EditAppointment/AppointmentDetail/pay-then-book/commitDraft/stripe-webhook that predate edit_line_items and the remaining-balance gate.

## Required before porting
1. Isolated test backend (separate project or branch DB) with sanitized data.
2. Rebase Hasib's migrations as new forward-only files against current schema, keeping per-barber financial RLS and shared staff calendar access; add cross-shop deny tests.
3. Gate native scheduling per shop (default Acuity), accept legacy acuity_id, use edit_line_items as the only price/duration source, keep pending paid draft "reconciliation required" vs "proven rejection" states.
4. Charlie leaves Acuity only after each barber's services, durations and prices are configured and validated against Acuity.
