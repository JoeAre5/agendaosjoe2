REVOKE ALL ON FUNCTION public.owner_purge_nonrecurring_over_recurring(timestamptz, timestamptz, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_purge_nonrecurring_over_recurring(timestamptz, timestamptz, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_purge_nonrecurring_over_recurring(timestamptz, timestamptz, boolean, text) TO authenticated;

DO $$
DECLARE
  _audit_user_id uuid;
  _target_ids uuid[];
  _target_count int := 0;
  _tx_count int := 0;
  _pos_count int := 0;
  _draft_count int := 0;
BEGIN
  SELECT ur.user_id INTO _audit_user_id
  FROM public.user_roles ur
  ORDER BY CASE ur.role::text WHEN 'owner' THEN 1 WHEN 'super_admin' THEN 2 WHEN 'barber' THEN 3 ELSE 4 END
  LIMIT 1;

  IF _audit_user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot run cleanup: no user found for audit log ownership';
  END IF;

  WITH candidates AS (
    SELECT DISTINCT nr.id
    FROM public.appointments nr
    JOIN public.appointments r
      ON r.id <> nr.id
     AND r.barber_id = nr.barber_id
     AND r.starts_at = nr.starts_at
     AND r.ends_at = nr.ends_at
     AND r.status <> 'cancelled'
     AND (COALESCE(r.is_recurring, false) OR r.recurring_group_id IS NOT NULL)
    WHERE nr.starts_at >= '2026-05-01T00:00:00-04:00'::timestamptz
      AND nr.starts_at <= '2026-12-31T23:59:59-04:00'::timestamptz
      AND nr.status <> 'cancelled'
      AND NOT (COALESCE(nr.is_recurring, false) OR nr.recurring_group_id IS NOT NULL)
      AND COALESCE(nr.amount_paid_cents, 0) = 0
      AND COALESCE(nr.payment_confirmed, false) = false
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]), count(*)::int
  INTO _target_ids, _target_count
  FROM candidates;

  IF _target_count = 0 THEN
    RAISE NOTICE 'No non-recurring-over-recurring duplicates found through 2026-12-31';
    RETURN;
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  SELECT
    _audit_user_id,
    'migration_purge_nonrecurring_over_recurring_20260428',
    'appointment',
    nr.id,
    jsonb_build_object(
      'reason', 'Owner evidence cleanup: remove unpaid non-recurring rows occupying the same slot as recurring appointments through 2026-12-31',
      'delete_client_name', nr.client_name,
      'delete_acuity_id', nr.acuity_id,
      'delete_service_name', nr.service_name,
      'starts_at', nr.starts_at,
      'ends_at', nr.ends_at,
      'barber_id', nr.barber_id,
      'is_recurring', nr.is_recurring,
      'recurring_group_id', nr.recurring_group_id
    )
  FROM public.appointments nr
  WHERE nr.id = ANY(_target_ids);

  WITH d AS (DELETE FROM public.transactions WHERE appointment_id = ANY(_target_ids) RETURNING 1)
  SELECT count(*)::int INTO _tx_count FROM d;

  WITH d AS (DELETE FROM public.pos_payment_sessions WHERE appointment_id = ANY(_target_ids) RETURNING 1)
  SELECT count(*)::int INTO _pos_count FROM d;

  WITH d AS (DELETE FROM public.booking_drafts WHERE appointment_id = ANY(_target_ids) RETURNING 1)
  SELECT count(*)::int INTO _draft_count FROM d;

  ALTER TABLE public.appointments DISABLE TRIGGER no_hard_delete_appointments;
  BEGIN
    DELETE FROM public.appointments WHERE id = ANY(_target_ids);
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;
    RAISE;
  END;
  ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;

  RAISE NOTICE 'Purged % unpaid non-recurring-over-recurring duplicate appointments, % transactions, % POS sessions, % booking drafts', _target_count, _tx_count, _pos_count, _draft_count;
END $$;