-- 1. Block hard-delete of paid appointments (forces refund handling first)
CREATE OR REPLACE FUNCTION public.staff_hard_delete_appointment(_appointment_id uuid, _reason text DEFAULT NULL::text)
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
  IF NOT (public.is_owner() OR public.is_barber() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: staff role required';
  END IF;

  SELECT * INTO _appt FROM public.appointments WHERE id = _appointment_id;
  IF _appt IS NULL THEN
    RAISE EXCEPTION 'appointment not found: %', _appointment_id;
  END IF;

  -- ⛔ Refund-safety guard: never hard-delete an appointment that has money on it
  IF COALESCE(_appt.amount_paid_cents, 0) > 0 THEN
    RAISE EXCEPTION 'cannot_delete_paid_appointment: appointment % has amount_paid_cents=% — process refund first', _appointment_id, _appt.amount_paid_cents
      USING ERRCODE = 'P0001';
  END IF;

  FOR _tx IN SELECT * FROM public.transactions WHERE appointment_id = _appointment_id LOOP
    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      auth.uid(),
      'staff_hard_delete_transaction',
      'transaction',
      _tx.id,
      jsonb_build_object('reason', _reason, 'cascaded_from_appointment', _appointment_id, 'snapshot', to_jsonb(_tx))
    );
    DELETE FROM public.transactions WHERE id = _tx.id;
    _tx_deleted := _tx_deleted + 1;
  END LOOP;

  DELETE FROM public.pos_payment_sessions WHERE appointment_id = _appointment_id;
  DELETE FROM public.booking_drafts WHERE appointment_id = _appointment_id;

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

  ALTER TABLE public.appointments DISABLE TRIGGER no_hard_delete_appointments;
  BEGIN
    DELETE FROM public.appointments WHERE id = _appointment_id;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;
    RAISE;
  END;
  ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;

  RETURN jsonb_build_object('success', true, 'appointment_id', _appointment_id, 'transactions_deleted', _tx_deleted);
END;
$function$;

-- 2. Bulk purge function for cancelled appointments (skips paid ones)
CREATE OR REPLACE FUNCTION public.staff_purge_cancelled_appointments(_only_unpaid boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _appt_ids uuid[];
  _skipped_paid int := 0;
  _appt_count int := 0;
  _tx_count int := 0;
  _pos_count int := 0;
  _draft_count int := 0;
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner role required';
  END IF;

  SELECT array_agg(id) INTO _appt_ids
  FROM public.appointments
  WHERE status = 'cancelled'
    AND (NOT _only_unpaid OR COALESCE(amount_paid_cents, 0) = 0);

  SELECT count(*)::int INTO _skipped_paid
  FROM public.appointments
  WHERE status = 'cancelled' AND COALESCE(amount_paid_cents, 0) > 0;

  IF _appt_ids IS NULL OR array_length(_appt_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'appointments_deleted', 0, 'skipped_paid', _skipped_paid);
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'staff_purge_cancelled_appointments',
    'appointment',
    NULL,
    jsonb_build_object('appointment_ids', _appt_ids, 'count', array_length(_appt_ids, 1), 'skipped_paid', _skipped_paid)
  );

  WITH d AS (DELETE FROM public.transactions WHERE appointment_id = ANY(_appt_ids) RETURNING 1)
  SELECT count(*)::int INTO _tx_count FROM d;

  WITH d AS (DELETE FROM public.pos_payment_sessions WHERE appointment_id = ANY(_appt_ids) RETURNING 1)
  SELECT count(*)::int INTO _pos_count FROM d;

  WITH d AS (DELETE FROM public.booking_drafts WHERE appointment_id = ANY(_appt_ids) RETURNING 1)
  SELECT count(*)::int INTO _draft_count FROM d;

  ALTER TABLE public.appointments DISABLE TRIGGER no_hard_delete_appointments;
  BEGIN
    WITH d AS (DELETE FROM public.appointments WHERE id = ANY(_appt_ids) RETURNING 1)
    SELECT count(*)::int INTO _appt_count FROM d;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;
    RAISE;
  END;
  ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;

  RETURN jsonb_build_object(
    'success', true,
    'appointments_deleted', _appt_count,
    'transactions_deleted', _tx_count,
    'pos_sessions_deleted', _pos_count,
    'booking_drafts_deleted', _draft_count,
    'skipped_paid', _skipped_paid
  );
END;
$function$;