CREATE OR REPLACE FUNCTION public.update_client_referral_slug(_new_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client_id uuid := public.get_my_client_id();
  _current record;
  _check jsonb;
  _owner_id uuid;
  _norm text := lower(trim(_new_slug));
  _last_manual_change timestamptz;
BEGIN
  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'not a client' USING ERRCODE = '42501';
  END IF;

  SELECT id, referral_slug, referral_slug_updated_at
    INTO _current
  FROM public.clients
  WHERE id = _client_id;

  IF _current IS NULL THEN
    RAISE EXCEPTION 'client not found' USING ERRCODE = '42501';
  END IF;

  IF _current.referral_slug = _norm THEN
    RETURN jsonb_build_object('success', true, 'slug', _norm, 'unchanged', true);
  END IF;

  SELECT max(changed_at)
    INTO _last_manual_change
  FROM public.referral_slug_history
  WHERE owner_type = 'client'
    AND owner_id = _client_id;

  IF _last_manual_change IS NOT NULL
     AND _last_manual_change > (now() - interval '30 days') THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'cooldown',
      'slug', _current.referral_slug,
      'current_slug', _current.referral_slug,
      'last_changed_at', _last_manual_change,
      'next_allowed_at', _last_manual_change + interval '30 days'
    );
  END IF;

  _check := public.check_referral_slug_available(_norm, _client_id);
  IF NOT (_check ->> 'available')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', _check ->> 'reason',
      'slug', _current.referral_slug,
      'current_slug', _current.referral_slug
    );
  END IF;

  INSERT INTO public.referral_slug_history (owner_type, owner_id, old_slug, new_slug, changed_by)
  VALUES ('client', _client_id, _current.referral_slug, _norm, auth.uid());

  UPDATE public.clients
  SET referral_slug = _norm,
      referral_slug_updated_at = now()
  WHERE id = _client_id;

  _owner_id := public.ensure_client_referral_owner(_client_id);
  UPDATE public.referral_owners
  SET slug = _norm,
      updated_at = now()
  WHERE id = _owner_id;

  UPDATE public.referral_links
  SET slug = _norm,
      full_url = 'https://charliesbarbershop.co/r/' || _norm,
      updated_at = now()
  WHERE referral_owner_id = _owner_id;

  RETURN jsonb_build_object('success', true, 'slug', _norm);
END
$function$;

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
BEGIN
  _target := COALESCE(_client_id, public.get_my_client_id());
  IF _target IS NULL THEN RAISE EXCEPTION 'no target client'; END IF;
  IF NOT (public.is_owner() OR _target = public.get_my_client_id()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT id, first_name, last_name, referral_slug, referral_slug_updated_at
    INTO _client FROM public.clients WHERE id = _target;

  SELECT max(changed_at)
    INTO _last_slug_change
  FROM public.referral_slug_history
  WHERE owner_type = 'client'
    AND owner_id = _target;

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

  SELECT COALESCE(jsonb_agg(row_to_json(b) ORDER BY (b.required_points)), '[]'::jsonb) INTO _benefits
  FROM (
    SELECT id, title_es, title_en, description_es, description_en, required_points, icon, sort_order,
           _balance >= required_points AS unlocked,
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
    'next_benefit', CASE WHEN _next_benefit IS NULL THEN NULL ELSE
      jsonb_build_object(
        'id', _next_benefit.id,
        'title_es', _next_benefit.title_es,
        'title_en', _next_benefit.title_en,
        'required_points', _next_benefit.required_points,
        'icon', _next_benefit.icon,
        'progress_pct', LEAST(100, (_balance::numeric / _next_benefit.required_points * 100))::int,
        'points_remaining', GREATEST(0, _next_benefit.required_points - _balance)
      ) END,
    'benefits', _benefits,
    'history', _history
  );
END
$function$;