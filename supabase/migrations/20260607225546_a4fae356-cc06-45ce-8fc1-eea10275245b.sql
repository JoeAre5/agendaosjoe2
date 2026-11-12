
-- ============================================================
-- 1) TABLE: client_benefit_redemptions
-- ============================================================
CREATE TABLE public.client_benefit_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  benefit_id uuid NOT NULL REFERENCES public.rewards_benefits(id) ON DELETE RESTRICT,
  points_cost integer NOT NULL CHECK (points_cost > 0),
  code text NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  redeemed_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  redeemed_by uuid,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cbr_client ON public.client_benefit_redemptions(client_id, claimed_at DESC);
CREATE INDEX idx_cbr_active ON public.client_benefit_redemptions(client_id) WHERE redeemed_at IS NULL AND void_reason IS NULL;
CREATE INDEX idx_cbr_code ON public.client_benefit_redemptions(code);

GRANT SELECT ON public.client_benefit_redemptions TO authenticated;
GRANT ALL ON public.client_benefit_redemptions TO service_role;

ALTER TABLE public.client_benefit_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cbr client read self" ON public.client_benefit_redemptions
  FOR SELECT TO authenticated
  USING (public.is_client() AND client_id = public.get_my_client_id());

CREATE POLICY "cbr owner full" ON public.client_benefit_redemptions
  FOR ALL TO authenticated
  USING (public.is_owner()) WITH CHECK (public.is_owner());

CREATE TRIGGER trg_cbr_updated BEFORE UPDATE ON public.client_benefit_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) APPOINTMENTS column
-- ============================================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS applied_benefit_redemption_id uuid
  REFERENCES public.client_benefit_redemptions(id) ON DELETE SET NULL;

-- ============================================================
-- 3) CODE GENERATOR
-- ============================================================
CREATE OR REPLACE FUNCTION public._gen_benefit_code()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  _code text;
  _exists boolean;
  _i int;
BEGIN
  LOOP
    _code := '';
    FOR _i IN 1..6 LOOP
      _code := _code || substr(_alpha, 1 + floor(random()*length(_alpha))::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.client_benefit_redemptions WHERE code = _code) INTO _exists;
    EXIT WHEN NOT _exists;
  END LOOP;
  RETURN _code;
END $$;

-- ============================================================
-- 4) RPC: claim_benefit
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_benefit(_benefit_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client_id uuid;
  _benefit record;
  _balance int;
  _existing_active uuid;
  _code text;
  _expires timestamptz;
  _new_id uuid;
BEGIN
  _client_id := public.get_my_client_id();
  IF _client_id IS NULL THEN RAISE EXCEPTION 'no client'; END IF;

  SELECT id, required_points, title_es, title_en, is_active
    INTO _benefit FROM public.rewards_benefits WHERE id = _benefit_id;
  IF _benefit.id IS NULL OR NOT _benefit.is_active THEN
    RAISE EXCEPTION 'benefit not available';
  END IF;

  -- Block stacking: only one active voucher at a time
  SELECT id INTO _existing_active FROM public.client_benefit_redemptions
   WHERE client_id = _client_id AND redeemed_at IS NULL AND void_reason IS NULL
   LIMIT 1;
  IF _existing_active IS NOT NULL THEN
    RAISE EXCEPTION 'active_voucher_exists';
  END IF;

  SELECT COALESCE(SUM(points),0)::int INTO _balance
    FROM public.client_rewards_ledger WHERE client_id = _client_id;
  IF _balance < _benefit.required_points THEN
    RAISE EXCEPTION 'insufficient_points';
  END IF;

  _code := public._gen_benefit_code();
  _expires := now() + interval '30 days';

  INSERT INTO public.client_benefit_redemptions
    (client_id, benefit_id, points_cost, code, expires_at)
    VALUES (_client_id, _benefit.id, _benefit.required_points, _code, _expires)
    RETURNING id INTO _new_id;

  INSERT INTO public.client_rewards_ledger
    (client_id, points, source_type, description_es, description_en, metadata)
  VALUES (
    _client_id, -_benefit.required_points, 'redemption',
    'Canje de beneficio: ' || _benefit.title_es,
    'Benefit redemption: ' || _benefit.title_en,
    jsonb_build_object('redemption_id', _new_id, 'benefit_id', _benefit.id, 'code', _code)
  );

  RETURN jsonb_build_object(
    'id', _new_id, 'code', _code, 'expires_at', _expires,
    'benefit_id', _benefit.id, 'points_cost', _benefit.required_points
  );
END $$;

GRANT EXECUTE ON FUNCTION public.claim_benefit(uuid) TO authenticated;

-- ============================================================
-- 5) RPC: get_active_benefit_voucher
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_benefit_voucher(_client_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _target uuid;
  _row jsonb;
BEGIN
  _target := COALESCE(_client_id, public.get_my_client_id());
  IF _target IS NULL THEN RETURN NULL; END IF;
  IF NOT (public.is_owner() OR _target = public.get_my_client_id()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(v) INTO _row FROM (
    SELECT r.id, r.code, r.points_cost, r.claimed_at, r.expires_at,
           r.benefit_id, b.title_es, b.title_en, b.icon
    FROM public.client_benefit_redemptions r
    JOIN public.rewards_benefits b ON b.id = r.benefit_id
    WHERE r.client_id = _target
      AND r.redeemed_at IS NULL
      AND r.void_reason IS NULL
      AND r.expires_at > now()
    ORDER BY r.claimed_at DESC LIMIT 1
  ) v;
  RETURN _row;
END $$;

GRANT EXECUTE ON FUNCTION public.get_active_benefit_voucher(uuid) TO authenticated;

-- ============================================================
-- 6) RPC: apply_benefit_code  (attach to an appointment)
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_benefit_code(_code text, _appointment_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _voucher record;
  _appt record;
  _caller_client_id uuid;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;
  _code := upper(trim(_code));

  SELECT * INTO _voucher FROM public.client_benefit_redemptions WHERE code = _code;
  IF _voucher.id IS NULL THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF _voucher.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'code_already_redeemed'; END IF;
  IF _voucher.void_reason IS NOT NULL OR _voucher.expires_at <= now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  SELECT id, client_id INTO _appt FROM public.appointments WHERE id = _appointment_id;
  IF _appt.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF _appt.client_id IS DISTINCT FROM _voucher.client_id THEN
    RAISE EXCEPTION 'code_belongs_to_other_client';
  END IF;

  -- Permission: owner, any barber (staff), or the voucher owner herself
  _caller_client_id := public.get_my_client_id();
  IF NOT (
    public.is_owner()
    OR public.has_role(auth.uid(), 'barber'::app_role)
    OR _caller_client_id = _voucher.client_id
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.appointments
     SET applied_benefit_redemption_id = _voucher.id
   WHERE id = _appt.id;

  RETURN jsonb_build_object(
    'redemption_id', _voucher.id,
    'benefit_id', _voucher.benefit_id,
    'expires_at', _voucher.expires_at
  );
END $$;

GRANT EXECUTE ON FUNCTION public.apply_benefit_code(text, uuid) TO authenticated;

-- ============================================================
-- 7) RPC: redeem_benefit_code  (mark redeemed at checkout)
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_benefit_code(
  _code text,
  _appointment_id uuid,
  _transaction_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _voucher record;
BEGIN
  IF NOT (public.is_owner() OR public.has_role(auth.uid(), 'barber'::app_role)) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  _code := upper(trim(_code));
  SELECT * INTO _voucher FROM public.client_benefit_redemptions WHERE code = _code FOR UPDATE;
  IF _voucher.id IS NULL THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF _voucher.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'code_already_redeemed'; END IF;
  IF _voucher.void_reason IS NOT NULL OR _voucher.expires_at <= now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  UPDATE public.client_benefit_redemptions
     SET redeemed_at = now(),
         redeemed_appointment_id = _appointment_id,
         redeemed_transaction_id = _transaction_id,
         redeemed_by = auth.uid()
   WHERE id = _voucher.id;

  RETURN jsonb_build_object('redemption_id', _voucher.id, 'redeemed_at', now());
END $$;

GRANT EXECUTE ON FUNCTION public.redeem_benefit_code(text, uuid, uuid) TO authenticated;

-- ============================================================
-- 8) RPC: expire_pending_benefit_redemptions
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_pending_benefit_redemptions()
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _n int;
BEGIN
  UPDATE public.client_benefit_redemptions
     SET void_reason = 'expired'
   WHERE redeemed_at IS NULL AND void_reason IS NULL AND expires_at <= now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

GRANT EXECUTE ON FUNCTION public.expire_pending_benefit_redemptions() TO service_role;

-- ============================================================
-- 9) UPDATE get_client_rewards_summary: add active_voucher + has_active_voucher per benefit
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_client_rewards_summary(_client_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $function$
DECLARE
  _target uuid; _balance int; _spending int; _bonus int; _adjustments int;
  _referrals_count int; _next_benefit record; _benefits jsonb; _history jsonb; _client record;
  _last_slug_change timestamptz; _next_slug_change timestamptz;
  _active_voucher jsonb;
  _active_benefit_id uuid;
BEGIN
  _target := COALESCE(_client_id, public.get_my_client_id());
  IF _target IS NULL THEN RAISE EXCEPTION 'no target client'; END IF;
  IF NOT (public.is_owner() OR _target = public.get_my_client_id()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT id, first_name, last_name, referral_slug, referral_slug_updated_at
    INTO _client FROM public.clients WHERE id = _target;

  SELECT max(changed_at) INTO _last_slug_change
  FROM public.referral_slug_history
  WHERE owner_type = 'client' AND owner_id = _target;
  IF _last_slug_change IS NOT NULL THEN
    _next_slug_change := _last_slug_change + interval '30 days';
  END IF;

  SELECT COALESCE(SUM(points), 0)::int,
         COALESCE(SUM(points) FILTER (WHERE source_type IN ('spending','refund_reversal','cancellation_reversal')), 0)::int,
         COALESCE(SUM(points) FILTER (WHERE source_type = 'matching_bonus'), 0)::int,
         COALESCE(SUM(points) FILTER (WHERE source_type IN ('manual_adjust','redemption')), 0)::int
  INTO _balance, _spending, _bonus, _adjustments
  FROM public.client_rewards_ledger WHERE client_id = _target;

  SELECT count(*)::int INTO _referrals_count
  FROM public.client_referral_attributions cra
  JOIN public.referral_owners ro ON ro.id = cra.current_referral_owner_id
  WHERE ro.owner_type = 'client' AND ro.owner_profile_id = _target;

  SELECT id, title_es, title_en, required_points, icon INTO _next_benefit
  FROM public.rewards_benefits
  WHERE is_active = true AND required_points > _balance
  ORDER BY required_points ASC LIMIT 1;

  -- Active voucher
  _active_voucher := public.get_active_benefit_voucher(_target);
  IF _active_voucher IS NOT NULL THEN
    _active_benefit_id := (_active_voucher->>'benefit_id')::uuid;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(b) ORDER BY (b.required_points)), '[]'::jsonb) INTO _benefits
  FROM (
    SELECT id, title_es, title_en, description_es, description_en, required_points, icon, sort_order,
           _balance >= required_points AS unlocked,
           (id = _active_benefit_id) AS has_active_voucher,
           LEAST(100, GREATEST(0, (_balance::numeric / NULLIF(required_points,0) * 100)))::int AS progress_pct
    FROM public.rewards_benefits WHERE is_active = true
    ORDER BY sort_order, required_points
  ) b;

  SELECT COALESCE(jsonb_agg(row_to_json(h) ORDER BY (h.created_at) DESC), '[]'::jsonb) INTO _history
  FROM (
    SELECT id, points, source_type, description_es, description_en, created_at
    FROM public.client_rewards_ledger WHERE client_id = _target
    ORDER BY created_at DESC LIMIT 10
  ) h;

  RETURN jsonb_build_object(
    'client_id', _target,
    'first_name', _client.first_name,
    'referral_slug', _client.referral_slug,
    'referral_slug_updated_at', _last_slug_change,
    'referral_slug_next_allowed_at', _next_slug_change,
    'referral_slug_can_change', (_last_slug_change IS NULL OR _next_slug_change <= now()),
    'balance', _balance,
    'breakdown', jsonb_build_object('spending', _spending, 'matching_bonus', _bonus, 'adjustments', _adjustments),
    'referrals_count', _referrals_count,
    'active_voucher', _active_voucher,
    'next_benefit', CASE WHEN _next_benefit IS NULL THEN NULL ELSE
      jsonb_build_object(
        'id', _next_benefit.id,
        'title_es', _next_benefit.title_es,
        'title_en', _next_benefit.title_en,
        'required_points', _next_benefit.required_points,
        'icon', _next_benefit.icon,
        'remaining', GREATEST(0, _next_benefit.required_points - _balance)
      ) END,
    'benefits', _benefits,
    'history', _history
  );
END $function$;
