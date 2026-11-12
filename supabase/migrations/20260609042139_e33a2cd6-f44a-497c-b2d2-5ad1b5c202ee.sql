CREATE OR REPLACE FUNCTION public.record_referral_payment_from_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cra record;
  _service_cents int;
  _payment_type text;
  _paid_at timestamptz;
  _client_id uuid;
  _owner_id uuid;
  _streak record;
  _new_count int;
  _appt record;
BEGIN
  -- Only act when status transitions to completed.
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'completed' THEN RETURN NEW; END IF;

  _client_id := NEW.client_id;
  IF _client_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _cra FROM public.client_referral_attributions WHERE client_id = _client_id;
  IF _cra IS NULL THEN RETURN NEW; END IF;
  _owner_id := _cra.current_referral_owner_id;

  _paid_at := COALESCE(NEW.approved_at, NEW.created_at);
  _service_cents := COALESCE(NEW.subtotal_cents, 0);  -- excludes tip per schema

  -- Determine payment type without referencing removed appointment columns.
  IF NEW.type = 'product' THEN
    _payment_type := 'product';
  ELSIF NEW.appointment_id IS NOT NULL THEN
    SELECT id, amount_paid_cents, price_cents INTO _appt
    FROM public.appointments
    WHERE id = NEW.appointment_id;

    IF _appt.id IS NOT NULL
       AND COALESCE(_appt.price_cents, 0) > 0
       AND COALESCE(_appt.amount_paid_cents, _service_cents) >= COALESCE(_appt.price_cents, 0) THEN
      _payment_type := 'full_balance';
    ELSE
      _payment_type := 'partial';
    END IF;
  ELSE
    _payment_type := 'partial';
  END IF;

  -- Insert payment row (idempotent on transaction_id + payment_type where constraints exist).
  INSERT INTO public.referral_payments
    (client_id, appointment_id, transaction_id, referral_owner_id, amount_cents, payment_type, is_tip, source, paid_at)
  VALUES
    (_client_id, NEW.appointment_id, NEW.id, _owner_id, _service_cents, _payment_type, false, NEW.source, _paid_at)
  ON CONFLICT DO NOTHING;

  -- Activity log.
  INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description, metadata)
  VALUES (_client_id, _owner_id, 'payment_recorded',
    format('%s cents recorded (%s)', _service_cents, _payment_type),
    jsonb_build_object('tx_id', NEW.id, 'amount_cents', _service_cents, 'type', _payment_type));

  -- Update last_payment_at on attribution.
  UPDATE public.client_referral_attributions
    SET last_payment_at = _paid_at,
        reset_available_at = NULL,
        attribution_status = CASE WHEN attribution_status = 'reset_available' THEN 'active' ELSE attribution_status END
    WHERE client_id = _client_id;

  -- 5-consecutive-paid-booking reallocation logic (only for service payments tied to an appt).
  IF NEW.appointment_id IS NOT NULL AND NEW.barber_id IS NOT NULL AND NEW.type <> 'product' THEN
    DECLARE owner_barber_id uuid;
    BEGIN
      SELECT owner_profile_id INTO owner_barber_id
      FROM public.referral_owners
      WHERE id = _owner_id AND owner_type = 'barber';

      IF owner_barber_id IS DISTINCT FROM NEW.barber_id THEN
        SELECT * INTO _streak FROM public.referral_reallocation_progress WHERE client_id = _client_id;
        IF _streak IS NULL THEN
          INSERT INTO public.referral_reallocation_progress (client_id, barber_id, consecutive_count, last_paid_at)
          VALUES (_client_id, NEW.barber_id, 1, _paid_at);
          _new_count := 1;
        ELSIF _streak.barber_id = NEW.barber_id THEN
          UPDATE public.referral_reallocation_progress
            SET consecutive_count = consecutive_count + 1, last_paid_at = _paid_at, updated_at = now()
            WHERE client_id = _client_id
            RETURNING consecutive_count INTO _new_count;
        ELSE
          UPDATE public.referral_reallocation_progress
            SET barber_id = NEW.barber_id, consecutive_count = 1, last_paid_at = _paid_at, updated_at = now()
            WHERE client_id = _client_id
            RETURNING consecutive_count INTO _new_count;
        END IF;

        IF _new_count >= 5 THEN
          DECLARE new_owner uuid;
          BEGIN
            SELECT id INTO new_owner
            FROM public.referral_owners
            WHERE owner_type = 'barber' AND owner_profile_id = NEW.barber_id AND active = true
            LIMIT 1;

            IF new_owner IS NOT NULL THEN
              UPDATE public.client_referral_attributions
                SET current_referral_owner_id = new_owner,
                    attribution_status = 'reallocated',
                    reallocated_at = now(),
                    reallocation_reason = '5_paid_consecutive_bookings'
                WHERE client_id = _client_id;

              INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description, metadata)
              VALUES (_client_id, new_owner, 'reallocated_after_5_paid_bookings',
                'Atribución reasignada por 5 reservas consecutivas pagadas',
                jsonb_build_object('previous_owner_id', _owner_id, 'new_barber_id', NEW.barber_id));

              DELETE FROM public.referral_reallocation_progress WHERE client_id = _client_id;
            END IF;
          END;
        END IF;
      ELSE
        DELETE FROM public.referral_reallocation_progress WHERE client_id = _client_id;
      END IF;
    END;
  END IF;

  RETURN NEW;
END $$;

-- Preserve PWA/public eligibility for paid appointments that came through native flows.
UPDATE public.appointments
SET booking_source = CASE
      WHEN created_by_role = 'client_app' THEN 'pwa'
      WHEN created_by_role = 'public_site' THEN 'public_site'
      ELSE booking_source
    END
WHERE created_by_role IN ('client_app', 'public_site')
  AND booking_source IN ('unknown', 'acuity_sync', 'public_site', 'pwa');

-- Backfill completed transactions that were missing because the trigger failure aborted the insert.
INSERT INTO public.transactions (
  barber_id,
  client_id,
  appointment_id,
  type,
  payment_method,
  subtotal_cents,
  tip_cents,
  total_cents,
  status,
  stripe_payment_id,
  paypal_order_id,
  athmovil_transaction_id,
  stripe_payment_method_type,
  source,
  notes,
  created_at
)
SELECT
  a.barber_id,
  a.client_id,
  a.id,
  'service',
  COALESCE(a.payment_method, 'stripe'),
  GREATEST(0, COALESCE(a.amount_paid_cents, a.price_cents, 0) - COALESCE(a.tip_cents, 0)),
  COALESCE(a.tip_cents, 0),
  COALESCE(a.amount_paid_cents, a.price_cents, 0),
  'completed',
  CASE WHEN a.payment_method = 'stripe' THEN a.payment_reference_id ELSE NULL END,
  CASE WHEN a.payment_method = 'paypal' THEN a.payment_reference_id ELSE NULL END,
  CASE WHEN a.payment_method = 'ath_movil' THEN a.payment_reference_id ELSE NULL END,
  a.stripe_payment_method_type,
  CASE WHEN a.created_by_role = 'client_app' THEN 'client_app' ELSE 'public_booking' END,
  'Backfilled paid booking transaction after trigger repair',
  COALESCE(a.created_at, now())
FROM public.appointments a
WHERE a.client_id IS NOT NULL
  AND COALESCE(a.amount_paid_cents, a.price_cents, 0) > 0
  AND (a.paid = true OR a.payment_confirmed = true)
  AND a.created_by_role IN ('client_app', 'public_site')
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.appointment_id = a.id
      AND t.type = 'service'
      AND t.status = 'completed'
  );