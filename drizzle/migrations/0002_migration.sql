CREATE TABLE public.appointment_overlap_preauth (
  acuity_id bigint PRIMARY KEY,
  reason text NOT NULL,
  authorized_by uuid,
  authorized_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.appointment_overlap_preauth TO authenticated;
GRANT ALL ON public.appointment_overlap_preauth TO service_role;
ALTER TABLE public.appointment_overlap_preauth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read overlap preauth" ON public.appointment_overlap_preauth
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'super_owner'));

-- Staff (owner/barber/manager/staff) explicitly confirm "Book anyway" for an Acuity appointment.
CREATE OR REPLACE FUNCTION public.staff_preauthorize_overlap(_acuity_id bigint, _reason text DEFAULT 'Staff confirmed book anyway')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT CASE
    WHEN public.has_role(auth.uid(),'super_owner') THEN 'super_owner'
    WHEN public.has_role(auth.uid(),'owner') THEN 'owner'
    WHEN public.has_role(auth.uid(),'manager') THEN 'manager'
    WHEN public.has_role(auth.uid(),'staff') THEN 'staff'
    WHEN public.has_role(auth.uid(),'barber') THEN 'barber'
  END INTO _role;
  IF _role IS NULL THEN RAISE EXCEPTION 'Only staff can override schedule conflicts'; END IF;
  INSERT INTO public.appointment_overlap_preauth (acuity_id, reason, authorized_by, authorized_role)
  VALUES (_acuity_id, coalesce(nullif(btrim(_reason),''),'Staff confirmed book anyway'), auth.uid(), _role)
  ON CONFLICT (acuity_id) DO UPDATE SET reason = EXCLUDED.reason, authorized_by = EXCLUDED.authorized_by,
    authorized_role = EXCLUDED.authorized_role, created_at = now();
  -- If the row already exists locally, mark it exempt now.
  PERFORM set_config('app.overlap_override','on',true);
  UPDATE public.appointments SET overlap_exempt = true WHERE acuity_id = _acuity_id AND overlap_exempt = false;
  PERFORM set_config('app.overlap_override','off',true);
END; $$;
REVOKE ALL ON FUNCTION public.staff_preauthorize_overlap(bigint, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_preauthorize_overlap(bigint, text) TO authenticated;

-- Applies pre-authorization on insert/update (fires before trg_guard_overlap_exempt alphabetically).
CREATE OR REPLACE FUNCTION public.apply_overlap_preauth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.acuity_id IS NOT NULL AND coalesce(NEW.overlap_exempt,false) = false
     AND EXISTS (SELECT 1 FROM public.appointment_overlap_preauth p WHERE p.acuity_id = NEW.acuity_id) THEN
    NEW.overlap_exempt := true;
    PERFORM set_config('app.overlap_override','on',true);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_apply_overlap_preauth BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.apply_overlap_preauth();