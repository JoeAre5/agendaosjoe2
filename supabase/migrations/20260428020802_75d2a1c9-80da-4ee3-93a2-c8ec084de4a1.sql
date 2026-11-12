
-- Staff (owner OR barber) can hard-delete an appointment + its financial children.
-- Mirrors danger_hard_delete_appointment but without the super_admin gate.
CREATE OR REPLACE FUNCTION public.staff_hard_delete_appointment(
  _appointment_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _appt record;
  _tx record;
  _tx_deleted int := 0;
BEGIN
  IF NOT (public.is_owner() OR public.is_barber() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: staff role required';
  END IF;

  SELECT * INTO _appt FROM public.appointments WHERE id = _appointment_id;
  IF _appt IS NULL THEN
    RAISE EXCEPTION 'appointment not found: %', _appointment_id;
  END IF;

  -- Cascade: transactions tied to this appointment
  FOR _tx IN SELECT * FROM public.transactions WHERE appointment_id = _appointment_id LOOP
    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      'staff_hard_delete_transaction',
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

  -- Cascade: POS sessions + booking drafts
  DELETE FROM public.pos_payment_sessions WHERE appointment_id = _appointment_id;
  DELETE FROM public.booking_drafts WHERE appointment_id = _appointment_id;

  -- Audit BEFORE delete
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'staff_hard_delete_appointment',
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

  -- Bypass the prevent-delete trigger (function owner = postgres)
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
$$;

GRANT EXECUTE ON FUNCTION public.staff_hard_delete_appointment(uuid, text) TO authenticated;

-- Bulk version
CREATE OR REPLACE FUNCTION public.staff_hard_delete_appointments_bulk(
  _appointment_ids uuid[],
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
  _ok int := 0;
  _fail int := 0;
  _errors jsonb := '[]'::jsonb;
  _result jsonb;
  _tx_total int := 0;
BEGIN
  IF NOT (public.is_owner() OR public.is_barber() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: staff role required';
  END IF;

  IF _appointment_ids IS NULL OR array_length(_appointment_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'deleted', 0, 'failed', 0, 'transactions_deleted', 0);
  END IF;

  FOREACH _id IN ARRAY _appointment_ids LOOP
    BEGIN
      _result := public.staff_hard_delete_appointment(_id, _reason);
      _ok := _ok + 1;
      _tx_total := _tx_total + COALESCE((_result->>'transactions_deleted')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      _fail := _fail + 1;
      _errors := _errors || jsonb_build_object('id', _id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', _ok,
    'failed', _fail,
    'transactions_deleted', _tx_total,
    'errors', _errors
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_hard_delete_appointments_bulk(uuid[], text) TO authenticated;
