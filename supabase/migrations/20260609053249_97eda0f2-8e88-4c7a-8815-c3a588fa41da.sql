
CREATE OR REPLACE FUNCTION public.get_client_rewards_summary(_client_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _target uuid; _balance int; _spending int; _bonus int; _adjustments int;
  _referrals_count int; _next_benefit record; _benefits jsonb; _history jsonb; _client record;
  _last_slug_change timestamptz; _next_slug_change timestamptz;
  _active_voucher jsonb;
  _active_benefit_id uuid;
  _referees jsonb;
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

  -- Referees with names + matching bonus points they produced for _target
  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY (r.matching_points) DESC, r.first_name), '[]'::jsonb) INTO _referees
  FROM (
    SELECT
      c.id AS client_id,
      c.first_name,
      LEFT(COALESCE(c.last_name, ''), 1) AS last_initial,
      COALESCE((
        SELECT SUM(points)::int FROM public.client_rewards_ledger l
        WHERE l.client_id = _target
          AND l.source_type = 'matching_bonus'
          AND l.source_referral_client_id = c.id
      ), 0) AS matching_points,
      (
        SELECT MAX(created_at) FROM public.client_rewards_ledger l
        WHERE l.client_id = _target
          AND l.source_type = 'matching_bonus'
          AND l.source_referral_client_id = c.id
      ) AS last_bonus_at
    FROM public.client_referral_attributions cra
    JOIN public.referral_owners ro ON ro.id = cra.current_referral_owner_id
    JOIN public.clients c ON c.id = cra.client_id
    WHERE ro.owner_type = 'client' AND ro.owner_profile_id = _target
  ) r;

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
    'referees', _referees,
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
