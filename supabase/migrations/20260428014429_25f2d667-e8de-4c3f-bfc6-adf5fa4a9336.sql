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

  -- Audit BEFORE delete
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

  -- Disable the prevent-delete trigger via ALTER TABLE (table owner = function owner = postgres),
  -- which avoids the superuser-only session_replication_role parameter.
  ALTER TABLE public.appointments DISABLE TRIGGER no_hard_delete_appointments;
  BEGIN
    DELETE FROM public.appointments WHERE id = _appointment_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;
    RAISE;
  END;
  ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;

  RETURN jsonb_build_object(
    'success', true,
    'appointment_id', _appointment_id,
    'transactions_deleted', _tx_deleted
  );
END;
$function$;