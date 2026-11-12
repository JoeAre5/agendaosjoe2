
-- 1) Self-heal helper: backfill matching_bonus ledger rows for a client's referrer
CREATE OR REPLACE FUNCTION public.recompute_matching_bonus_for_client(_client_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cra record;
  _owner record;
  _referrer_client_id uuid;
  _tx record;
  _appt record;
  _points int;
  _inserted int := 0;
  _already boolean;
BEGIN
  IF _client_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _cra FROM public.client_referral_attributions WHERE client_id = _client_id;
  IF _cra IS NULL OR _cra.current_referral_owner_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _owner FROM public.referral_owners WHERE id = _cra.current_referral_owner_id;
  IF _owner IS NULL OR _owner.owner_type <> 'client' OR _owner.owner_profile_id IS NULL THEN
    RETURN 0;
  END IF;

  _referrer_client_id := _owner.owner_profile_id;
  IF _referrer_client_id = _client_id THEN RETURN 0; END IF;

  -- One-shot per referrer/referee pair (matches trigger logic)
  SELECT EXISTS (
    SELECT 1 FROM public.client_rewards_ledger
    WHERE source_type = 'matching_bonus'
      AND client_id = _referrer_client_id
      AND source_referral_client_id = _client_id
  ) INTO _already;
  IF _already THEN RETURN 0; END IF;

  -- Find first eligible completed transaction for the referee
  FOR _tx IN
    SELECT t.* FROM public.transactions t
    WHERE t.client_id = _client_id
      AND t.status = 'completed'
    ORDER BY COALESCE(t.approved_at, t.created_at) ASC
  LOOP
    IF _tx.appointment_id IS NOT NULL THEN
      SELECT is_rewards_eligible INTO _appt FROM public.appointments WHERE id = _tx.appointment_id;
      IF NOT FOUND OR NOT COALESCE(_appt.is_rewards_eligible, false) THEN
        CONTINUE;
      END IF;
    END IF;

    _points := public.calc_reward_points(COALESCE(_tx.subtotal_cents, 0));
    IF _points > 0 THEN
      INSERT INTO public.client_rewards_ledger
        (client_id, points, source_type, source_transaction_id, source_appointment_id, source_referral_client_id,
         description_es, description_en, metadata)
      VALUES (_referrer_client_id, _points, 'matching_bonus', _tx.id, _tx.appointment_id, _client_id,
        'Bono por Referir', 'Matching Bonus',
        jsonb_build_object('referred_client_id', _client_id, 'subtotal_cents', _tx.subtotal_cents, 'backfilled', true));
      _inserted := _inserted + 1;
      EXIT; -- one-shot per pair
    END IF;
  END LOOP;

  RETURN _inserted;
END $$;

GRANT EXECUTE ON FUNCTION public.recompute_matching_bonus_for_client(uuid) TO authenticated, service_role;

-- 2) Wrap assign_client_referral to call the helper after attribution
CREATE OR REPLACE FUNCTION public.assign_client_referral(_client_id uuid, _slug text, _link_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner_id uuid;
  _existing record;
  _link_id_resolved uuid;
  _max_paid timestamptz;
BEGIN
  IF _client_id IS NULL OR _slug IS NULL THEN RETURN NULL; END IF;
  _owner_id := public.resolve_referral_slug(_slug);
  IF _owner_id IS NULL THEN RETURN NULL; END IF;

  IF _link_id IS NULL THEN
    SELECT id INTO _link_id_resolved FROM public.referral_links WHERE lower(slug)=lower(trim(_slug)) LIMIT 1;
  ELSE
    _link_id_resolved := _link_id;
  END IF;

  SELECT * INTO _existing FROM public.client_referral_attributions WHERE client_id = _client_id;

  IF _existing IS NULL THEN
    INSERT INTO public.client_referral_attributions
      (client_id, current_referral_owner_id, original_referral_owner_id, original_referral_link_id, attribution_status)
    VALUES (_client_id, _owner_id, _owner_id, _link_id_resolved, 'active');

    INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
    VALUES (_client_id, _owner_id, 'initial_attribution', 'Initial attribution via link');

    INSERT INTO public.referral_payments
      (client_id, appointment_id, transaction_id, referral_owner_id, amount_cents, payment_type, is_tip, source, paid_at)
    SELECT t.client_id, t.appointment_id, t.id, _owner_id,
           COALESCE(t.subtotal_cents, 0),
           CASE WHEN t.type='product' THEN 'product' ELSE 'partial' END,
           false, t.source, COALESCE(t.approved_at, t.created_at)
    FROM public.transactions t
    WHERE t.client_id = _client_id
      AND t.status = 'completed'
    ON CONFLICT DO NOTHING;

    SELECT MAX(COALESCE(approved_at, created_at)) INTO _max_paid
      FROM public.transactions WHERE client_id = _client_id AND status='completed';

    IF _max_paid IS NOT NULL THEN
      UPDATE public.client_referral_attributions
        SET last_payment_at = _max_paid
        WHERE client_id = _client_id;

      INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
      VALUES (_client_id, _owner_id, 'backfill_payments', 'Backfilled prior completed transactions on attribution');
    END IF;

    -- Self-heal matching bonus for referrer
    PERFORM public.recompute_matching_bonus_for_client(_client_id);

    RETURN _owner_id;
  END IF;

  IF _existing.attribution_status = 'reset_available' THEN
    UPDATE public.client_referral_attributions
      SET current_referral_owner_id = _owner_id,
          original_referral_owner_id = _owner_id,
          original_referral_link_id = _link_id_resolved,
          attribution_status = 'active',
          reset_available_at = NULL,
          reallocated_at = NULL,
          reallocation_reason = NULL
      WHERE client_id = _client_id;

    INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
    VALUES (_client_id, _owner_id, 'reattributed_after_reset', 'Re-attribution via link after 90-day reset');

    PERFORM public.recompute_matching_bonus_for_client(_client_id);
    RETURN _owner_id;
  END IF;

  -- Existing attribution unchanged, still try to heal in case the referrer is set but bonus missing
  PERFORM public.recompute_matching_bonus_for_client(_client_id);
  RETURN _existing.current_referral_owner_id;
END $$;

-- 3) Extend resolve_referral_slug to honor renamed slugs via referral_slug_history
CREATE OR REPLACE FUNCTION public.resolve_referral_slug(_slug text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text;
  _link_owner uuid;
  _shop_id uuid;
  _owner record;
  _hops int := 0;
  _hist_owner_type text;
  _hist_owner_id uuid;
  _client_id uuid;
BEGIN
  IF _slug IS NULL THEN RETURN NULL; END IF;
  _norm := lower(trim(_slug));
  IF _norm = '' THEN RETURN NULL; END IF;

  -- 1) active referral_links
  SELECT referral_owner_id INTO _link_owner
  FROM public.referral_links
  WHERE lower(slug) = _norm AND status = 'active'
  LIMIT 1;

  -- 2) referral_owners.slug
  IF _link_owner IS NULL THEN
    SELECT id INTO _link_owner
    FROM public.referral_owners
    WHERE lower(slug) = _norm AND active = true
    LIMIT 1;
  END IF;

  -- 3) clients.referral_slug
  IF _link_owner IS NULL THEN
    SELECT id INTO _client_id FROM public.clients
      WHERE lower(referral_slug) = _norm LIMIT 1;
    IF _client_id IS NOT NULL THEN
      _link_owner := public.ensure_client_referral_owner(_client_id);
    END IF;
  END IF;

  -- 4) referral_slug_history (old slug -> current owner)
  IF _link_owner IS NULL THEN
    SELECT owner_type, owner_id INTO _hist_owner_type, _hist_owner_id
    FROM public.referral_slug_history
    WHERE lower(old_slug) = _norm
    ORDER BY changed_at DESC
    LIMIT 1;
    IF _hist_owner_id IS NOT NULL THEN
      IF _hist_owner_type = 'client' THEN
        _link_owner := public.ensure_client_referral_owner(_hist_owner_id);
      ELSE
        SELECT id INTO _link_owner FROM public.referral_owners
          WHERE owner_profile_id = _hist_owner_id AND owner_type = _hist_owner_type
          LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- 5) last resort: shop owner
  IF _link_owner IS NULL THEN
    SELECT id INTO _shop_id FROM public.referral_owners WHERE owner_type='shop' LIMIT 1;
    RETURN _shop_id;
  END IF;

  -- Follow reroute chain (max 5 hops)
  LOOP
    SELECT * INTO _owner FROM public.referral_owners WHERE id = _link_owner;
    EXIT WHEN _owner.active = true OR _owner.reroute_to_owner_id IS NULL OR _hops >= 5;
    _link_owner := _owner.reroute_to_owner_id;
    _hops := _hops + 1;
  END LOOP;

  IF NOT _owner.active THEN
    SELECT id INTO _shop_id FROM public.referral_owners WHERE owner_type='shop' LIMIT 1;
    RETURN _shop_id;
  END IF;

  RETURN _link_owner;
END $$;

-- 4) One-time backfill: heal every active attribution
DO $$
DECLARE _r record;
BEGIN
  FOR _r IN SELECT client_id FROM public.client_referral_attributions WHERE attribution_status = 'active'
  LOOP
    PERFORM public.recompute_matching_bonus_for_client(_r.client_id);
  END LOOP;
END $$;
