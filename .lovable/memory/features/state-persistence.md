---
name: State persistence (Phase 1B.UX)
description: URL-first state pattern + localStorage backup for admin app — survives Safari restore, refresh, and back navigation
type: feature
---

# Admin State Persistence — Phase 1B.UX

## Pattern: URL-first, localStorage as backup

State that should survive Safari app-switching, page refresh, and back navigation
is stored in URL query params. localStorage backs up date selections so a fresh
visit (no URL params) returns to the last-viewed state.

## URL Params (all on `/admin?...`)

| Param | Owner | Format | Purpose |
|-------|-------|--------|---------|
| `tab` | `AppShell` | `home\|calendar\|checkout\|menu` | Active bottom-nav tab |
| `date` | `useCalendarData` | `YYYY-MM-DD` | Selected calendar date |
| `week` | `useWeekSelector` | `YYYY-MM-DD` (week start, Sat boundary) | Cuadre/Nómina/Resumen week |
| `checkout` + `apptId` | `AppShell` | one-shot | Open checkout for a specific appointment (consumed and cleared) |
| `client` | `Clients.tsx` | UUID | Selected client profile sheet |
| `cstep` / `apptId` / `method` | `CheckoutTab` | union / UUID / union | Active checkout step, attached appointment, payment method |
| `nstep` / `ncal` / `nsvc` / `naddons` / `ndate` / `ntime` | `NewAppointment` | union / int / signed-int / csv-ints / `YYYY-MM-DD` / Acuity ISO | New-appointment flow: step, calendar, service, addons, date, time |
| `ntab` | `AdminNotifications` | `templates\|broadcast` | Active tab on /admin/notifications |
| `section` | `Settings` | `shop\|barbers\|expenses\|recurring` | Open accordion section on /admin/settings |

All updates use `setSearchParams(next, { replace: true })` so the back button
isn't polluted by every day-tap.

## localStorage Keys (all `agendaos.` prefix)

- `agendaos.calendar.lastDate` — backup for `?date=` when URL is missing
- `agendaos.calendar.hiddenBarbers` — array of hidden barber UUIDs (cross-session)
- `agendaos.clients.barberFilter` — last selected barber filter on Clients page
- `agendaos.clients.sortMode` — `nombre|reciente|vip`
- `agendaos.broadcast.draft.*` — bilingual fields (pill/title/body/cta), destination preset, custom URL, hero image — half-composed broadcast survives Safari restore. Cleared on successful send via `reset()`.

## NOT persisted (by design)

- Clients page `search` input — ephemeral per session, would go stale
- Sensitive client data — nothing with names/phones/emails goes to localStorage
- Form drafts (Nueva Cita, Block Time mid-fill) — could be future work

## Back-navigation helper

`src/lib/navHelpers.ts` exports `backToCalendar(searchParams)` which preserves
`?date=` when navigating back from detail/edit/new pages. Used by:
AppointmentDetail, EditAppointment, NewAppointment, WalkIn, Waitlist.

`backToMenu(searchParams)` does the same for menu sub-pages (Contable).

## Safari bfcache

`App.tsx` registers a `pageshow` listener that logs when Safari restores from
the back-forward cache. No re-hydration is needed because URL params drive
state on mount and React state survives bfcache restores.
