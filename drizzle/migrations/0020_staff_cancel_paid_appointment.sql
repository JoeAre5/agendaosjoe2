CREATE OR REPLACE FUNCTION public.staff_cancel_paid_appointment(_appointment_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _appt record;
  _role text;
BEGIN
  IF public.is_owner() OR public.is_super_admin() THEN
    _role := 'owner';
  ELSIF public.is_barber() THEN
    _role := 'barber';
  ELSE
    RAISE EXCEPTION 'permission denied: staff role required';
  END IF;

  SELECT * INTO _appt FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF _appt IS NULL THEN
    RAISE EXCEPTION 'appointment not found: %', _appointment_id;
  END IF;
  IF _appt.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true);
  END IF;

  UPDATE public.appointments SET
    status = 'cancelled',
    paid = false,
    cancelled_at = COALESCE(cancelled_at, now()),
    cancelled_by_role = COALESCE(cancelled_by_role, _role),
    refund_status = COALESCE(refund_status, 'manual')
  WHERE id = _appointment_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'staff_cancel_paid_appointment', 'appointment', _appointment_id,
    jsonb_build_object('reason', _reason, 'actor_role', _role, 'acuity_id', _appt.acuity_id,
      'amount_paid_cents', _appt.amount_paid_cents, 'starts_at', _appt.starts_at));

  RETURN jsonb_build_object('success', true, 'already_cancelled', false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.staff_cancel_paid_appointment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_cancel_paid_appointment(uuid, text) TO authenticated, service_role;