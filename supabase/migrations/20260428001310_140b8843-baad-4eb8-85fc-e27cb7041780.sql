-- 1) Update single hard-delete to also purge linked transactions (with audit)
CREATE OR REPLACE FUNCTION public.danger_hard_delete_appointment(_appointment_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _appt record;
  _tx record;
  _tx_deleted int := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super_admin required';
  END IF;

  SELECT * INTO _appt FROM public.appointments WHERE id = _appointment_id;
  IF _appt IS NULL THEN
    RAISE EXCEPTION 'appointment not found: %', _appointment_id;
  END IF;

  -- Audit + delete linked transactions first (so reports no longer show them)
  FOR _tx IN SELECT * FROM public.transactions WHERE appointment_id = _appointment_id LOOP
    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      'danger_hard_delete_transaction',
      'transaction',
      _tx.id,
      jsonb_build_object(
        'reason', _reason,
        'cascaded_from_appointment', _appointment_id,
        'snapshot', to_jsonb(_tx)
      )
    );
    DELETE FROM public.transactions WHERE id = _tx.id;
    _tx_deleted := _tx_deleted + 1;
  END LOOP;

  -- Audit BEFORE delete so we keep a record
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'danger_hard_delete_appointment',
    'appointment',
    _appointment_id,
    jsonb_build_object(
      'reason', _reason,
      'previous_status', _appt.status,
      'client_name', _appt.client_name,
      'starts_at', _appt.starts_at,
      'acuity_id', _appt.acuity_id,
      'paid', _appt.paid,
      'amount_paid_cents', _appt.amount_paid_cents,
      'is_recurring', _appt.is_recurring,
      'recurring_group_id', _appt.recurring_group_id,
      'transactions_deleted', _tx_deleted
    )
  );

  -- Bypass the prevent_appointment_delete trigger for this transaction only
  SET LOCAL session_replication_role = 'replica';
  DELETE FROM public.appointments WHERE id = _appointment_id;
  SET LOCAL session_replication_role = 'origin';

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', _appointment_id,
    'transactions_deleted', _tx_deleted
  );
END;
$function$;

-- 2) Bulk hard-delete appointments
CREATE OR REPLACE FUNCTION public.danger_hard_delete_appointments_bulk(_appointment_ids uuid[], _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _ok int := 0;
  _fail int := 0;
  _errors jsonb := '[]'::jsonb;
  _result jsonb;
  _tx_total int := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super_admin required';
  END IF;

  IF _appointment_ids IS NULL OR array_length(_appointment_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'deleted', 0, 'failed', 0, 'transactions_deleted', 0);
  END IF;

  FOREACH _id IN ARRAY _appointment_ids LOOP
    BEGIN
      _result := public.danger_hard_delete_appointment(_id, _reason);
      _ok := _ok + 1;
      _tx_total := _tx_total + COALESCE((_result->>'transactions_deleted')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      _fail := _fail + 1;
      _errors := _errors || jsonb_build_object('id', _id, 'error', SQLERRM);
    END;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'danger_hard_delete_appointments_bulk',
    'appointment',
    NULL,
    jsonb_build_object(
      'reason', _reason,
      'requested', array_length(_appointment_ids, 1),
      'deleted', _ok,
      'failed', _fail,
      'transactions_deleted', _tx_total,
      'errors', _errors
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted', _ok,
    'failed', _fail,
    'transactions_deleted', _tx_total,
    'errors', _errors
  );
END;
$function$;

-- 3) Bulk nuke clients
CREATE OR REPLACE FUNCTION public.danger_nuke_clients_bulk(_client_ids uuid[], _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
  _client record;
  _ok int := 0;
  _fail int := 0;
  _errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super_admin required';
  END IF;

  IF _client_ids IS NULL OR array_length(_client_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'deleted', 0, 'failed', 0);
  END IF;

  FOREACH _id IN ARRAY _client_ids LOOP
    BEGIN
      SELECT * INTO _client FROM public.clients WHERE id = _id;
      IF _client IS NULL THEN
        _fail := _fail + 1;
        _errors := _errors || jsonb_build_object('id', _id, 'error', 'client not found');
        CONTINUE;
      END IF;

      IF _client.email IS NOT NULL AND _client.auth_user_id IS NOT NULL THEN
        PERFORM public.danger_nuke_user_by_email(_client.email);
      ELSE
        PERFORM public.delete_client_safely(_id);
      END IF;
      _ok := _ok + 1;
    EXCEPTION WHEN OTHERS THEN
      _fail := _fail + 1;
      _errors := _errors || jsonb_build_object('id', _id, 'error', SQLERRM);
    END;
  END LOOP;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'danger_nuke_clients_bulk',
    'client',
    NULL,
    jsonb_build_object(
      'reason', _reason,
      'requested', array_length(_client_ids, 1),
      'deleted', _ok,
      'failed', _fail,
      'errors', _errors
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted', _ok,
    'failed', _fail,
    'errors', _errors
  );
END;
$function$;