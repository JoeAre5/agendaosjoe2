
CREATE OR REPLACE FUNCTION public.record_client_rewards_from_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client_id uuid := NEW.client_id;
  _points int;
  _is_first_paid boolean;
  _cra record;
  _owner record;
  _referrer_client_id uuid;
  _appt_role text;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF _client_id IS NULL THEN RETURN NEW; END IF;

  -- Only award points when the transaction is tied to an appointment booked from the client portal PWA.
  IF NEW.appointment_id IS NULL THEN RETURN NEW; END IF;
  SELECT created_by_role INTO _appt_role FROM public.appointments WHERE id = NEW.appointment_id;
  IF _appt_role IS DISTINCT FROM 'client_app' THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.client_rewards_ledger
             WHERE source_transaction_id = NEW.id AND source_type = 'spending') THEN
    RETURN NEW;
  END IF;

  _points := public.calc_reward_points(COALESCE(NEW.subtotal_cents, 0));
  IF _points > 0 THEN
    INSERT INTO public.client_rewards_ledger
      (client_id, points, source_type, source_transaction_id, source_appointment_id, description_es, description_en, metadata)
    VALUES (_client_id, _points, 'spending', NEW.id, NEW.appointment_id,
      'Puntos por compra', 'Points earned', jsonb_build_object('subtotal_cents', NEW.subtotal_cents));
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE client_id = _client_id AND status = 'completed' AND id <> NEW.id
  ) INTO _is_first_paid;
  IF NOT _is_first_paid THEN RETURN NEW; END IF;

  SELECT * INTO _cra FROM public.client_referral_attributions WHERE client_id = _client_id;
  IF _cra IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _owner FROM public.referral_owners WHERE id = _cra.current_referral_owner_id;
  IF _owner IS NULL OR _owner.owner_type <> 'client' OR _owner.owner_profile_id IS NULL THEN RETURN NEW; END IF;

  _referrer_client_id := _owner.owner_profile_id;
  IF _referrer_client_id = _client_id THEN RETURN NEW; END IF;

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
