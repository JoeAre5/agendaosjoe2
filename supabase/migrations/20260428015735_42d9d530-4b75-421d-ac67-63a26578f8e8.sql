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
  _pos_sessions int := 0;
  _dup_count int := 0;
  _dup_ids uuid[];
BEGIN
  SELECT * INTO _client FROM public.clients WHERE id = _client_id;
  IF _client IS NULL THEN
    RAISE EXCEPTION 'Client not found: %', _client_id;
  END IF;

  -- Find duplicate profiles (same normalized name + phone or email match)
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

  -- Collect every appointment id (any status, past or future) tied to this client or duplicates
  SELECT array_agg(id) INTO _appt_ids
  FROM public.appointments
  WHERE client_id = ANY(_all_ids);
  IF _appt_ids IS NULL THEN _appt_ids := '{}'; END IF;

  -- ─── Audit snapshot of everything we are about to nuke ───
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

  -- ─── 1. DELETE transactions for these appointments + for these clients ───
  WITH d AS (
    DELETE FROM public.transactions
    WHERE client_id = ANY(_all_ids)
       OR (appointment_id IS NOT NULL AND appointment_id = ANY(_appt_ids))
    RETURNING 1
  ) SELECT count(*)::int INTO _tx_count FROM d;

  -- ─── 2. POS payment sessions ───
  WITH d AS (
    DELETE FROM public.pos_payment_sessions
    WHERE client_id = ANY(_all_ids)
       OR (appointment_id IS NOT NULL AND appointment_id = ANY(_appt_ids))
    RETURNING 1
  ) SELECT count(*)::int INTO _pos_sessions FROM d;

  -- ─── 3. Booking drafts ───
  WITH d AS (
    DELETE FROM public.booking_drafts
    WHERE client_id = ANY(_all_ids)
       OR (appointment_id IS NOT NULL AND appointment_id = ANY(_appt_ids))
    RETURNING 1
  ) SELECT count(*)::int INTO _drafts FROM d;

  -- ─── 4. Hard-delete appointments (bypass prevent-delete trigger) ───
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

  -- ─── 5. Waitlist ───
  WITH d AS (
    DELETE FROM public.waitlist WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _wait_count FROM d;

  -- ─── 6. Loyalty ───
  WITH d AS (
    DELETE FROM public.loyalty_transactions WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _loyalty_tx FROM d;
  WITH d AS (
    DELETE FROM public.loyalty_points WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _loyalty_pts FROM d;

  -- ─── 7. Reviews ───
  WITH d AS (
    DELETE FROM public.reviews WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _reviews FROM d;

  -- ─── 8. Referrals (as referrer or referred) ───
  WITH d AS (
    DELETE FROM public.referrals
    WHERE referrer_client_id = ANY(_all_ids)
       OR referred_client_id = ANY(_all_ids)
    RETURNING 1
  ) SELECT count(*)::int INTO _referrals FROM d;

  -- ─── 9. Push subscriptions ───
  WITH d AS (
    DELETE FROM public.push_subscriptions WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _push_subs FROM d;

  -- ─── 10. Broadcast receipts ───
  WITH d AS (
    DELETE FROM public.broadcast_receipts WHERE client_id = ANY(_all_ids) RETURNING 1
  ) SELECT count(*)::int INTO _bcast_rcpts FROM d;

  -- ─── 11. Delete duplicate clients + the target ───
  DELETE FROM public.clients WHERE id = ANY(_dup_ids);
  DELETE FROM public.clients WHERE id = _client_id;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'nuke',
    'duplicates_removed', _dup_count,
    'appointments_deleted', _appt_count,
    'transactions_deleted', _tx_count,
    'pos_sessions_deleted', _pos_sessions,
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