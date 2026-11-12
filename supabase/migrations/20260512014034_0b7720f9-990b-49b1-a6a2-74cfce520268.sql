-- 1) RPC to link or create a client row at signup time.
--    Called from frontend right after supabase.auth.signUp() succeeds.
--    SECURITY DEFINER so it can update clients.auth_user_id even when
--    the new auth row hasn't propagated everywhere yet.
CREATE OR REPLACE FUNCTION public.link_or_create_client_for_signup(
  _email text,
  _first_name text DEFAULT NULL,
  _last_name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _booking_source text DEFAULT 'signup'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _norm_email text;
  _norm_phone text;
  _matched_id uuid;
  _other_ids uuid[];
  _action text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- If this auth user already has a client row linked, return it (idempotent).
  SELECT id INTO _matched_id FROM public.clients WHERE auth_user_id = _uid LIMIT 1;
  IF _matched_id IS NOT NULL THEN
    RETURN jsonb_build_object('client_id', _matched_id, 'action', 'already_linked');
  END IF;

  _norm_email := nullif(lower(trim(coalesce(_email, ''))), '');
  _norm_phone := public.normalize_phone(_phone);

  -- 1) Email match (case-insensitive) on an unlinked client.
  IF _norm_email IS NOT NULL THEN
    SELECT id INTO _matched_id
    FROM public.clients
    WHERE lower(email) = _norm_email
      AND auth_user_id IS NULL
    ORDER BY total_visits DESC, created_at ASC
    LIMIT 1;
  END IF;

  -- 2) Phone fallback when no email hit.
  IF _matched_id IS NULL AND _norm_phone IS NOT NULL THEN
    SELECT id INTO _matched_id
    FROM public.clients
    WHERE public.normalize_phone(phone) = _norm_phone
      AND auth_user_id IS NULL
    ORDER BY total_visits DESC, created_at ASC
    LIMIT 1;
  END IF;

  IF _matched_id IS NOT NULL THEN
    -- Capture other duplicate emails for owner review.
    IF _norm_email IS NOT NULL THEN
      SELECT array_agg(id) INTO _other_ids
      FROM public.clients
      WHERE lower(email) = _norm_email
        AND auth_user_id IS NULL
        AND id <> _matched_id;
    END IF;

    UPDATE public.clients
    SET auth_user_id = _uid,
        is_guest = false,
        account_verified = true,
        email = COALESCE(NULLIF(email, ''), _email),
        first_name = COALESCE(NULLIF(first_name, ''), _first_name, first_name),
        last_name = COALESCE(NULLIF(last_name, ''), _last_name, last_name),
        updated_at = now()
    WHERE id = _matched_id;

    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      _uid,
      'signup_linked_existing_client',
      'client',
      _matched_id,
      jsonb_build_object(
        'email', _email,
        'matched_by', CASE WHEN _norm_email IS NOT NULL THEN 'email' ELSE 'phone' END,
        'other_duplicates', COALESCE(_other_ids, '{}'::uuid[])
      )
    );

    _action := 'linked';
  ELSE
    INSERT INTO public.clients (
      first_name, last_name, email, phone, auth_user_id,
      is_guest, account_verified, booking_source
    )
    VALUES (
      COALESCE(NULLIF(_first_name, ''), split_part(coalesce(_email, ''), '@', 1)),
      NULLIF(_last_name, ''),
      _email,
      _phone,
      _uid,
      false,
      true,
      _booking_source
    )
    RETURNING id INTO _matched_id;

    _action := 'created';
  END IF;

  RETURN jsonb_build_object('client_id', _matched_id, 'action', _action);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_or_create_client_for_signup(text, text, text, text, text) TO authenticated;

-- 2) Allow recording referral attribution for ANY client (existing or new) on signup,
--    so we attribute returning customers who signed up via a barber's link too.
--    The existing record_referral_conversion already accepts _client_id; nothing to change.
--    The unique key (code, referred_client_id, conversion_type) prevents double counting.