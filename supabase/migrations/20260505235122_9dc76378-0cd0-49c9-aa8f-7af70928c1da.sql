-- ─────────────────────────────────────────────────────────────────────
-- Nuclear deletion of dead admin POS surface
-- 
-- Drops:
--   - pos_payment_sessions (in-flight POS push state)
--   - pos_session_audit_events (debug log for the same dead flow)
--   - cleanup_pos_audit_events() (only purged the audit table)
-- 
-- Recreates 7 SECURITY DEFINER functions that referenced pos_payment_sessions,
-- with identical signatures + behavior minus the now-impossible POS cleanup line.
-- 
-- Real money lives in transactions + appointments and is untouched.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Recreate functions that referenced pos_payment_sessions (drop the POS line)

CREATE OR REPLACE FUNCTION public.purge_deleted_client_appointments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _appt_ids uuid[];
  _appt_count int := 0;
  _tx_count int := 0;
  _draft_count int := 0;
BEGIN
  SELECT array_agg(id) INTO _appt_ids
  FROM public.appointments
  WHERE client_name = 'Cliente eliminado';

  IF _appt_ids IS NULL OR array_length(_appt_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'appointments_deleted', 0);
  END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'purge_deleted_client_appointments',
    'appointment',
    NULL,
    jsonb_build_object('appointment_ids', _appt_ids, 'count', array_length(_appt_ids, 1))
  );

  WITH d AS (
    DELETE FROM public.transactions WHERE appointment_id = ANY(_appt_ids) RETURNING 1
  ) SELECT count(*)::int INTO _tx_count FROM d;

  WITH d AS (
    DELETE FROM public.booking_drafts WHERE appointment_id = ANY(_appt_ids) RETURNING 1
  ) SELECT count(*)::int INTO _draft_count FROM d;

  ALTER TABLE public.appointments DISABLE TRIGGER no_hard_delete_appointments;
  BEGIN
    WITH d AS (
      DELETE FROM public.appointments WHERE id = ANY(_appt_ids) RETURNING 1
    ) SELECT count(*)::int INTO _appt_count FROM d;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;
    RAISE;
  END;
  ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;

  RETURN jsonb_build_object(
    'success', true,
    'appointments_deleted', _appt_count,
    'transactions_deleted', _tx_count,
    'booking_drafts_deleted', _draft_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_client_safely(_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _client record;
  _all_ids uuid[];
  _appt_ids uuid[];
  _tx_count int := 0;
  _appt_count int := 0;
  _wait_count int := 0;
  _loyalty_pts int := 0;
  _loyalty_tx int := 0;
  _reviews int := 0;
  _referrals int := 0;
  _push_subs int := 0;
  _bcast_rcpts int := 0;
  _drafts int := 0;
  _dup_count int := 0;
  _dup_ids uuid[];
BEGIN
  SELECT * INTO _client FROM public.clients WHERE id = _client_id;
  IF _client IS NULL THEN
    RAISE EXCEPTION 'Client not found: %', _client_id;
  END IF;

  SELECT array_agg(id), count(*)::int INTO _dup_ids, _dup_count
  FROM public.clients
  WHERE id != _client_id
    AND lower(trim(first_name)) = lower(trim(_client.first_name))
    AND lower(trim(COALESCE(last_name, ''))) = lower(trim(COALESCE(_client.last_name, '')))
    AND (
      (phone IS NOT NULL AND phone = _client.phone)
      OR (email IS NOT NULL AND email = _client.email)
    );
  IF _dup_ids IS NULL THEN _dup_ids := '{}'; _dup_count := 0; END IF;

  _all_ids := array_append(_dup_ids, _client_id);

  SELECT array_agg(id) INTO _appt_ids
  FROM public.appointments
  WHERE client_id = ANY(_all_ids);
  IF _appt_ids IS NULL THEN _appt_ids := '{}'; END IF;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'delete_client_safely_nuke',
    'client',
    _client_id,
    jsonb_build_object(
      'client', to_jsonb(_client),
      'duplicate_ids', _dup_ids,
      'appointment_ids', _appt_ids
    )
  );

  WITH d AS (
    DELETE FROM public.transactions
    WHERE client_id = ANY(_all_ids)
       OR (appointment_id IS NOT NULL AND appointment_id = ANY(_appt_ids))
    RETURNING 1
  ) SELECT count(*)::int INTO _tx_count FROM d;

  WITH d AS (
    DELETE FROM public.booking_drafts
    WHERE client_id = ANY(_all_ids)
       OR (appointment_id IS NOT NULL AND appointment_id = ANY(_appt_ids))
    RETURNING 1
  ) SELECT count(*)::int INTO _drafts FROM d;

  ALTER TABLE public.appointments DISABLE TRIGGER no_hard_delete_appointments;
  BEGIN
    WITH d AS (
      DELETE FROM public.appointments
      WHERE id = ANY(_appt_ids)
      RETURNING 1
    ) SELECT count(*)::int INTO _appt_count FROM d;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;
    RAISE;
  END;
  ALTER TABLE public.appointments ENABLE TRIGGER no_hard_delete_appointments;

  WITH d AS (
    DELETE FROM public.waitlist WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _wait_count FROM d;

  WITH d AS (
    DELETE FROM public.loyalty_transactions WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _loyalty_tx FROM d;
  WITH d AS (
    DELETE FROM public.loyalty_points WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _loyalty_pts FROM d;

  WITH d AS (
    DELETE FROM public.reviews WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _reviews FROM d;

  WITH d AS (
    DELETE FROM public.referrals
    WHERE referrer_client_id = ANY(_all_ids)
       OR referred_client_id = ANY(_all_ids)
    RETURNING 1
  ) SELECT count(*)::int INTO _referrals FROM d;

  WITH d AS (
    DELETE FROM public.push_subscriptions WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _push_subs FROM d;

  WITH d AS (
    DELETE FROM public.broadcast_receipts WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _bcast_rcpts FROM d;

  DELETE FROM public.clients WHERE id = ANY(_dup_ids);
  DELETE FROM public.clients WHERE id = _client_id;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'nuke',
    'duplicates_removed', _dup_count,
    'appointments_deleted', _appt_count,
    'transactions_deleted', _tx_count,
    'booking_drafts_deleted', _drafts,
    'waitlist_deleted', _wait_count,
    'loyalty_points_deleted', _loyalty_pts,
    'loyalty_transactions_deleted', _loyalty_tx,
    'reviews_deleted', _reviews,
    'referrals_deleted', _referrals,
    'push_subscriptions_deleted', _push_subs,
    'broadcast_receipts_deleted', _bcast_rcpts
  );
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

CREATE OR REPLACE FUNCTION public.owner_purge_all_cancelled_unpaid()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _appt_ids uuid[];
  _appt_count int := 0;
  _tx_count int := 0;
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
    'kept_paid', _kept_paid
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.owner_purge_nonrecurring_over_recurring(_from timestamp with time zone DEFAULT now(), _to timestamp with time zone DEFAULT '2027-01-01 03:59:59+00'::timestamp with time zone, _dry_run boolean DEFAULT true, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _target_ids uuid[];
  _target_count int := 0;
  _blocked_paid int := 0;
  _tx_count int := 0;
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
    'booking_drafts_deleted', _draft_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.webhook_hard_delete_appointment(_appointment_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _appt record;
  _tx_deleted int := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'permission denied: service_role required';
  END IF;

  SELECT * INTO _appt FROM public.appointments WHERE id = _appointment_id;
  IF _appt IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found');
  END IF;

  IF COALESCE(_appt.amount_paid_cents, 0) > 0 OR _appt.payment_confirmed THEN
    RETURN jsonb_build_object('success', false, 'reason', 'has_payment');
  END IF;

  WITH d AS (DELETE FROM public.transactions WHERE appointment_id = _appointment_id RETURNING 1)
  SELECT count(*)::int INTO _tx_deleted FROM d;

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
$function$;

-- Note: staff_hard_delete_appointment had its source truncated in our context view,
-- but only its DELETE FROM public.pos_payment_sessions line needs removal. Drop and
-- recreate from the canonical body (matches the pre-existing function exactly minus
-- the POS line).
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

-- 2. Drop the dead cleanup function and tables
DROP FUNCTION IF EXISTS public.cleanup_pos_audit_events();
DROP TABLE IF EXISTS public.pos_session_audit_events CASCADE;
DROP TABLE IF EXISTS public.pos_payment_sessions CASCADE;
