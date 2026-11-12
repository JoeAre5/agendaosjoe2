
-- ===========================================================================
-- Structural referral classification fix
-- Single source of truth: client_referral_attributions joined to referral_owners.
-- Network is decided by referral_owners.owner_type, never by text/slug/points.
-- ===========================================================================

-- 1) Derived view: every attribution carries its owner_type and network_type.
CREATE OR REPLACE VIEW public.v_referral_attributions AS
SELECT
  cra.id,
  cra.client_id,
  cra.current_referral_owner_id,
  cra.original_referral_owner_id,
  cra.original_referral_link_id,
  cra.attribution_status,
  cra.last_payment_at,
  cra.reset_available_at,
  cra.reallocated_at,
  cra.reallocation_reason,
  cra.created_at,
  cra.updated_at,
  ro.owner_type AS referrer_owner_type,
  ro.owner_profile_id AS referrer_owner_profile_id,
  ro.slug AS referrer_slug,
  ro.display_name AS referrer_display_name,
  CASE ro.owner_type
    WHEN 'client' THEN 'client_network'
    WHEN 'barber' THEN 'internal_network'
    WHEN 'shop'   THEN 'internal_network'
    ELSE 'unknown'
  END AS network_type
FROM public.client_referral_attributions cra
JOIN public.referral_owners ro
  ON ro.id = cra.current_referral_owner_id;

GRANT SELECT ON public.v_referral_attributions TO authenticated;

-- 2) Server-side attribution wrapper.
CREATE OR REPLACE FUNCTION public.attribute_booking_referral(
  _appointment_id uuid,
  _ref_code text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client_id uuid;
  _owner_id uuid;
BEGIN
  IF _appointment_id IS NULL OR _ref_code IS NULL OR length(trim(_ref_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT client_id INTO _client_id
  FROM public.appointments
  WHERE id = _appointment_id;

  IF _client_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Idempotent: assign_client_referral skips if attribution already exists.
  _owner_id := public.assign_client_referral(_client_id, _ref_code, NULL);
  RETURN _owner_id;
END $function$;

-- 3) Trigger on appointments: any code-bearing booking attributes automatically.
CREATE OR REPLACE FUNCTION public.tg_appointments_attribute_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.referral_attribution_code IS NOT NULL
     AND length(trim(NEW.referral_attribution_code)) > 0
     AND NEW.client_id IS NOT NULL THEN
    PERFORM public.assign_client_referral(NEW.client_id, NEW.referral_attribution_code, NULL);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block the appointment insert because of attribution noise
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_appointments_attribute_referral ON public.appointments;
CREATE TRIGGER trg_appointments_attribute_referral
AFTER INSERT OR UPDATE OF referral_attribution_code, client_id
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.tg_appointments_attribute_referral();

-- 4) Trigger on attributions: ensure the referred client has their own referral_owner
--    so they can immediately refer others (and appear in Red de Clientes when they do).
CREATE OR REPLACE FUNCTION public.tg_cra_ensure_client_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.client_id IS NOT NULL THEN
    PERFORM public.ensure_client_referral_owner(NEW.client_id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_cra_ensure_client_owner ON public.client_referral_attributions;
CREATE TRIGGER trg_cra_ensure_client_owner
AFTER INSERT ON public.client_referral_attributions
FOR EACH ROW
EXECUTE FUNCTION public.tg_cra_ensure_client_owner();

-- 5) Rewrite get_client_network_dashboard.
--    Source of truth = referral_owners(owner_type='client') joined to attributions.
--    Do NOT filter by referral_owners.active so referrers whose own link is paused
--    still surface when they have attributed downlines.
CREATE OR REPLACE FUNCTION public.get_client_network_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  IF NOT (public.is_owner() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH client_owners AS (
    SELECT ro.id AS owner_id, ro.slug, ro.owner_profile_id AS client_id, ro.created_at,
           c.first_name, c.last_name, c.email, c.phone
    FROM public.referral_owners ro
    JOIN public.clients c ON c.id = ro.owner_profile_id
    WHERE ro.owner_type = 'client'
  ),
  downline_stats AS (
    SELECT co.owner_id,
           COUNT(cra.id)::int AS referrals_count,
           COALESCE(SUM(CASE WHEN cra.attribution_status = 'active' THEN 1 ELSE 0 END), 0)::int AS active_referrals,
           MAX(cra.last_payment_at) AS last_payment_at
    FROM client_owners co
    LEFT JOIN public.client_referral_attributions cra
      ON cra.original_referral_owner_id = co.owner_id
    GROUP BY co.owner_id
  ),
  downline_spend AS (
    SELECT co.owner_id,
           COALESCE(SUM(t.amount_cents), 0)::bigint AS downline_spend_cents
    FROM client_owners co
    LEFT JOIN public.client_referral_attributions cra
      ON cra.original_referral_owner_id = co.owner_id
    LEFT JOIN public.transactions t
      ON t.client_id = cra.client_id AND t.status = 'completed'
    GROUP BY co.owner_id
  ),
  points_stats AS (
    SELECT co.client_id, COALESCE(SUM(crl.points), 0)::int AS balance
    FROM client_owners co
    LEFT JOIN public.client_rewards_ledger crl ON crl.client_id = co.client_id
    GROUP BY co.client_id
  )
  SELECT jsonb_build_object(
    'total_referrers', (SELECT COUNT(*) FROM client_owners),
    'total_referrals', COALESCE((SELECT SUM(referrals_count) FROM downline_stats), 0),
    'total_points', COALESCE((SELECT SUM(balance) FROM points_stats), 0),
    'referrers', COALESCE(jsonb_agg(jsonb_build_object(
      'client_id', co.client_id,
      'owner_id', co.owner_id,
      'slug', co.slug,
      'name', TRIM(COALESCE(co.first_name,'') || ' ' || COALESCE(co.last_name,'')),
      'email', co.email,
      'phone', co.phone,
      'created_at', co.created_at,
      'referrals_count', COALESCE(ds.referrals_count, 0),
      'active_referrals', COALESCE(ds.active_referrals, 0),
      'last_payment_at', ds.last_payment_at,
      'downline_spend_cents', COALESCE(dsp.downline_spend_cents, 0),
      'points_balance', COALESCE(ps.balance, 0)
    ) ORDER BY COALESCE(ds.referrals_count, 0) DESC, COALESCE(ps.balance, 0) DESC), '[]'::jsonb)
  )
  INTO _result
  FROM client_owners co
  LEFT JOIN downline_stats ds ON ds.owner_id = co.owner_id
  LEFT JOIN downline_spend dsp ON dsp.owner_id = co.owner_id
  LEFT JOIN points_stats ps ON ps.client_id = co.client_id;

  RETURN COALESCE(_result, jsonb_build_object(
    'total_referrers',0,'total_referrals',0,'total_points',0,'referrers','[]'::jsonb
  ));
END;
$function$;

-- 6) Backfill — one shot.
--    a) For every past appointment that carries a referral_attribution_code but has
--       no attribution row, create the attribution now.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.client_id, a.referral_attribution_code
    FROM public.appointments a
    LEFT JOIN public.client_referral_attributions cra ON cra.client_id = a.client_id
    WHERE a.referral_attribution_code IS NOT NULL
      AND a.client_id IS NOT NULL
      AND cra.id IS NULL
  LOOP
    PERFORM public.assign_client_referral(r.client_id, r.referral_attribution_code, NULL);
  END LOOP;
END $$;

--    b) Ensure every attributed client has their own referral_owner.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT cra.client_id
    FROM public.client_referral_attributions cra
    LEFT JOIN public.referral_owners ro
      ON ro.owner_type = 'client' AND ro.owner_profile_id = cra.client_id
    WHERE ro.id IS NULL
  LOOP
    PERFORM public.ensure_client_referral_owner(r.client_id);
  END LOOP;
END $$;
