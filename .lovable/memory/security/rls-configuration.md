---
name: RLS Configuration
description: Row-level security configuration including barbers table lockdown via barbers_public view
type: feature
---
# RLS Configuration

## Barbers Table Lockdown (2026-04-23)

The `public.barbers` base table contains sensitive payroll data: `ssn_last4`, `weekly_salary`, `commission_rate`, `retention_rate`, `product_commission_rate`, `bonus_threshold_cents`, `employee_id`, `email`, `employment_type`.

**Security model:**
- `anon` role: column-level GRANT SELECT on only 11 safe columns (id, name, avatar_url, color, description, acuity_calendar_id, acuity_calendar_key, show_in_checkout, is_default_checkout_barber, is_active, created_at). `SELECT *` returns `permission denied for table barbers`.
- `authenticated` role: full table-level GRANT SELECT, but RLS still restricts rows: owners see all; barbers see own + active; clients have no policy match (use `barbers_public` view).
- `barbers_public` view: `security_invoker = on`, projects only the 11 safe columns. Granted to anon and authenticated.

**Code rule:**
- Use `.from("barbers_public")` for any read of public-safe fields (name/avatar/color/calendar mappings).
- Use `.from("barbers")` ONLY when:
  - Reading sensitive fields (Settings owner CRUD, CheckoutTab commission_rate)
  - Writing (insert/update — view is read-only)
  - Edge functions running as service role

**Anon attacker hitting `/rest/v1/barbers?select=*` → `permission denied`. The view is the only public surface.**
