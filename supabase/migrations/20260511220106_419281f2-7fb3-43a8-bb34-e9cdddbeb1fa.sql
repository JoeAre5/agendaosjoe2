CREATE OR REPLACE FUNCTION public.record_referral_conversion(
  _code text,
  _conversion_type text,
  _client_id uuid DEFAULT NULL,
  _landing_url text DEFAULT NULL,
  _utm_source text DEFAULT NULL,
  _utm_medium text DEFAULT NULL,
  _utm_campaign text DEFAULT NULL,
  _appointment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rc record;
  _client_to_use uuid;
  _attr_id uuid;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO _rc FROM public.referral_codes
  WHERE lower(code) = lower(trim(_code)) AND is_active = true
  LIMIT 1;

  IF _rc IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve client: explicit param wins, then appointment lookup, then current authed client
  _client_to_use := _client_id;
  IF _client_to_use IS NULL AND _appointment_id IS NOT NULL THEN
    SELECT client_id INTO _client_to_use FROM public.appointments WHERE id = _appointment_id LIMIT 1;
  END IF;
  IF _client_to_use IS NULL THEN
    _client_to_use := public.get_my_client_id();
  END IF;

  IF _client_to_use IS NULL AND _conversion_type <> 'pwa_install' THEN
    RETURN NULL;
  END IF;

  IF _rc.owner_type = 'client' AND _rc.owner_id = _client_to_use THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.referral_attributions (
    code, referrer_type, referrer_id, referred_client_id, conversion_type,
    landing_url, utm_source, utm_medium, utm_campaign
  ) VALUES (
    _rc.code, _rc.owner_type, _rc.owner_id, _client_to_use, _conversion_type,
    _landing_url, _utm_source, _utm_medium, _utm_campaign
  )
  ON CONFLICT (code, referred_client_id, conversion_type) DO NOTHING
  RETURNING id INTO _attr_id;

  RETURN _attr_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_referral_conversion(text, text, uuid, text, text, text, text, uuid) TO anon, authenticated;