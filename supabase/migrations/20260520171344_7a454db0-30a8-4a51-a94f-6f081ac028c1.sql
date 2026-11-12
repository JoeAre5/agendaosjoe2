
-- 1. Add internal_notes to rewards_benefits
ALTER TABLE public.rewards_benefits ADD COLUMN IF NOT EXISTS internal_notes text;

-- 2. admin_update_referral_slug
CREATE OR REPLACE FUNCTION public.admin_update_referral_slug(
  _owner_type text,
  _owner_id uuid,
  _new_slug text,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_old_slug text;
  v_available jsonb;
BEGIN
  IF NOT is_owner() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_slug := lower(trim(_new_slug));
  IF v_slug !~ '^[a-z0-9-]{3,40}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_format');
  END IF;

  -- Check availability via existing function
  v_available := public.check_referral_slug_available(v_slug);
  IF (v_available->>'available')::boolean = false THEN
    -- allow same owner to keep their own slug
    IF NOT EXISTS (
      SELECT 1 FROM public.referral_owners
      WHERE id = _owner_id AND slug = v_slug
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_taken');
    END IF;
  END IF;

  SELECT slug INTO v_old_slug FROM public.referral_owners WHERE id = _owner_id;

  UPDATE public.referral_owners
  SET slug = v_slug, updated_at = now()
  WHERE id = _owner_id;

  IF _owner_type = 'client' THEN
    UPDATE public.clients c
    SET referral_slug = v_slug, referral_slug_updated_at = now()
    WHERE c.id = (SELECT owner_profile_id FROM public.referral_owners WHERE id = _owner_id);
  END IF;

  INSERT INTO public.referral_slug_history (owner_type, owner_id, old_slug, new_slug, changed_by)
  VALUES (_owner_type, _owner_id, v_old_slug, v_slug, auth.uid());

  RETURN jsonb_build_object('ok', true, 'slug', v_slug, 'reason', _reason);
END;
$$;

-- 3. get_client_network_overview
CREATE OR REPLACE FUNCTION public.get_client_network_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_clients int;
  v_active_links int;
  v_points_issued bigint;
BEGIN
  IF NOT is_owner() THEN RETURN jsonb_build_object('error','forbidden'); END IF;

  SELECT COUNT(DISTINCT client_id) INTO v_total_clients FROM public.client_rewards_ledger;
  SELECT COUNT(*) INTO v_active_links FROM public.clients WHERE referral_slug IS NOT NULL;
  SELECT COALESCE(SUM(points),0) INTO v_points_issued FROM public.client_rewards_ledger WHERE points > 0;

  RETURN jsonb_build_object(
    'total_clients', v_total_clients,
    'active_referral_links', v_active_links,
    'total_points_issued', v_points_issued
  );
END;
$$;

-- 4. get_client_rewards_profile
CREATE OR REPLACE FUNCTION public.get_client_rewards_profile(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client jsonb;
  v_summary jsonb;
  v_ledger jsonb;
  v_referrals jsonb;
BEGIN
  IF NOT is_owner() THEN RETURN jsonb_build_object('error','forbidden'); END IF;

  SELECT to_jsonb(c) - 'notes' INTO v_client
  FROM (
    SELECT id, first_name, last_name, email, phone, referral_slug, referral_slug_updated_at, avatar_url
    FROM public.clients WHERE id = _client_id
  ) c;

  v_summary := public.get_client_rewards_summary(_client_id);

  SELECT COALESCE(jsonb_agg(row_to_json(l) ORDER BY (l->>'created_at') DESC), '[]'::jsonb)
  INTO v_ledger
  FROM (
    SELECT id, points, source_type, description_es, description_en, created_at, created_by,
           source_appointment_id, source_transaction_id
    FROM public.client_rewards_ledger
    WHERE client_id = _client_id
    ORDER BY created_at DESC LIMIT 5
  ) l;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_referrals
  FROM (
    SELECT cra.client_id AS referred_client_id,
           c.first_name || ' ' || COALESCE(c.last_name,'') AS referred_name,
           cra.created_at, cra.last_payment_at, cra.attribution_status
    FROM public.client_referral_attributions cra
    JOIN public.clients c ON c.id = cra.client_id
    JOIN public.referral_owners ro ON ro.id = cra.original_referral_owner_id
    WHERE ro.owner_type = 'client' AND ro.owner_profile_id = _client_id
    ORDER BY cra.created_at DESC LIMIT 50
  ) r;

  RETURN jsonb_build_object(
    'client', v_client,
    'summary', v_summary,
    'recent_ledger', v_ledger,
    'referrals', v_referrals
  );
END;
$$;

-- 5. get_referral_links_overview
CREATE OR REPLACE FUNCTION public.get_referral_links_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_owner() THEN RETURN jsonb_build_object('error','forbidden'); END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY (x->>'updated_at') DESC NULLS LAST), '[]'::jsonb)
    FROM (
      SELECT
        ro.id AS owner_id,
        ro.owner_type,
        ro.owner_profile_id,
        ro.slug,
        ro.is_active,
        ro.created_at,
        ro.updated_at,
        CASE
          WHEN ro.owner_type = 'client' THEN
            (SELECT c.first_name || ' ' || COALESCE(c.last_name,'') FROM public.clients c WHERE c.id = ro.owner_profile_id)
          WHEN ro.owner_type = 'barber' THEN
            (SELECT b.name FROM public.barbers b WHERE b.id = ro.owner_profile_id)
          ELSE 'Shop'
        END AS owner_name
      FROM public.referral_owners ro
    ) x
  );
END;
$$;
