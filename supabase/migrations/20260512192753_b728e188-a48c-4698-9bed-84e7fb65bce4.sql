CREATE OR REPLACE FUNCTION public.get_client_referral_network(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _upline jsonb := NULL;
  _downlines jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner required';
  END IF;

  -- UPLINE: who referred this client (first attribution wins)
  SELECT jsonb_build_object(
    'referrer_type', ra.referrer_type,
    'referrer_id', ra.referrer_id,
    'code', ra.code,
    'conversion_type', ra.conversion_type,
    'attributed_at', ra.created_at,
    'name', CASE
      WHEN ra.referrer_type = 'barber' THEN (SELECT b.name FROM public.barbers b WHERE b.id = ra.referrer_id)
      WHEN ra.referrer_type = 'client' THEN (
        SELECT trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))
        FROM public.clients c WHERE c.id = ra.referrer_id
      )
      WHEN ra.referrer_type = 'shop' THEN 'Shop'
      ELSE NULL
    END
  )
  INTO _upline
  FROM public.referral_attributions ra
  WHERE ra.referred_client_id = _client_id
  ORDER BY ra.created_at ASC
  LIMIT 1;

  -- DOWNLINES: clients this user referred (via any of their owned codes)
  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
  INTO _downlines
  FROM (
    SELECT
      c.id AS client_id,
      trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) AS name,
      c.email,
      c.phone,
      c.total_visits,
      c.total_spent_cents,
      MIN(ra.created_at) AS first_attribution_at,
      array_agg(DISTINCT ra.conversion_type) AS conversions,
      array_agg(DISTINCT ra.code) AS codes
    FROM public.referral_codes rc
    JOIN public.referral_attributions ra ON lower(ra.code) = lower(rc.code)
    JOIN public.clients c ON c.id = ra.referred_client_id
    WHERE rc.owner_type = 'client' AND rc.owner_id = _client_id
    GROUP BY c.id, c.first_name, c.last_name, c.email, c.phone, c.total_visits, c.total_spent_cents
    ORDER BY MIN(ra.created_at) DESC
  ) d;

  RETURN jsonb_build_object('upline', _upline, 'downlines', _downlines);
END;
$function$;