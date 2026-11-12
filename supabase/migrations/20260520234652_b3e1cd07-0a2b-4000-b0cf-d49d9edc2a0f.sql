-- ============================================================
-- 1. APPOINTMENTS: booking source + eligibility columns
-- ============================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booking_source text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS is_rewards_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reward_eligibility_reason text,
  ADD COLUMN IF NOT EXISTS referral_attribution_code text;

CREATE INDEX IF NOT EXISTS idx_appointments_booking_source ON public.appointments(booking_source);
CREATE INDEX IF NOT EXISTS idx_appointments_rewards_eligible ON public.appointments(is_rewards_eligible) WHERE is_rewards_eligible = true;

-- Constrain booking_source to known values (extensible later)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_booking_source_chk'
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_booking_source_chk CHECK (booking_source IN (
        'pwa','public_site','public_referral','admin_manual','barber_manual',
        'walk_in','phone','acuity_sync','post_booking_link','unknown'
      ));
  END IF;
END $$;

-- ============================================================
-- 2. HELPER: compute eligibility from source + client_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_rewards_eligibility(
  _booking_source text,
  _client_id uuid
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  _eligible boolean := false;
  _reason   text := 'unknown_source';
BEGIN
  IF _client_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_client_attached');
  END IF;

  CASE _booking_source
    WHEN 'pwa'             THEN _eligible := true;  _reason := 'pwa_client_booking';
    WHEN 'public_referral' THEN _eligible := true;  _reason := 'referral_link_used';
    WHEN 'public_site'     THEN _eligible := true;  _reason := 'public_site_tracked';
    WHEN 'post_booking_link' THEN _eligible := true; _reason := 'post_booking_linked';
    WHEN 'walk_in'         THEN _eligible := false; _reason := 'walk_in_not_eligible';
    WHEN 'phone'           THEN _eligible := false; _reason := 'phone_booking_not_eligible';
    WHEN 'admin_manual'    THEN _eligible := false; _reason := 'admin_manual_not_eligible';
    WHEN 'barber_manual'   THEN _eligible := false; _reason := 'barber_manual_not_eligible';
    WHEN 'acuity_sync'     THEN _eligible := false; _reason := 'acuity_sync_not_eligible';
    ELSE _eligible := false; _reason := 'unknown_source';
  END CASE;

  RETURN jsonb_build_object('eligible', _eligible, 'reason', _reason);
END $$;

-- ============================================================
-- 3. TRIGGER: stamp eligibility on insert/update
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_appointment_rewards_eligibility()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _r jsonb;
BEGIN
  _r := public.compute_rewards_eligibility(NEW.booking_source, NEW.client_id);
  NEW.is_rewards_eligible := (_r->>'eligible')::boolean;
  NEW.reward_eligibility_reason := _r->>'reason';
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_appt_rewards_eligibility ON public.appointments;
CREATE TRIGGER trg_set_appt_rewards_eligibility
  BEFORE INSERT OR UPDATE OF booking_source, client_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_appointment_rewards_eligibility();

-- ============================================================
-- 4. BACKFILL existing appointments (heuristic)
-- ============================================================
UPDATE public.appointments SET booking_source = CASE
  WHEN acuity_id IS NOT NULL AND created_by_role IS NULL AND client_id IS NULL
    THEN 'acuity_sync'
  WHEN created_by_role = 'client' AND client_id IS NOT NULL
    THEN 'pwa'
  WHEN created_by_role IS NULL AND client_id IS NOT NULL
    THEN 'public_site'
  WHEN created_by_role IN ('admin','owner') AND client_id IS NULL
    THEN 'walk_in'
  WHEN created_by_role IN ('admin','owner')
    THEN 'admin_manual'
  WHEN created_by_role = 'barber'
    THEN 'barber_manual'
  ELSE 'unknown'
END
WHERE booking_source = 'unknown';

-- Re-stamp eligibility for all rows (trigger ran with default values)
UPDATE public.appointments
SET booking_source = booking_source
WHERE booking_source IS NOT NULL;

-- ============================================================
-- 5. REWARDS LEDGER: allow 'launch_bonus' source_type
-- ============================================================
ALTER TABLE public.client_rewards_ledger
  DROP CONSTRAINT IF EXISTS client_rewards_ledger_source_type_check;

ALTER TABLE public.client_rewards_ledger
  ADD CONSTRAINT client_rewards_ledger_source_type_check CHECK (source_type IN (
    'spending','matching_bonus','manual_adjust',
    'refund_reversal','cancellation_reversal','redemption',
    'launch_bonus'
  ));

-- ============================================================
-- 6. POINTS TRIGGER: gate on appointment eligibility
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_client_rewards_from_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client_id uuid := NEW.client_id;
  _points int;
  _is_first_paid boolean;
  _cra record;
  _owner record;
  _referrer_client_id uuid;
  _appt record;
  _eligible boolean := true;
  _reason text := 'pos_no_appointment';
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF _client_id IS NULL THEN RETURN NEW; END IF;

  -- Eligibility gate: if this transaction belongs to an appointment,
  -- the appointment must be flagged eligible. POS / product sales
  -- (no appointment_id) keep earning points like before.
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
    -- Audit-only: log a zero-point row so admins can see WHY it didn't award.
    INSERT INTO public.client_rewards_ledger
      (client_id, points, source_type, source_transaction_id, source_appointment_id,
       description_es, description_en, metadata)
    VALUES (_client_id, 0, 'manual_adjust', NEW.id, NEW.appointment_id,
      'No elegible para puntos', 'Not eligible for points',
      jsonb_build_object('reason', _reason, 'audit_only', true));
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.client_rewards_ledger
             WHERE source_transaction_id = NEW.id AND source_type = 'spending') THEN
    RETURN NEW;
  END IF;

  _points := public.calc_reward_points(COALESCE(NEW.subtotal_cents, 0));
  IF _points > 0 THEN
    INSERT INTO public.client_rewards_ledger
      (client_id, points, source_type, source_transaction_id, source_appointment_id,
       description_es, description_en, metadata)
    VALUES (_client_id, _points, 'spending', NEW.id, NEW.appointment_id,
      'Puntos por compra', 'Points earned',
      jsonb_build_object('subtotal_cents', NEW.subtotal_cents, 'eligibility_reason', _reason));
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

-- ============================================================
-- 7. LAUNCH BONUS: one-time, PWA/portal/tracked clients only
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_launch_bonus_for_active_pwa_clients(
  _lookback_days int DEFAULT 14
) RETURNS TABLE(client_id uuid, points_granted int, appointment_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r record; _points int;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only the owner can grant launch bonus';
  END IF;

  FOR _r IN
    SELECT DISTINCT ON (a.client_id)
      a.client_id,
      a.id AS appt_id,
      COALESCE(a.price_sold_cents, a.price_cents, 0) AS eligible_cents
    FROM public.appointments a
    WHERE a.client_id IS NOT NULL
      AND a.is_rewards_eligible = true
      AND a.status NOT IN ('cancelled')
      AND COALESCE(a.refund_status, '') NOT IN ('refunded','partial')
      AND a.paid = true
      AND a.created_at >= (now() - make_interval(days => _lookback_days))
      AND NOT EXISTS (
        SELECT 1 FROM public.client_rewards_ledger l
        WHERE l.client_id = a.client_id
          AND l.metadata->>'reason' = 'existing_pwa_client_launch_bonus'
      )
    ORDER BY a.client_id, a.created_at DESC
  LOOP
    _points := public.calc_reward_points(_r.eligible_cents);
    IF _points <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.client_rewards_ledger
      (client_id, points, source_type, source_appointment_id,
       description_es, description_en, created_by, metadata)
    VALUES (_r.client_id, _points, 'launch_bonus', _r.appt_id,
      'Bono de lanzamiento por cliente activo', 'Launch bonus for active client',
      auth.uid(),
      jsonb_build_object(
        'reason', 'existing_pwa_client_launch_bonus',
        'appointment_id', _r.appt_id,
        'admin_generated', true,
        'generated_at', now(),
        'eligible_cents', _r.eligible_cents
      ));

    client_id := _r.client_id;
    points_granted := _points;
    appointment_id := _r.appt_id;
    RETURN NEXT;
  END LOOP;
END $$;

-- Allow 'launch_bonus' to count toward the spending breakdown surface in summaries.
-- (No change needed: get_client_rewards_summary already buckets everything via source_type.)
