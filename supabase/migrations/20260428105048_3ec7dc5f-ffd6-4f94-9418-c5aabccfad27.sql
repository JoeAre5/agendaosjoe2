CREATE OR REPLACE FUNCTION public.owner_purge_nonrecurring_over_recurring(
  _from timestamptz DEFAULT now(),
  _to timestamptz DEFAULT '2026-12-31T23:59:59-04:00'::timestamptz,
  _dry_run boolean DEFAULT true,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _target_ids uuid[];
  _target_count int := 0;
  _blocked_paid int := 0;
  _tx_count int := 0;
  _pos_count int := 0;
  _draft_count int := 0;
  _samples jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner required';
  END IF;

  WITH candidates AS (
    SELECT DISTINCT ON (nr.id)
      nr.id,
      nr.acuity_id,
      nr.client_name,
      nr.service_name,
      nr.starts_at,
      nr.ends_at,
      nr.barber_id,
      nr.amount_paid_cents,
      nr.payment_confirmed,
      r.id AS recurring_id,
      r.acuity_id AS recurring_acuity_id,
      r.client_name AS recurring_client_name
    FROM public.appointments nr
    JOIN public.appointments r
      ON r.id <> nr.id
     AND r.barber_id = nr.barber_id
     AND r.starts_at = nr.starts_at
     AND r.ends_at = nr.ends_at
     AND r.status <> 'cancelled'
     AND (COALESCE(r.is_recurring, false) OR r.recurring_group_id IS NOT NULL)
    WHERE nr.starts_at >= _from
      AND nr.starts_at <= _to
      AND nr.status <> 'cancelled'
      AND NOT (COALESCE(nr.is_recurring, false) OR nr.recurring_group_id IS NOT NULL)
    ORDER BY nr.id, r.created_at ASC
  ), unpaid_targets AS (
    SELECT *
    FROM candidates
    WHERE COALESCE(amount_paid_cents, 0) = 0
      AND COALESCE(payment_confirmed, false) = false
  ), paid_blocked AS (
    SELECT *
    FROM candidates
    WHERE COALESCE(amount_paid_cents, 0) > 0
       OR COALESCE(payment_confirmed, false) = true
  )
  SELECT
    COALESCE(array_agg(id), ARRAY[]::uuid[]),
    count(*)::int,
    COALESCE((SELECT count(*)::int FROM paid_blocked), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'delete_id', id,
      'delete_acuity_id', acuity_id,
      'delete_client_name', client_name,
      'delete_service_name', service_name,
      'keep_id', recurring_id,
      'keep_acuity_id', recurring_acuity_id,
      'keep_client_name', recurring_client_name,
      'starts_at', starts_at,
      'ends_at', ends_at,
      'barber_id', barber_id
    ) ORDER BY starts_at) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  INTO _target_ids, _target_count, _blocked_paid, _samples
  FROM unpaid_targets;

  IF _dry_run THEN
    RETURN jsonb_build_object(
      'success', true,
      'dry_run', true,
      'from', _from,
      'to', _to,
      'appointments_to_delete', _target_count,
      'blocked_paid', _blocked_paid,
      'sample', COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(_samples) WITH ORDINALITY AS s(value, ord) WHERE ord <= 25), '[]'::jsonb)
    );
  END IF;

  IF _target_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'dry_run', false,
      'appointments_deleted', 0,
      'blocked_paid', _blocked_paid,
      'transactions_deleted', 0,
      'pos_sessions_deleted', 0,
      'booking_drafts_deleted', 0
    );
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'owner_purge_nonrecurring_over_recurring',
    'appointment',
    NULL,
    jsonb_build_object(
      'reason', COALESCE(_reason, 'Purge unpaid non-recurring appointments overlapping recurring slots'),
      'from', _from,
      'to', _to,
      'appointments_deleted', _target_count,
      'blocked_paid', _blocked_paid,
      'sample', COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(_samples) WITH ORDINALITY AS s(value, ord) WHERE ord <= 25), '[]'::jsonb)
    )
  );

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

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', false,
    'appointments_deleted', _target_count,
    'blocked_paid', _blocked_paid,
    'transactions_deleted', _tx_count,
    'pos_sessions_deleted', _pos_count,
    'booking_drafts_deleted', _draft_count
  );
END;
$$;