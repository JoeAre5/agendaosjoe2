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

  IF COALESCE(_appt.amount_paid_cents, 0) > 0 OR COALESCE(_appt.payment_confirmed, false) THEN
    RAISE EXCEPTION 'cannot_delete_paid_appointment: appointment % has payment recorded — process refund first', _appointment_id
      USING ERRCODE = 'P0001';
  END IF;

  IF _appt.acuity_id IS NOT NULL THEN
    INSERT INTO public.deleted_appointment_tombstones (
      acuity_id,
      appointment_id,
      client_name,
      starts_at,
      reason,
      source
    ) VALUES (
      _appt.acuity_id,
      _appointment_id,
      _appt.client_name,
      _appt.starts_at,
      _reason,
      'staff'
    )
    ON CONFLICT (acuity_id) DO UPDATE SET
      appointment_id = EXCLUDED.appointment_id,
      client_name = EXCLUDED.client_name,
      starts_at = EXCLUDED.starts_at,
      reason = EXCLUDED.reason,
      deleted_at = now(),
      source = EXCLUDED.source;
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

  DELETE FROM public.booking_drafts WHERE appointment_id = _appointment_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'staff_hard_delete_appointment',
    'appointment',
    _appointment_id,
    jsonb_build_object(
      'reason', _reason,
      'acuity_id', _appt.acuity_id,
      'client_name', _appt.client_name,
      'starts_at', _appt.starts_at
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

  RETURN jsonb_build_object('success', true, 'transactions_deleted', _tx_deleted);
END;
$function$;

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
  _draft_count int := 0;
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner role required';
  END IF;

  SELECT array_agg(id) INTO _appt_ids
  FROM public.appointments
  WHERE status = 'cancelled'
    AND (NOT _only_unpaid OR (COALESCE(amount_paid_cents, 0) = 0 AND COALESCE(payment_confirmed, false) = false));

  SELECT count(*)::int INTO _skipped_paid
  FROM public.appointments
  WHERE status = 'cancelled'
    AND (COALESCE(amount_paid_cents, 0) > 0 OR COALESCE(payment_confirmed, false) = true);

  IF _appt_ids IS NULL OR array_length(_appt_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'appointments_deleted', 0, 'skipped_paid', _skipped_paid);
  END IF;

  INSERT INTO public.deleted_appointment_tombstones (
    acuity_id,
    appointment_id,
    client_name,
    starts_at,
    reason,
    source
  )
  SELECT
    acuity_id,
    id,
    client_name,
    starts_at,
    'staff purge cancelled appointments',
    'staff_purge'
  FROM public.appointments
  WHERE id = ANY(_appt_ids)
    AND acuity_id IS NOT NULL
  ON CONFLICT (acuity_id) DO UPDATE SET
    appointment_id = EXCLUDED.appointment_id,
    client_name = EXCLUDED.client_name,
    starts_at = EXCLUDED.starts_at,
    reason = EXCLUDED.reason,
    deleted_at = now(),
    source = EXCLUDED.source;

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
    'booking_drafts_deleted', _draft_count,
    'skipped_paid', _skipped_paid
  );
END;
$function$;