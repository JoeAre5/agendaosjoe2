CREATE OR REPLACE FUNCTION public.delete_client_safely(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _client record;
  _appt_count int;
  _future_cancelled_count int;
  _tx_count int;
  _wait_count int;
  _dup_count int;
  _dup_ids uuid[];
BEGIN
  -- Fetch client to delete
  SELECT * INTO _client FROM public.clients WHERE id = _client_id;
  IF _client IS NULL THEN
    RAISE EXCEPTION 'Client not found: %', _client_id;
  END IF;

  -- Find duplicate profiles (same normalized name + matching phone or email)
  SELECT array_agg(id), count(*)::int INTO _dup_ids, _dup_count
  FROM public.clients
  WHERE id != _client_id
    AND lower(trim(first_name)) = lower(trim(_client.first_name))
    AND lower(trim(COALESCE(last_name, ''))) = lower(trim(COALESCE(_client.last_name, '')))
    AND (
      (phone IS NOT NULL AND phone = _client.phone)
      OR (email IS NOT NULL AND email = _client.email)
    );

  IF _dup_ids IS NULL THEN
    _dup_ids := '{}';
    _dup_count := 0;
  END IF;

  -- Cancel future active appointments before anonymizing the client link.
  WITH cancelled AS (
    UPDATE public.appointments
    SET status = 'cancelled',
        cancelled_at = COALESCE(cancelled_at, now()),
        cancelled_by_role = COALESCE(cancelled_by_role, 'owner'),
        refund_status = COALESCE(refund_status, 'none'),
        updated_at = now()
    WHERE (client_id = _client_id OR client_id = ANY(_dup_ids))
      AND starts_at > now()
      AND status IN ('scheduled', 'confirmed', 'in-progress')
    RETURNING 1
  ) SELECT count(*)::int INTO _future_cancelled_count FROM cancelled;

  -- Anonymize appointments for target + duplicates while preserving reporting rows.
  WITH updated AS (
    UPDATE public.appointments
    SET client_id = NULL,
        client_name = 'Cliente eliminado',
        client_phone = NULL,
        client_email = NULL,
        updated_at = now()
    WHERE client_id = _client_id OR client_id = ANY(_dup_ids)
    RETURNING 1
  ) SELECT count(*)::int INTO _appt_count FROM updated;

  -- Nullify transactions
  WITH updated AS (
    UPDATE public.transactions
    SET client_id = NULL
    WHERE client_id = _client_id OR client_id = ANY(_dup_ids)
    RETURNING 1
  ) SELECT count(*)::int INTO _tx_count FROM updated;

  -- Nullify waitlist
  WITH updated AS (
    UPDATE public.waitlist
    SET client_id = NULL
    WHERE client_id = _client_id OR client_id = ANY(_dup_ids)
    RETURNING 1
  ) SELECT count(*)::int INTO _wait_count FROM updated;

  -- Delete duplicates
  DELETE FROM public.clients WHERE id = ANY(_dup_ids);

  -- Delete the target client
  DELETE FROM public.clients WHERE id = _client_id;

  RETURN jsonb_build_object(
    'success', true,
    'appointments_cleaned', _appt_count,
    'future_appointments_cancelled', _future_cancelled_count,
    'transactions_cleaned', _tx_count,
    'waitlist_cleaned', _wait_count,
    'duplicates_removed', _dup_count
  );
END;
$function$;