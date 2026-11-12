-- =====================================================================
-- Real column-level lockdown — fix previous migration's accidental re-grant
-- =====================================================================

-- ─── 1. CLIENTS: true column isolation ──────────────────────────────────
-- Revoke ALL table-level SELECT/UPDATE/INSERT from authenticated
REVOKE ALL ON public.clients FROM authenticated;

-- Grant only safe columns at SELECT level (used by all client+staff reads)
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

-- INSERT/UPDATE/DELETE: full table grant; RLS policies gate row access
GRANT INSERT, UPDATE, DELETE ON public.clients TO authenticated;

-- Service role keeps full access
GRANT ALL ON public.clients TO service_role;

-- Security-definer RPC for owner + client own-row to read payment metadata
CREATE OR REPLACE FUNCTION public.get_client_payment_details(_client_id uuid)
RETURNS TABLE(
  stripe_customer_id text,
  card_brand text,
  card_last4 text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_owner boolean := public.is_owner();
  _my_client_id uuid := public.get_my_client_id();
BEGIN
  -- Permitted: owners (any client), or the client themselves (own row)
  IF NOT _is_owner AND _my_client_id IS DISTINCT FROM _client_id THEN
    RAISE EXCEPTION 'permission denied: payment details';
  END IF;

  RETURN QUERY
    SELECT c.stripe_customer_id, c.card_brand, c.card_last4
    FROM public.clients c
    WHERE c.id = _client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_payment_details(uuid) TO authenticated;

-- Verify the lockdown immediately at end of migration
DO $$
DECLARE
  authn_can_read_stripe boolean;
BEGIN
  authn_can_read_stripe := has_column_privilege('authenticated', 'public.clients', 'stripe_customer_id', 'SELECT');
  IF authn_can_read_stripe THEN
    RAISE EXCEPTION 'LOCKDOWN FAILED: authenticated still has SELECT on clients.stripe_customer_id';
  END IF;
END;
$$;

-- ─── 2. SHOP_SETTINGS: true column isolation ────────────────────────────
REVOKE ALL ON public.shop_settings FROM authenticated;

GRANT SELECT (
  id, shop_name, address, city, phone, hours, timezone,
  legal_entity, owner_name, created_at, updated_at
) ON public.shop_settings TO authenticated;

-- Owners need to UPDATE shop settings — grant via existing RLS policy
GRANT INSERT, UPDATE, DELETE ON public.shop_settings TO authenticated;
GRANT ALL ON public.shop_settings TO service_role;

-- Security-definer RPC for owners to read financial config
CREATE OR REPLACE FUNCTION public.get_shop_financial_config()
RETURNS TABLE(
  digital_fee_rate numeric,
  fixed_weekly_expenses_cents integer,
  yvette_weekly_cap_cents integer,
  yvette_min_surplus_cents integer,
  notifications_paused_snapshot jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'permission denied: financial config';
  END IF;

  RETURN QUERY
    SELECT
      s.digital_fee_rate, s.fixed_weekly_expenses_cents,
      s.yvette_weekly_cap_cents, s.yvette_min_surplus_cents,
      s.notifications_paused_snapshot
    FROM public.shop_settings s
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shop_financial_config() TO authenticated;

-- Final verification
DO $$
DECLARE
  authn_can_read_fee boolean;
BEGIN
  authn_can_read_fee := has_column_privilege('authenticated', 'public.shop_settings', 'digital_fee_rate', 'SELECT');
  IF authn_can_read_fee THEN
    RAISE EXCEPTION 'LOCKDOWN FAILED: authenticated still has SELECT on shop_settings.digital_fee_rate';
  END IF;
END;
$$;