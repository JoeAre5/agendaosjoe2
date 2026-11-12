
-- Allow authenticated clients to insert their own appointments (matching by client_id from get_my_client_id())
CREATE POLICY "Client insert own appointments"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
  is_client() AND client_id = get_my_client_id()
);

-- Improve the claim RPC: also return the id when the row already belongs to this client
-- (no-op UPDATE returns no row, so we add a SELECT fallback)
CREATE OR REPLACE FUNCTION public.claim_appointment_by_acuity_id(_acuity_id integer)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client_id uuid;
  _appt_id uuid;
BEGIN
  _client_id := public.get_my_client_id();
  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'Not a client';
  END IF;

  -- Stamp ownership; only succeeds when row is unowned or already owned by this client
  UPDATE public.appointments
  SET client_id = _client_id,
      created_by_role = COALESCE(created_by_role, 'client_app'),
      created_by_user_id = COALESCE(created_by_user_id, auth.uid())
  WHERE acuity_id = _acuity_id
    AND (client_id IS NULL OR client_id = _client_id)
  RETURNING id INTO _appt_id;

  -- Fallback: row already had matching client_id (UPDATE may not return when nothing changed in some edge cases)
  IF _appt_id IS NULL THEN
    SELECT id INTO _appt_id
    FROM public.appointments
    WHERE acuity_id = _acuity_id AND client_id = _client_id
    LIMIT 1;
  END IF;

  RETURN _appt_id;
END;
$function$;
