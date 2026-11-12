CREATE OR REPLACE FUNCTION public.claim_appointment_by_acuity_id(_acuity_id integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _client_id uuid;
  _appt_id uuid;
BEGIN
  -- Only authenticated clients can claim
  _client_id := public.get_my_client_id();
  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'Not a client';
  END IF;

  -- Stamp ownership on the appointment created by the Acuity webhook race
  UPDATE public.appointments
  SET client_id = _client_id,
      created_by_role = COALESCE(created_by_role, 'client_app'),
      created_by_user_id = COALESCE(created_by_user_id, auth.uid())
  WHERE acuity_id = _acuity_id
    AND (client_id IS NULL OR client_id = _client_id)
  RETURNING id INTO _appt_id;

  RETURN _appt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_appointment_by_acuity_id(integer) TO authenticated;