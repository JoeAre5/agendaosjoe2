
-- 1) Make matching bonus self-healing and idempotent (one-shot per referrer/referee pair).
CREATE OR REPLACE FUNCTION public.record_client_rewards_from_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    SELECT is_rewards_eligible, reward_eligibility_reason
      INTO _appt
      FROM public.appointments WHERE id = NEW.appointment_id;
    IF NOT FOUND OR NOT COALESCE(_appt.is_rewards_eligible, false) THEN
      _eligible := false;
      _reason := COALESCE(_appt.reward_eligibility_reason, 'appointment_not_eligible');
    ELSE
      _reason := _appt.reward_eligibility_reason;
    END IF;
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

  -- Matching bonus: one-shot per referrer/referee pair, self-healing.
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
END $function$;

-- 2) Backfill the missing matching bonus for any past completed transactions where
--    the referred client has an active attribution to a client-owner and no matching
--    bonus exists yet for that pair.
WITH eligible_first_tx AS (
  SELECT DISTINCT ON (t.client_id)
    t.id AS tx_id,
    t.client_id AS referee_id,
    t.appointment_id,
    t.subtotal_cents,
    ro.owner_profile_id AS referrer_id
  FROM public.transactions t
  JOIN public.client_referral_attributions cra ON cra.client_id = t.client_id
  JOIN public.referral_owners ro
    ON ro.id = cra.current_referral_owner_id
   AND ro.owner_type = 'client'
   AND ro.owner_profile_id IS NOT NULL
   AND ro.owner_profile_id <> t.client_id
  WHERE t.status = 'completed'
    AND COALESCE(t.subtotal_cents, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.client_rewards_ledger l
      WHERE l.source_type = 'matching_bonus'
        AND l.client_id = ro.owner_profile_id
        AND l.source_referral_client_id = t.client_id
    )
  ORDER BY t.client_id, t.created_at ASC
)
INSERT INTO public.client_rewards_ledger
  (client_id, points, source_type, source_transaction_id, source_appointment_id, source_referral_client_id,
   description_es, description_en, metadata)
SELECT
  e.referrer_id,
  public.calc_reward_points(e.subtotal_cents),
  'matching_bonus',
  e.tx_id,
  e.appointment_id,
  e.referee_id,
  'Bono por Referir',
  'Matching Bonus',
  jsonb_build_object('referred_client_id', e.referee_id, 'subtotal_cents', e.subtotal_cents, 'backfilled', true)
FROM eligible_first_tx e
WHERE public.calc_reward_points(e.subtotal_cents) > 0;
