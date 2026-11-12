-- Webhook-callable hard delete (service role only, never user-callable)
CREATE OR REPLACE FUNCTION public.webhook_hard_delete_appointment(_appointment_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _appt record;
  _tx_deleted int := 0;
BEGIN
  -- Only callable by service_role (webhook context) — never authenticated users
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied: service_role required';
  END IF;

  SELECT * INTO _appt FROM public.appointments WHERE id = _appointment_id;
  IF _appt IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  -- Refund safety: never delete a paid appointment
  IF COALESCE(_appt.amount_paid_cents, 0) > 0 OR _appt.payment_confirmed THEN
    RETURN jsonb_build_object('success', false, 'reason', 'has_payment');
  END IF;

  -- Cascade clean
  WITH d AS (DELETE FROM public.transactions WHERE appointment_id = _appointment_id RETURNING 1)
  SELECT count(*)::int INTO _tx_deleted FROM d;

  DELETE FROM public.pos_payment_sessions WHERE appointment_id = _appointment_id;
  DELETE FROM public.booking_drafts WHERE appointment_id = _appointment_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'webhook_hard_delete_appointment',
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
$$;

REVOKE EXECUTE ON FUNCTION public.webhook_hard_delete_appointment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_hard_delete_appointment(uuid, text) TO service_role;

-- Owner-callable bulk purge for the "Purgar todas las canceladas" button
CREATE OR REPLACE FUNCTION public.owner_purge_all_cancelled_unpaid()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _appt_ids uuid[];
  _appt_count int := 0;
  _tx_count int := 0;
  _pos_count int := 0;
  _draft_count int := 0;
  _kept_paid int := 0;
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner required';
  END IF;

  SELECT array_agg(id) INTO _appt_ids
  FROM public.appointments
  WHERE status = 'cancelled' AND COALESCE(amount_paid_cents, 0) = 0 AND NOT payment_confirmed;

  SELECT count(*)::int INTO _kept_paid
  FROM public.appointments
  WHERE status = 'cancelled' AND (COALESCE(amount_paid_cents, 0) > 0 OR payment_confirmed);

  IF _appt_ids IS NULL THEN
    RETURN jsonb_build_object('success', true, 'appointments_deleted', 0, 'kept_paid', _kept_paid);
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'owner_purge_all_cancelled_unpaid',
    'appointment',
    NULL,
    jsonb_build_object('appointment_ids', _appt_ids, 'count', array_length(_appt_ids,1), 'kept_paid', _kept_paid)
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
    'kept_paid', _kept_paid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.owner_purge_all_cancelled_unpaid() TO authenticated;