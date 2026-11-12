DO $cleanup_cancelled_ghosts$
DECLARE
  _appt_ids uuid[];
  _appt_count int := 0;
  _tx_count int := 0;
  _draft_count int := 0;
BEGIN
  SELECT array_agg(id) INTO _appt_ids
  FROM public.appointments
  WHERE status = 'cancelled'
    AND COALESCE(amount_paid_cents, 0) = 0
    AND COALESCE(payment_confirmed, false) = false;

  IF _appt_ids IS NULL OR array_length(_appt_ids, 1) IS NULL THEN
    RETURN;
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
    'one-time cleanup of cancelled unpaid ghost rows',
    'migration_cleanup'
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
    '00000000-0000-0000-0000-000000000000'::uuid,
    'cleanup_cancelled_unpaid_ghost_appointments',
    'appointment',
    NULL,
    jsonb_build_object('appointment_ids', _appt_ids, 'count', array_length(_appt_ids, 1))
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

  RAISE NOTICE 'cleanup_cancelled_unpaid_ghost_appointments deleted %, tx %, drafts %', _appt_count, _tx_count, _draft_count;
END
$cleanup_cancelled_ghosts$;