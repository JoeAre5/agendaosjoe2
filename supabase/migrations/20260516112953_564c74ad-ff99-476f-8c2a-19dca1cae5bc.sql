CREATE POLICY "Owners can view deleted appointment tombstones"
ON public.deleted_appointment_tombstones
FOR SELECT
TO authenticated
USING (public.is_owner() OR public.is_super_admin());

GRANT SELECT ON public.deleted_appointment_tombstones TO authenticated;