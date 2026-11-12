
CREATE OR REPLACE FUNCTION public.check_signup_email_status(_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text := lower(trim(_email));
  _client_id uuid;
  _auth_user_id uuid;
  _has_appt boolean;
BEGIN
  IF _normalized IS NULL OR _normalized = '' THEN
    RETURN jsonb_build_object('status', 'new');
  END IF;

  SELECT id, auth_user_id INTO _client_id, _auth_user_id
  FROM public.clients
  WHERE lower(email) = _normalized
  ORDER BY created_at ASC
  LIMIT 1;

  IF _client_id IS NULL THEN
    RETURN jsonb_build_object('status', 'new');
  END IF;

  -- "Has a PWA account" = already linked to auth.users
  IF _auth_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'has_account');
  END IF;

  -- Otherwise legacy/guest client row exists, allow signup to link
  RETURN jsonb_build_object('status', 'link_existing', 'client_id', _client_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_signup_email_status(text) TO anon, authenticated;
