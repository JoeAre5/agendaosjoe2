
-- 1. Dormant column for future Friends & Family attribution
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS booked_for_member_id uuid;

-- 2. Audit timestamp on clients (when a profile absorbs a re-linked appointment)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS last_relink_at timestamptz;

-- 3. find_matching_client: returns the single best matching profile.
-- Null-safe: empty inputs never match.
CREATE OR REPLACE FUNCTION public.find_matching_client(
  _phone text,
  _email text
)
RETURNS TABLE (client_id uuid, match_type text, display_name text, email text, phone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text := NULLIF(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), '');
  v_phone10 text := CASE
    WHEN v_phone IS NULL THEN NULL
    ELSE right(v_phone, 10)
  END;
  v_email text := NULLIF(lower(trim(coalesce(_email, ''))), '');
BEGIN
  IF v_phone10 IS NULL AND v_email IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, 'none'::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      c.id,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      (v_email IS NOT NULL AND lower(trim(c.email)) = v_email) AS email_hit,
      (v_phone10 IS NOT NULL AND right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_phone10
        AND length(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')) >= 7) AS phone_hit
    FROM public.clients c
    WHERE
      (v_email IS NOT NULL AND lower(trim(c.email)) = v_email)
      OR (v_phone10 IS NOT NULL AND right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) = v_phone10
          AND length(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')) >= 7)
  )
  SELECT
    s.id,
    CASE
      WHEN s.email_hit AND s.phone_hit THEN 'both'
      WHEN s.email_hit THEN 'email'
      WHEN s.phone_hit THEN 'phone'
      ELSE 'none'
    END AS match_type,
    btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) AS display_name,
    s.email,
    s.phone
  FROM scored s
  ORDER BY
    (CASE WHEN s.email_hit AND s.phone_hit THEN 0
          WHEN s.email_hit THEN 1
          WHEN s.phone_hit THEN 2
          ELSE 3 END)
  LIMIT 1;

  -- If no rows, return explicit none row
  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, 'none'::text, NULL::text, NULL::text, NULL::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.find_matching_client(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_matching_client(text, text) TO authenticated, anon, service_role;

-- 4. relink_appointment: owner/barber only. Re-points an appointment to a target profile,
-- overwriting display name + contact fields so no orphan-name displays remain.
CREATE OR REPLACE FUNCTION public.relink_appointment(
  _appt_id uuid,
  _target_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_client_id uuid;
  v_target record;
  v_caller uuid := auth.uid();
BEGIN
  IF NOT (public.is_owner() OR public.is_barber()) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT client_id INTO v_old_client_id FROM public.appointments WHERE id = _appt_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  SELECT id, first_name, last_name, email, phone
    INTO v_target
    FROM public.clients
   WHERE id = _target_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_client_not_found';
  END IF;

  UPDATE public.appointments
     SET client_id    = v_target.id,
         client_name  = btrim(coalesce(v_target.first_name, '') || ' ' || coalesce(v_target.last_name, '')),
         client_email = v_target.email,
         client_phone = v_target.phone,
         updated_at   = now()
   WHERE id = _appt_id;

  UPDATE public.clients SET last_relink_at = now() WHERE id = v_target.id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    coalesce(v_caller, '00000000-0000-0000-0000-000000000000'::uuid),
    'appointment_relinked',
    'appointment',
    _appt_id,
    jsonb_build_object('old_client_id', v_old_client_id, 'new_client_id', v_target.id)
  );

  RETURN jsonb_build_object('ok', true, 'appointment_id', _appt_id, 'client_id', v_target.id);
END;
$$;

REVOKE ALL ON FUNCTION public.relink_appointment(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.relink_appointment(uuid, uuid) TO authenticated, service_role;
