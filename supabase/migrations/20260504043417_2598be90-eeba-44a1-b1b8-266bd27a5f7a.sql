DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND barber_id IS NOT DISTINCT FROM (
    SELECT p.barber_id FROM public.profiles p WHERE p.id = auth.uid()
  )
);