
-- Find groups of duplicate clients by normalized email or normalized phone
CREATE OR REPLACE FUNCTION public.find_duplicate_client_groups()
RETURNS TABLE(
  group_key text,
  match_type text,
  client_ids uuid[],
  client_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner required';
  END IF;

  RETURN QUERY
  WITH email_groups AS (
    SELECT lower(trim(email)) AS k,
           'email'::text AS mt,
           array_agg(id ORDER BY total_visits DESC NULLS LAST, created_at ASC) AS ids,
           count(*)::int AS n
    FROM public.clients
    WHERE email IS NOT NULL AND trim(email) <> ''
    GROUP BY lower(trim(email))
    HAVING count(*) >= 2
  ),
  phone_groups AS (
    SELECT public.normalize_phone(phone) AS k,
           'phone'::text AS mt,
           array_agg(id ORDER BY total_visits DESC NULLS LAST, created_at ASC) AS ids,
           count(*)::int AS n
    FROM public.clients
    WHERE public.normalize_phone(phone) IS NOT NULL
    GROUP BY public.normalize_phone(phone)
    HAVING count(*) >= 2
  )
  SELECT k, mt, ids, n FROM email_groups
  UNION ALL
  SELECT k, mt, ids, n FROM phone_groups
  ORDER BY n DESC, mt;
END;
$$;

-- Merge `_discard_id` into `_keep_id`: move all references then delete the discarded row.
CREATE OR REPLACE FUNCTION public.merge_clients(_keep_id uuid, _discard_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _keep record;
  _discard record;
  _appts int := 0;
  _tx int := 0;
  _drafts int := 0;
  _wait int := 0;
  _loyalty_pts int := 0;
  _loyalty_tx int := 0;
  _reviews int := 0;
  _refs_referrer int := 0;
  _refs_referred int := 0;
  _attr int := 0;
  _push int := 0;
  _bcast int := 0;
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner required';
  END IF;
  IF _keep_id IS NULL OR _discard_id IS NULL OR _keep_id = _discard_id THEN
    RAISE EXCEPTION 'invalid merge ids';
  END IF;

  SELECT * INTO _keep FROM public.clients WHERE id = _keep_id;
  IF _keep IS NULL THEN RAISE EXCEPTION 'keep client not found'; END IF;
  SELECT * INTO _discard FROM public.clients WHERE id = _discard_id;
  IF _discard IS NULL THEN RAISE EXCEPTION 'discard client not found'; END IF;

  -- Audit BEFORE mutation
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'merge_clients', 'client', _keep_id,
          jsonb_build_object('keep', to_jsonb(_keep), 'discard', to_jsonb(_discard)));

  -- Move appointments
  WITH u AS (UPDATE public.appointments SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
  SELECT count(*)::int INTO _appts FROM u;

  -- Move transactions
  WITH u AS (UPDATE public.transactions SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
  SELECT count(*)::int INTO _tx FROM u;

  -- Booking drafts
  BEGIN
    WITH u AS (UPDATE public.booking_drafts SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _drafts FROM u;
  EXCEPTION WHEN undefined_column OR undefined_table THEN _drafts := 0; END;

  -- Waitlist
  BEGIN
    WITH u AS (UPDATE public.waitlist SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _wait FROM u;
  EXCEPTION WHEN undefined_table THEN _wait := 0; END;

  -- Loyalty
  BEGIN
    WITH u AS (UPDATE public.loyalty_transactions SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _loyalty_tx FROM u;
  EXCEPTION WHEN undefined_table THEN _loyalty_tx := 0; END;
  BEGIN
    DELETE FROM public.loyalty_points WHERE client_id = _discard_id;
    GET DIAGNOSTICS _loyalty_pts = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN _loyalty_pts := 0; END;

  -- Reviews
  BEGIN
    WITH u AS (UPDATE public.reviews SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _reviews FROM u;
  EXCEPTION WHEN undefined_table THEN _reviews := 0; END;

  -- Referrals (legacy)
  BEGIN
    WITH u AS (UPDATE public.referrals SET referrer_client_id = _keep_id WHERE referrer_client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _refs_referrer FROM u;
    WITH u AS (UPDATE public.referrals SET referred_client_id = _keep_id WHERE referred_client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _refs_referred FROM u;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Referral attributions (move when no conflict; otherwise drop the duplicate)
  BEGIN
    UPDATE public.referral_attributions ra
    SET referred_client_id = _keep_id
    WHERE ra.referred_client_id = _discard_id
      AND NOT EXISTS (
        SELECT 1 FROM public.referral_attributions x
        WHERE x.code = ra.code AND x.conversion_type = ra.conversion_type
          AND x.referred_client_id = _keep_id
      );
    GET DIAGNOSTICS _attr = ROW_COUNT;
    DELETE FROM public.referral_attributions WHERE referred_client_id = _discard_id;
  EXCEPTION WHEN undefined_table THEN _attr := 0; END;

  -- Push subscriptions
  BEGIN
    WITH u AS (UPDATE public.push_subscriptions SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _push FROM u;
  EXCEPTION WHEN undefined_table THEN _push := 0; END;

  -- Broadcast receipts
  BEGIN
    WITH u AS (UPDATE public.broadcast_receipts SET client_id = _keep_id WHERE client_id = _discard_id RETURNING 1)
    SELECT count(*)::int INTO _bcast FROM u;
  EXCEPTION WHEN undefined_table THEN _bcast := 0; END;

  -- Backfill missing fields on keep with discard's values
  UPDATE public.clients
  SET email          = COALESCE(NULLIF(email, ''), _discard.email),
      phone          = COALESCE(NULLIF(phone, ''), _discard.phone),
      first_name     = COALESCE(NULLIF(first_name, ''), _discard.first_name),
      last_name      = COALESCE(NULLIF(last_name, ''), _discard.last_name),
      auth_user_id   = COALESCE(auth_user_id, _discard.auth_user_id),
      acuity_client_id = COALESCE(acuity_client_id, _discard.acuity_client_id),
      preferred_barber_id = COALESCE(preferred_barber_id, _discard.preferred_barber_id),
      updated_at = now()
  WHERE id = _keep_id;

  -- Delete discard
  DELETE FROM public.clients WHERE id = _discard_id;

  -- Recalc stats on keep
  UPDATE public.clients SET
    total_visits = COALESCE((SELECT count(*) FROM public.transactions WHERE client_id = _keep_id AND status = 'completed'), 0),
    total_spent_cents = COALESCE((SELECT COALESCE(sum(total_cents), 0) FROM public.transactions WHERE client_id = _keep_id AND status = 'completed'), 0),
    last_visit_at = (SELECT max(created_at) FROM public.transactions WHERE client_id = _keep_id AND status = 'completed'),
    updated_at = now()
  WHERE id = _keep_id;

  RETURN jsonb_build_object(
    'success', true,
    'kept_id', _keep_id,
    'discarded_id', _discard_id,
    'appointments_moved', _appts,
    'transactions_moved', _tx,
    'booking_drafts_moved', _drafts,
    'waitlist_moved', _wait,
    'loyalty_points_deleted', _loyalty_pts,
    'loyalty_tx_moved', _loyalty_tx,
    'reviews_moved', _reviews,
    'referrals_referrer_moved', _refs_referrer,
    'referrals_referred_moved', _refs_referred,
    'referral_attributions_moved', _attr,
    'push_subscriptions_moved', _push,
    'broadcast_receipts_moved', _bcast
  );
END;
$$;

-- Owner-only LTV per referrer barber: total spent across attributed clients
CREATE OR REPLACE FUNCTION public.get_referral_performance()
RETURNS TABLE(
  code text,
  owner_type text,
  owner_id uuid,
  owner_name text,
  signups bigint,
  waitlist_joins bigint,
  first_bookings bigint,
  pwa_installs bigint,
  push_enabled bigint,
  unique_clients bigint,
  total_conversions bigint,
  ltv_cents bigint,
  last_conversion_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner required';
  END IF;

  RETURN QUERY
  SELECT
    rc.code,
    rc.owner_type,
    rc.owner_id,
    CASE
      WHEN rc.owner_type = 'barber' THEN (SELECT b.name FROM public.barbers b WHERE b.id = rc.owner_id)
      WHEN rc.owner_type = 'client' THEN (SELECT trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) FROM public.clients c WHERE c.id = rc.owner_id)
    END AS owner_name,
    COALESCE(lb.signups, 0) AS signups,
    COALESCE(lb.waitlist_joins, 0) AS waitlist_joins,
    COALESCE(lb.first_bookings, 0) AS first_bookings,
    COALESCE(lb.pwa_installs, 0) AS pwa_installs,
    COALESCE(lb.push_enabled, 0) AS push_enabled,
    COALESCE(lb.unique_clients, 0) AS unique_clients,
    COALESCE(lb.total_conversions, 0) AS total_conversions,
    COALESCE((
      SELECT sum(t.total_cents)::bigint
      FROM public.transactions t
      WHERE t.status = 'completed'
        AND t.client_id IN (
          SELECT DISTINCT ra.referred_client_id
          FROM public.referral_attributions ra
          WHERE ra.code = rc.code AND ra.referred_client_id IS NOT NULL
        )
    ), 0) AS ltv_cents,
    lb.last_conversion_at
  FROM public.referral_codes rc
  LEFT JOIN public.referral_leaderboard lb ON lb.code = rc.code
  WHERE rc.is_active = true
  ORDER BY COALESCE(lb.total_conversions, 0) DESC, lb.last_conversion_at DESC NULLS LAST;
END;
$$;
