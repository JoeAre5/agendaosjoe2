
-- Rewards trigger: only award points when booking_source = 'pwa'
CREATE OR REPLACE FUNCTION public.record_client_rewards_from_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_id uuid := NEW.client_id;
  _points int;
  _cra record;
  _owner record;
  _referrer_client_id uuid;
  _appt record;
  _eligible boolean := true;
  _reason text := 'pos_no_appointment';
  _already_matched boolean;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF _client_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.appointment_id IS NOT NULL THEN
    SELECT is_rewards_eligible, reward_eligibility_reason, booking_source
      INTO _appt
      FROM public.appointments WHERE id = NEW.appointment_id;
    IF NOT FOUND OR NOT COALESCE(_appt.is_rewards_eligible, false) THEN
      _eligible := false;
      _reason := COALESCE(_appt.reward_eligibility_reason, 'appointment_not_eligible');
    ELSIF COALESCE(_appt.booking_source, '') <> 'pwa' THEN
      _eligible := false;
      _reason := 'not_pwa_booking';
    ELSE
      _reason := _appt.reward_eligibility_reason;
    END IF;
  ELSE
    -- POS-only transactions (no appointment) are not eligible under PWA-only rule
    _eligible := false;
    _reason := 'pos_no_appointment';
  END IF;

  IF NOT _eligible THEN
    INSERT INTO public.client_rewards_ledger
      (client_id, points, source_type, source_transaction_id, source_appointment_id,
       description_es, description_en, metadata)
    VALUES (_client_id, 0, 'manual_adjust', NEW.id, NEW.appointment_id,
      'No elegible para puntos', 'Not eligible for points',
      jsonb_build_object('reason', _reason, 'audit_only', true));
    RETURN NEW;
  END IF;

  -- Spending points (idempotent per transaction)
  IF NOT EXISTS (SELECT 1 FROM public.client_rewards_ledger
                 WHERE source_transaction_id = NEW.id AND source_type = 'spending') THEN
    _points := public.calc_reward_points(COALESCE(NEW.subtotal_cents, 0));
    IF _points > 0 THEN
      INSERT INTO public.client_rewards_ledger
        (client_id, points, source_type, source_transaction_id, source_appointment_id,
         description_es, description_en, metadata)
      VALUES (_client_id, _points, 'spending', NEW.id, NEW.appointment_id,
        'Puntos por compra', 'Points earned',
        jsonb_build_object('subtotal_cents', NEW.subtotal_cents, 'eligibility_reason', _reason));
    END IF;
  END IF;

  -- Matching bonus: one-shot per referrer/referee pair
  SELECT * INTO _cra FROM public.client_referral_attributions WHERE client_id = _client_id;
  IF _cra IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _owner FROM public.referral_owners WHERE id = _cra.current_referral_owner_id;
  IF _owner IS NULL OR _owner.owner_type <> 'client' OR _owner.owner_profile_id IS NULL THEN
    RETURN NEW;
  END IF;
  _referrer_client_id := _owner.owner_profile_id;
  IF _referrer_client_id = _client_id THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.client_rewards_ledger
    WHERE source_type = 'matching_bonus'
      AND client_id = _referrer_client_id
      AND source_referral_client_id = _client_id
  ) INTO _already_matched;

  IF _already_matched THEN RETURN NEW; END IF;

  _points := public.calc_reward_points(COALESCE(NEW.subtotal_cents, 0));
  IF _points > 0 THEN
    INSERT INTO public.client_rewards_ledger
      (client_id, points, source_type, source_transaction_id, source_appointment_id, source_referral_client_id,
       description_es, description_en, metadata)
    VALUES (_referrer_client_id, _points, 'matching_bonus', NEW.id, NEW.appointment_id, _client_id,
      'Bono por Referir', 'Matching Bonus',
      jsonb_build_object('referred_client_id', _client_id, 'subtotal_cents', NEW.subtotal_cents));
  END IF;
  RETURN NEW;
END $$;

-- Self-heal helper: same PWA-only rule
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

  SELECT EXISTS (
    SELECT 1 FROM public.client_rewards_ledger
    WHERE source_type = 'matching_bonus'
      AND client_id = _referrer_client_id
      AND source_referral_client_id = _client_id
  ) INTO _already;
  IF _already THEN RETURN 0; END IF;

  FOR _tx IN
    SELECT t.* FROM public.transactions t
    WHERE t.client_id = _client_id
      AND t.status = 'completed'
      AND t.appointment_id IS NOT NULL
    ORDER BY COALESCE(t.approved_at, t.created_at) ASC
  LOOP
    SELECT is_rewards_eligible, booking_source INTO _appt
      FROM public.appointments WHERE id = _tx.appointment_id;
    IF NOT FOUND
       OR NOT COALESCE(_appt.is_rewards_eligible, false)
       OR COALESCE(_appt.booking_source, '') <> 'pwa' THEN
      CONTINUE;
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
      EXIT;
    END IF;
  END LOOP;

  RETURN _inserted;
END $$;
