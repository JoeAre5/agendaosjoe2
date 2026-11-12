-- Create super_admins table — separate from user_roles enum so it can be
-- removed cleanly when cloning this app for SaaS clients.
CREATE TABLE public.super_admins (
  user_id UUID NOT NULL PRIMARY KEY,
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Helper function (security definer, avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.super_admins WHERE user_id = (SELECT auth.uid())
  )
$$;

-- Only super_admins can read/manage the table itself
CREATE POLICY "Super admin read super_admins"
ON public.super_admins
FOR SELECT
TO authenticated
USING (public.is_super_admin());

CREATE POLICY "Super admin manage super_admins"
ON public.super_admins
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Seed both current owners as super_admins
INSERT INTO public.super_admins (user_id, notes) VALUES
  ('418a8e65-44ee-4705-8c02-ac0d0c577ae2', 'Initial seed — owner'),
  ('102c8af4-a019-4988-9d4d-2d7cd3005fc3', 'Initial seed — owner')
ON CONFLICT (user_id) DO NOTHING;

-- ─── RPC: nuke user by email ─────────────────────────────────────────────
-- Removes auth.users + user_roles + clients records for a given email.
-- Returns summary jsonb. Restricted to super_admins.
CREATE OR REPLACE FUNCTION public.danger_nuke_user_by_email(_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _client_id uuid;
  _roles_deleted int := 0;
  _clients_deleted int := 0;
  _auth_deleted int := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'permission denied: super_admin required';
  END IF;

  IF _email IS NULL OR trim(_email) = '' THEN
    RAISE EXCEPTION 'email is required';
  END IF;

  SELECT id INTO _user_id FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;

  IF _user_id IS NULL THEN
    -- Also check clients table for guest/email-only records
    SELECT id INTO _client_id FROM public.clients WHERE lower(email) = lower(trim(_email)) LIMIT 1;
    IF _client_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'No user or client found with that email');
    END IF;
    PERFORM public.delete_client_safely(_client_id);
    INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'danger_nuke_user', 'client', _client_id,
            jsonb_build_object('email', _email, 'auth_user_found', false));
    RETURN jsonb_build_object('success', true, 'message', 'Client-only record purged', 'client_id', _client_id);
  END IF;

  -- Delete linked client(s) safely (cascades anonymized appts)
  FOR _client_id IN SELECT id FROM public.clients WHERE auth_user_id = _user_id LOOP
    PERFORM public.delete_client_safely(_client_id);
    _clients_deleted := _clients_deleted + 1;
  END LOOP;

  DELETE FROM public.user_roles WHERE user_id = _user_id;
  GET DIAGNOSTICS _roles_deleted = ROW_COUNT;

  DELETE FROM auth.users WHERE id = _user_id;
  GET DIAGNOSTICS _auth_deleted = ROW_COUNT;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'danger_nuke_user', 'auth_user', _user_id,
          jsonb_build_object('email', _email, 'roles_deleted', _roles_deleted,
                             'clients_purged', _clients_deleted, 'auth_deleted', _auth_deleted));

  RETURN jsonb_build_object(
    'success', true,
    'auth_user_id', _user_id,
    'roles_deleted', _roles_deleted,
    'clients_purged', _clients_deleted,
    'auth_deleted', _auth_deleted
  );
END;
$$;

-- ─── RPC: force-cancel appointment ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.danger_force_cancel_appointment(_appointment_id uuid, _reason text DEFAULT NULL)
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

  UPDATE public.appointments
  SET status = 'cancelled',
      cancelled_at = COALESCE(cancelled_at, now()),
      cancelled_by_role = 'super_admin',
      refund_status = CASE WHEN paid AND amount_paid_cents > 0 THEN 'pending' ELSE 'none' END,
      notes = COALESCE(notes, '') || E'\n[FORCE-CANCEL by super_admin] ' || COALESCE(_reason, ''),
      updated_at = now()
  WHERE id = _appointment_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'danger_force_cancel', 'appointment', _appointment_id,
          jsonb_build_object('reason', _reason, 'previous_status', _appt.status,
                             'amount_paid_cents', _appt.amount_paid_cents));

  RETURN jsonb_build_object('success', true, 'appointment_id', _appointment_id,
                            'refund_pending', _appt.paid AND _appt.amount_paid_cents > 0);
END;
$$;

-- Grant execute to authenticated (functions self-check via is_super_admin())
GRANT EXECUTE ON FUNCTION public.danger_nuke_user_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.danger_force_cancel_appointment(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;