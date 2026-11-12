-- Backfill referral attribution for the test booking made by "Referido de Ronald"
-- via Ronald's link, which was missed because the client side called
-- recordReferralConversion with clientId=null. Also award the matching bonus
-- (Ronald) and the spending points (the referred client) for the $1 tx that
-- already committed, since the rewards trigger only fires on INSERT/UPDATE.

DO $$
DECLARE
  _client_id uuid := '2715855e-e092-4948-a5b6-f46664d2ee9f';
  _owner_id uuid;
  _referrer_client_id uuid;
  _tx record;
  _points int;
BEGIN
  -- Create attribution + backfill referral_payments via existing RPC
  SELECT public.assign_client_referral(_client_id, 'ronald', NULL) INTO _owner_id;
  IF _owner_id IS NULL THEN
    RAISE NOTICE 'No owner resolved for slug=ronald, aborting';
    RETURN;
  END IF;

  -- Resolve referrer's client_id (owner_profile_id of a client-type owner)
  SELECT owner_profile_id INTO _referrer_client_id
    FROM public.referral_owners
    WHERE id = _owner_id AND owner_type = 'client';

  -- For every completed transaction by this client that is missing the
  -- spending / matching-bonus ledger rows, insert them now.
  FOR _tx IN
    SELECT id, appointment_id, subtotal_cents
    FROM public.transactions
    WHERE client_id = _client_id AND status = 'completed'
  LOOP
    _points := public.calc_reward_points(COALESCE(_tx.subtotal_cents, 0));
    IF _points <= 0 THEN CONTINUE; END IF;

    -- Spending points for the referred client
    IF NOT EXISTS (
      SELECT 1 FROM public.client_rewards_ledger
      WHERE source_transaction_id = _tx.id AND source_type = 'spending'
    ) THEN
      INSERT INTO public.client_rewards_ledger
        (client_id, points, source_type, source_transaction_id, source_appointment_id,
         description_es, description_en, metadata)
      VALUES (_client_id, _points, 'spending', _tx.id, _tx.appointment_id,
        'Puntos por compra', 'Points earned',
        jsonb_build_object('subtotal_cents', _tx.subtotal_cents, 'backfill', true));
    END IF;

    -- Matching bonus for the referrer (Ronald), only on the referred client's
    -- first completed transaction.
    IF _referrer_client_id IS NOT NULL
       AND _referrer_client_id <> _client_id
       AND NOT EXISTS (
         SELECT 1 FROM public.client_rewards_ledger
         WHERE source_transaction_id = _tx.id AND source_type = 'matching_bonus'
       )
       AND _tx.id = (
         SELECT id FROM public.transactions
         WHERE client_id = _client_id AND status = 'completed'
         ORDER BY COALESCE(approved_at, created_at) ASC LIMIT 1
       )
    THEN
      INSERT INTO public.client_rewards_ledger
        (client_id, points, source_type, source_transaction_id, source_appointment_id,
         source_referral_client_id, description_es, description_en, metadata)
      VALUES (_referrer_client_id, _points, 'matching_bonus', _tx.id, _tx.appointment_id,
        _client_id, 'Bono por Referir', 'Matching Bonus',
        jsonb_build_object('referred_client_id', _client_id,
                           'subtotal_cents', _tx.subtotal_cents,
                           'backfill', true));
    END IF;
  END LOOP;
END $$;