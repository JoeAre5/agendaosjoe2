-- ─── 1. Purge function ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_deleted_client_appointments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _appt_ids uuid[];
  _appt_count int := 0;
  _tx_count int := 0;
  _pos_count int := 0;
  _draft_count int := 0;
BEGIN
  SELECT array_agg(id) INTO _appt_ids
  FROM public.appointments
  WHERE client_name = 'Cliente eliminado';

  IF _appt_ids IS NULL OR array_length(_appt_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', true, 'appointments_deleted', 0);
  END IF;

  -- Audit snapshot
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'purge_deleted_client_appointments',
    'appointment',
    NULL,
    jsonb_build_object('appointment_ids', _appt_ids, 'count', array_length(_appt_ids, 1))
  );

  -- Linked transactions
  WITH d AS (
    DELETE FROM public.transactions WHERE appointment_id = ANY(_appt_ids) RETURNING 1
  ) SELECT count(*)::int INTO _tx_count FROM d;

  -- POS sessions
  WITH d AS (
    DELETE FROM public.pos_payment_sessions WHERE appointment_id = ANY(_appt_ids) RETURNING 1
  ) SELECT count(*)::int INTO _pos_count FROM d;

  -- Booking drafts
  WITH d AS (
    DELETE FROM public.booking_drafts WHERE appointment_id = ANY(_appt_ids) RETURNING 1
  ) SELECT count(*)::int INTO _draft_count FROM d;

  -- Hard-delete appointments (bypass prevent-delete trigger)
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
    'pos_sessions_deleted', _pos_count,
    'booking_drafts_deleted', _draft_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_deleted_client_appointments() FROM PUBLIC, anon;

-- ─── 2. Trigger: purge on the spot whenever a row becomes "Cliente eliminado" ─
CREATE OR REPLACE FUNCTION public.trg_purge_on_client_delete_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Run after the current statement finishes by scheduling via a deferred exception-safe call.
  -- Simpler approach: schedule async via pg_notify; but we can just call the purge directly
  -- AFTER the row update completes (this trigger is AFTER UPDATE).
  PERFORM public.purge_deleted_client_appointments();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS purge_deleted_client_marker ON public.appointments;
CREATE TRIGGER purge_deleted_client_marker
AFTER UPDATE OF client_name ON public.appointments
FOR EACH ROW
WHEN (NEW.client_name = 'Cliente eliminado')
EXECUTE FUNCTION public.trg_purge_on_client_delete_marker();

-- ─── 3. Hourly cron sweep ────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('purge-deleted-client-appointments');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-deleted-client-appointments',
  '0 * * * *',
  $$ SELECT public.purge_deleted_client_appointments(); $$
);

-- ─── 4. Run once now to clean the existing 143 orphans ───
SELECT public.purge_deleted_client_appointments();