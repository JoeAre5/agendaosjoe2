
ALTER TABLE public.rewards_benefits DROP CONSTRAINT IF EXISTS rewards_benefits_required_points_check;
ALTER TABLE public.rewards_benefits ADD CONSTRAINT rewards_benefits_required_points_check CHECK (required_points >= 0);

ALTER TABLE public.client_benefit_redemptions DROP CONSTRAINT IF EXISTS client_benefit_redemptions_points_cost_check;
ALTER TABLE public.client_benefit_redemptions ADD CONSTRAINT client_benefit_redemptions_points_cost_check CHECK (points_cost >= 0);

ALTER TABLE public.rewards_benefits
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'standard';

CREATE UNIQUE INDEX IF NOT EXISTS rewards_benefits_birthday_singleton
  ON public.rewards_benefits (kind) WHERE kind = 'birthday';

ALTER TABLE public.client_benefit_redemptions
  ADD COLUMN IF NOT EXISTS gift_year int;

CREATE UNIQUE INDEX IF NOT EXISTS client_benefit_redemptions_birthday_year
  ON public.client_benefit_redemptions (client_id, gift_year) WHERE gift_year IS NOT NULL;

INSERT INTO public.rewards_benefits
  (title_es, title_en, description_es, description_en, required_points, icon, is_active, sort_order, kind)
SELECT 'Regalo de cumpleaños', 'Birthday gift',
       'Tu corte gratis de cumpleaños, válido por 30 días.',
       'Your free birthday haircut, valid for 30 days.',
       0, 'cake', true, -1, 'birthday'
WHERE NOT EXISTS (SELECT 1 FROM public.rewards_benefits WHERE kind = 'birthday');

DO $$
DECLARE
  _bday_id uuid;
  _g record;
  _code text;
BEGIN
  SELECT id INTO _bday_id FROM public.rewards_benefits WHERE kind = 'birthday' LIMIT 1;
  IF _bday_id IS NULL THEN RETURN; END IF;

  FOR _g IN
    SELECT g.* FROM public.client_birthday_gifts g
    WHERE NOT EXISTS (
      SELECT 1 FROM public.client_benefit_redemptions r
      WHERE r.client_id = g.client_id AND r.gift_year = g.gift_year
    )
  LOOP
    _code := public._gen_benefit_code();
    INSERT INTO public.client_benefit_redemptions (
      client_id, benefit_id, points_cost, code, claimed_at, expires_at,
      redeemed_at, redeemed_appointment_id, redeemed_by, void_reason, gift_year
    ) VALUES (
      _g.client_id, _bday_id, 0, _code,
      _g.granted_at, _g.expires_at,
      _g.redeemed_at, _g.redeemed_appointment_id, _g.redeemed_by,
      CASE WHEN _g.redeemed_at IS NULL AND _g.expires_at <= now() THEN 'expired' ELSE NULL END,
      _g.gift_year
    );
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.grant_birthday_gifts_today();

CREATE OR REPLACE FUNCTION public.grant_birthday_gifts_today()
RETURNS TABLE(redemption_id uuid, out_client_id uuid, first_name text, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Puerto_Rico')::date;
  v_year  int  := EXTRACT(YEAR FROM v_today)::int;
  v_bday_id uuid;
  v_client record;
  v_code text;
  v_new_id uuid;
BEGIN
  SELECT id INTO v_bday_id FROM public.rewards_benefits WHERE kind = 'birthday' LIMIT 1;
  IF v_bday_id IS NULL THEN RETURN; END IF;

  FOR v_client IN
    SELECT c.id AS client_id, c.first_name
    FROM public.clients c
    WHERE c.date_of_birth IS NOT NULL
      AND EXTRACT(MONTH FROM c.date_of_birth) = EXTRACT(MONTH FROM v_today)
      AND EXTRACT(DAY   FROM c.date_of_birth) = EXTRACT(DAY   FROM v_today)
      AND NOT EXISTS (
        SELECT 1 FROM public.client_benefit_redemptions r
        WHERE r.client_id = c.id AND r.gift_year = v_year
      )
  LOOP
    v_code := public._gen_benefit_code();
    INSERT INTO public.client_benefit_redemptions
      (client_id, benefit_id, points_cost, code, expires_at, gift_year)
    VALUES (v_client.client_id, v_bday_id, 0, v_code,
            (v_today + INTERVAL '30 days')::timestamptz, v_year)
    RETURNING id INTO v_new_id;

    redemption_id := v_new_id;
    out_client_id := v_client.client_id;
    first_name := v_client.first_name;
    code := v_code;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_rewards_summary(_client_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
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
  WHERE is_active = true AND kind = 'standard' AND required_points > _balance
  ORDER BY required_points ASC LIMIT 1;

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
    FROM public.rewards_benefits WHERE is_active = true AND kind = 'standard'
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

CREATE OR REPLACE FUNCTION public.claim_benefit(_benefit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  SELECT id, required_points, title_es, title_en, is_active, kind
    INTO _benefit FROM public.rewards_benefits WHERE id = _benefit_id;
  IF _benefit.id IS NULL OR NOT _benefit.is_active OR _benefit.kind <> 'standard' THEN
    RAISE EXCEPTION 'benefit not available';
  END IF;

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
END $function$;

DROP FUNCTION IF EXISTS public.claim_birthday_gift();
DROP FUNCTION IF EXISTS public.get_active_birthday_gift(uuid);
DROP FUNCTION IF EXISTS public.redeem_birthday_gift(uuid, uuid);
DROP TABLE IF EXISTS public.client_birthday_gifts CASCADE;
