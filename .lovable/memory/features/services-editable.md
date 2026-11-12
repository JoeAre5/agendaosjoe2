---
name: Services Page Editable
description: Owner can edit name/duration/price and reorder services in the admin Services page; edits are protected from Acuity sync via locally_edited flag and applied across all internal booking flows.
type: feature
---
The Services page (/admin/services) is editable for owners:
- Edit title, duration, price (sets `services.locally_edited = true`)
- Reorder via ↑ ↓ buttons (toggle reorder mode in header) — persists to `services.sort_order`

Sync behavior: `acuity-sync-services` skips name/duration/price/description for rows where `locally_edited = true`. Other metadata still syncs.

Applied in NewAppointment, EditAppointment, ClientNewAppointment via `barberServices` memo: applies override when locally_edited, merges local-only services, sorts by sort_order then name. Public website unaffected.
