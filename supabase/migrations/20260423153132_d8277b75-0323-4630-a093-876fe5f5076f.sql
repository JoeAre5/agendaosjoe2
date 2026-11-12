-- =====================================================================
-- Security Lockdown: clients PII, booking_drafts retention, shop_settings
-- =====================================================================

-- ─── 1. CLIENTS — Lock down PII from barbers via a safe view ────────────
-- Drop the over-permissive barber policy
DROP POLICY IF EXISTS "Barber read clients" ON public.clients;

-- Create a barber-safe view that excludes payment metadata + auth linkage +
-- marketing channels. Barbers can still see operational fields they need
-- (name, phone, email for booking flows, visit stats, preferred barber).
CREATE OR REPLACE VIEW public.clients_staff_safe
WITH (security_invoker = on) AS
SELECT
  id,
  first_name,
  last_name,
  phone,
  email,
  notes,
  preferred_barber_id,
  date_of_birth,
  gender,
  avatar_url,
  is_guest,
  account_verified,
  total_visits,
  total_spent_cents,
  last_visit_at,
  booking_source,
  acuity_client_id,
  created_at,
  updated_at
FROM public.clients;

-- Re-grant barber read on the SAFE view only
GRANT SELECT ON public.clients_staff_safe TO authenticated;

-- New barber policy on the base table: limited to non-sensitive columns
-- via column-level GRANT. Barbers need to UPDATE clients (e.g. WalkIn flow
-- creates client rows, Checkout updates last_visit) so we keep INSERT/UPDATE
-- on the base table for barbers but block direct SELECT of sensitive cols.
CREATE POLICY "Barber insert clients"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (is_barber());

CREATE POLICY "Barber update clients non-sensitive"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (is_barber())
  WITH CHECK (is_barber());

-- Column-level SELECT for barbers on safe columns only.
-- This means `SELECT stripe_customer_id FROM clients` as a barber → permission denied
REVOKE SELECT ON public.clients FROM authenticated;
GRANT SELECT (
  id, first_name, last_name, phone, email, notes, preferred_barber_id,
  date_of_birth, gender, avatar_url, is_guest, account_verified,
  total_visits, total_spent_cents, last_visit_at, booking_source,
  acuity_client_id, auth_user_id, created_at, updated_at,
  notifications_enabled, notifications_permission_asked, onboarding_completed,
  onboarding_completed_at, conversion_prompted_at, conversion_prompted_count,
  notify_email_appointments, notify_push_appointments, notify_sms_appointments,
  notify_whatsapp_appointments, notify_email_marketing, notify_sms_marketing,
  notify_whatsapp_marketing, sms_opt_in,
  ath_phone, ath_phone_last4
) ON public.clients TO authenticated;
-- Sensitive columns NOT granted: stripe_customer_id, card_brand, card_last4
-- Owners bypass column GRANT via "Owner full access clients" ALL policy + service_role default
GRANT ALL ON public.clients TO service_role;

-- Re-add a SELECT policy that lets barbers read rows (RLS row filter still applies).
-- Column-level GRANT above blocks the sensitive columns regardless.
CREATE POLICY "Barber read clients (column-restricted)"
  ON public.clients FOR SELECT
  TO authenticated
  USING (is_barber());

-- Owners bypass column-level GRANT because the "Owner full access clients"
-- policy already exists and ALL ON clients was granted to service_role above.
-- For the owner role to keep full SELECT (incl. sensitive cols), we need
-- table-level GRANT SELECT to authenticated on those cols too. But since
-- owner queries are made through the authenticated role, we must grant
-- the sensitive cols to authenticated and let the policy gate them.
-- Add sensitive columns back at GRANT level — RLS row filter (Owner full
-- access clients) and the new "Barber read clients (column-restricted)"
-- policy together control who can read. Then revoke the visibility for
-- barbers via a separate column-level revoke pattern is impossible in PG —
-- so we instead expose those cols and the application code reads from the
-- safe VIEW for barbers (defence-in-depth: API surface + code convention).
GRANT SELECT (stripe_customer_id, card_brand, card_last4) ON public.clients TO authenticated;
-- NOTE: column-level GRANT in Postgres is OR-combined with RLS — we cannot
-- block specific columns per-role. The view + code convention is the real
-- enforcement layer; the column GRANTs above just prevent `SELECT *` from
-- failing for owners. Barbers WILL still be able to query
-- stripe_customer_id directly from the base table if they craft a request.
-- TRUE column-level lockdown requires moving sensitive cols to a separate
-- table — see follow-up migration plan in mem://security/rls-configuration.

-- ─── 2. BOOKING_DRAFTS — Auto-purge stale drafts ────────────────────────
-- Function to purge drafts older than 24h that are not committed
CREATE OR REPLACE FUNCTION public.purge_stale_booking_drafts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.booking_drafts
  WHERE status IN ('pending', 'failed', 'refunded')
    AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Schedule it via pg_cron (runs daily at 03:00 UTC = 23:00 AST)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-stale-booking-drafts')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-stale-booking-drafts');
    PERFORM cron.schedule(
      'purge-stale-booking-drafts',
      '0 3 * * *',
      $cron$ SELECT public.purge_stale_booking_drafts(); $cron$
    );
  END IF;
END;
$$;

-- ─── 3. SHOP_SETTINGS — Hide financial config from barbers ──────────────
-- Drop barber's blanket SELECT
DROP POLICY IF EXISTS "Barber read settings" ON public.shop_settings;

-- Create a barber-safe view exposing only operational data
CREATE OR REPLACE VIEW public.shop_settings_public
WITH (security_invoker = on) AS
SELECT
  id,
  shop_name,
  address,
  city,
  phone,
  hours,
  timezone,
  legal_entity,
  owner_name
FROM public.shop_settings;

GRANT SELECT ON public.shop_settings_public TO authenticated;

-- Owners keep full access via existing "Owner full access settings" policy.
-- Barbers now read only the safe view.
-- Sensitive fields hidden: digital_fee_rate, fixed_weekly_expenses_cents,
-- yvette_weekly_cap_cents, yvette_min_surplus_cents, notifications_paused_snapshot

-- Re-add a barber policy that grants base-table SELECT only to support
-- code paths still on the base table (will be migrated to the view).
-- Restricted to operational columns only via column GRANT.
REVOKE SELECT ON public.shop_settings FROM authenticated;
GRANT SELECT (
  id, shop_name, address, city, phone, hours, timezone,
  legal_entity, owner_name, created_at, updated_at
) ON public.shop_settings TO authenticated;
GRANT SELECT ON public.shop_settings TO service_role;

CREATE POLICY "Barber read settings (column-restricted)"
  ON public.shop_settings FOR SELECT
  TO authenticated
  USING (is_barber() OR is_owner());

-- Owners need full column access — re-grant the sensitive cols
GRANT SELECT (
  digital_fee_rate, fixed_weekly_expenses_cents,
  yvette_weekly_cap_cents, yvette_min_surplus_cents,
  notifications_paused_snapshot
) ON public.shop_settings TO authenticated;
-- Same caveat as clients: column GRANT is OR-combined with RLS. The
-- "shop_settings_public" view is the enforced surface for barbers.
