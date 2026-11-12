CREATE TABLE IF NOT EXISTS public.deleted_appointment_tombstones (
  acuity_id integer PRIMARY KEY,
  appointment_id uuid,
  client_name text,
  starts_at timestamp with time zone,
  reason text,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'webhook'
);

ALTER TABLE public.deleted_appointment_tombstones ENABLE ROW LEVEL SECURITY;

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
    RETURN jsonb_build_object('success', true, 'reason', 'already_deleted', 'transactions_deleted', 0);
  END IF;

  IF COALESCE(_appt.amount_paid_cents, 0) > 0 OR COALESCE(_appt.payment_confirmed, false) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'has_payment');
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
      'webhook'
    )
    ON CONFLICT (acuity_id) DO UPDATE SET
      appointment_id = EXCLUDED.appointment_id,
      client_name = EXCLUDED.client_name,
      starts_at = EXCLUDED.starts_at,
      reason = EXCLUDED.reason,
      deleted_at = now(),
      source = EXCLUDED.source;
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

  RETURN jsonb_build_object('success', true, 'reason', 'deleted', 'transactions_deleted', _tx_deleted);
END;
$function$;

REVOKE ALL ON public.deleted_appointment_tombstones FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.webhook_hard_delete_appointment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_hard_delete_appointment(uuid, text) TO service_role;