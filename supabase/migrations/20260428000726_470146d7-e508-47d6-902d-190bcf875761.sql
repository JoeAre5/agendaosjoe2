-- Super-admin-only hard delete for appointments + matching block_times helper.
-- Bypasses the prevent_appointment_delete trigger via SECURITY DEFINER + session_replication_role.
CREATE OR REPLACE FUNCTION public.danger_hard_delete_appointment(_appointment_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _appt record;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super_admin required';
  END IF;

  SELECT * INTO _appt FROM public.appointments WHERE id = _appointment_id;
  IF _appt IS NULL THEN
    RAISE EXCEPTION 'appointment not found: %', _appointment_id;
  END IF;

  -- Audit BEFORE delete so we keep a record
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'danger_hard_delete_appointment',
    'appointment',
    _appointment_id,
    jsonb_build_object(
      'reason', _reason,
      'previous_status', _appt.status,
      'client_name', _appt.client_name,
      'starts_at', _appt.starts_at,
      'acuity_id', _appt.acuity_id,
      'paid', _appt.paid,
      'amount_paid_cents', _appt.amount_paid_cents,
      'is_recurring', _appt.is_recurring,
      'recurring_group_id', _appt.recurring_group_id
    )
  );

  -- Bypass the prevent_appointment_delete trigger for this transaction only
  SET LOCAL session_replication_role = 'replica';
  DELETE FROM public.appointments WHERE id = _appointment_id;
  SET LOCAL session_replication_role = 'origin';

  RETURN jsonb_build_object('success', true, 'appointment_id', _appointment_id);
END;
$$;