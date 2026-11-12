-- Fix #1: resolve_referral_slug must also accept owner.slug and clients.referral_slug
-- (client-owned referral links never had a row in referral_links, so they
-- were falling through to the shop owner).

CREATE OR REPLACE FUNCTION public.resolve_referral_slug(_slug text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _link_owner uuid;
  _owner record;
  _shop_id uuid;
  _hops int := 0;
  _norm text;
BEGIN
  IF _slug IS NULL OR length(trim(_slug)) = 0 THEN RETURN NULL; END IF;
  _norm := lower(trim(_slug));

  -- 1) canonical referral_links table
  SELECT referral_owner_id INTO _link_owner
  FROM public.referral_links
  WHERE lower(slug) = _norm AND status = 'active'
  LIMIT 1;

  -- 2) fallback: referral_owners.slug (covers client / barber owners that
  --    never had a referral_links row created — most client-customised slugs)
  IF _link_owner IS NULL THEN
    SELECT id INTO _link_owner
    FROM public.referral_owners
    WHERE lower(slug) = _norm AND active = true
    LIMIT 1;
  END IF;

  -- 3) fallback: clients.referral_slug → ensure_client_referral_owner
  IF _link_owner IS NULL THEN
    DECLARE _client_id uuid;
    BEGIN
      SELECT id INTO _client_id FROM public.clients
        WHERE lower(referral_slug) = _norm LIMIT 1;
      IF _client_id IS NOT NULL THEN
        _link_owner := public.ensure_client_referral_owner(_client_id);
      END IF;
    END;
  END IF;

  -- 4) last resort: shop owner
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

-- Fix #2: repair the test case that was just attributed to the shop instead
-- of Ronald.
DO $$
DECLARE
  _client_id uuid := '2715855e-e092-4948-a5b6-f46664d2ee9f';
  _ronald_owner uuid := 'e8e1da80-ec05-48f7-aef3-c9ee91d4ba1b';
  _ronald_client uuid := '1d8129d8-e46b-4048-a3a1-91d82106c4c9';
  _tx record;
  _points int;
BEGIN
  -- Re-point attribution
  UPDATE public.client_referral_attributions
     SET current_referral_owner_id = _ronald_owner,
         original_referral_owner_id = _ronald_owner
   WHERE client_id = _client_id;

  -- Re-point any referral_payments that were misattributed to the shop
  UPDATE public.referral_payments
     SET referral_owner_id = _ronald_owner
   WHERE client_id = _client_id
     AND referral_owner_id IN (SELECT id FROM public.referral_owners WHERE owner_type='shop');

  -- Award matching bonus to Ronald for the first completed tx (idempotent)
  FOR _tx IN
    SELECT id, appointment_id, subtotal_cents
    FROM public.transactions
    WHERE client_id = _client_id AND status='completed'
    ORDER BY COALESCE(approved_at, created_at) ASC LIMIT 1
  LOOP
    _points := public.calc_reward_points(COALESCE(_tx.subtotal_cents, 0));
    IF _points > 0 AND NOT EXISTS (
      SELECT 1 FROM public.client_rewards_ledger
      WHERE source_transaction_id = _tx.id AND source_type = 'matching_bonus'
    ) THEN
      INSERT INTO public.client_rewards_ledger
        (client_id, points, source_type, source_transaction_id, source_appointment_id,
         source_referral_client_id, description_es, description_en, metadata)
      VALUES (_ronald_client, _points, 'matching_bonus', _tx.id, _tx.appointment_id,
        _client_id, 'Bono por Referir', 'Matching Bonus',
        jsonb_build_object('referred_client_id', _client_id,
                           'subtotal_cents', _tx.subtotal_cents,
                           'backfill', true));
    END IF;
  END LOOP;
END $$;