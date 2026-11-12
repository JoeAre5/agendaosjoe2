DO $$
DECLARE
  _deleted_count integer := 0;
  _tx_count integer := 0;
  _pos_count integer := 0;
  _draft_count integer := 0;
  _audit_user_id uuid;
BEGIN
  SELECT ur.user_id INTO _audit_user_id
  FROM public.user_roles ur
  ORDER BY CASE ur.role::text WHEN 'owner' THEN 1 WHEN 'super_admin' THEN 2 WHEN 'barber' THEN 3 ELSE 4 END
  LIMIT 1;

  IF _audit_user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot run cleanup: no user found for audit log ownership';
  END IF;

  CREATE TEMP TABLE _appt_hard_delete_targets (
    id uuid PRIMARY KEY
  ) ON COMMIT DROP;

  -- 1) All cancelled appointments with no recorded payment.
  INSERT INTO _appt_hard_delete_targets (id)
  SELECT a.id
  FROM public.appointments a
  WHERE a.status = 'cancelled'
    AND COALESCE(a.amount_paid_cents, 0) = 0
    AND COALESCE(a.payment_confirmed, false) = false
  ON CONFLICT (id) DO NOTHING;

  -- 2) Future non-recurring rows for the clients explicitly named by owner.
  INSERT INTO _appt_hard_delete_targets (id)
  SELECT a.id
  FROM public.appointments a
  WHERE a.starts_at > now()
    AND a.is_recurring IS NOT TRUE
    AND COALESCE(a.amount_paid_cents, 0) = 0
    AND COALESCE(a.payment_confirmed, false) = false
    AND lower(trim(a.client_name)) IN (
      'jossue vargas',
      'francisco morales',
      'elvin martinez',
      'elvin martínez',
      'carlitos torres',
      'carlos torres',
      'axel correa',
      'jeriel curbelo',
      'jariel curbelo',
      'josep lopez',
      'josep lópez'
    )
  ON CONFLICT (id) DO NOTHING;

  -- 3) Any future non-recurring duplicate where the exact same client/barber/slot has a recurring row.
  INSERT INTO _appt_hard_delete_targets (id)
  SELECT a.id
  FROM public.appointments a
  WHERE a.starts_at > now()
    AND a.is_recurring IS NOT TRUE
    AND COALESCE(a.amount_paid_cents, 0) = 0
    AND COALESCE(a.payment_confirmed, false) = false
    AND EXISTS (
      SELECT 1
      FROM public.appointments r
      WHERE r.id <> a.id
        AND r.starts_at = a.starts_at
        AND r.barber_id = a.barber_id
        AND lower(trim(r.client_name)) = lower(trim(a.client_name))
        AND r.is_recurring IS TRUE
        AND r.status <> 'cancelled'
    )
  ON CONFLICT (id) DO NOTHING;

  -- Audit before deletion.
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  SELECT
    _audit_user_id,
    'migration_hard_delete_cleanup_20260428',
    'appointment',
    a.id,
    jsonb_build_object(
      'client_name', a.client_name,
      'starts_at', a.starts_at,
      'ends_at', a.ends_at,
      'barber_id', a.barber_id,
      'acuity_id', a.acuity_id,
      'status', a.status,
      'is_recurring', a.is_recurring,
      'recurring_group_id', a.recurring_group_id,
      'amount_paid_cents', a.amount_paid_cents,
      'payment_confirmed', a.payment_confirmed,
      'reason', 'Owner-directed cleanup: cancelled ghosts, future named non-recurring rows, and non-recurring duplicate rows where recurring exists in same slot'
    )
  FROM public.appointments a
  JOIN _appt_hard_delete_targets t ON t.id = a.id;

  DELETE FROM public.transactions tx
  USING _appt_hard_delete_targets t
  WHERE tx.appointment_id = t.id;
  GET DIAGNOSTICS _tx_count = ROW_COUNT;

  DELETE FROM public.pos_payment_sessions ps
  USING _appt_hard_delete_targets t
  WHERE ps.appointment_id = t.id;
  GET DIAGNOSTICS _pos_count = ROW_COUNT;

  DELETE FROM public.booking_drafts bd
  USING _appt_hard_delete_targets t
  WHERE bd.appointment_id = t.id;
  GET DIAGNOSTICS _draft_count = ROW_COUNT;

  ALTER TABLE public.appointments DISABLE TRIGGER no_hard_delete_appointments;
  BEGIN
    DELETE FROM public.appointments a
    USING _appt_hard_delete_targets t
    WHERE a.id = t.id;
    GET DIAGNOSTICS _deleted_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;
    RAISE;
  END;
  ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;

  RAISE NOTICE 'Hard delete cleanup removed % appointments, % transactions, % POS sessions, % booking drafts', _deleted_count, _tx_count, _pos_count, _draft_count;
END $$;