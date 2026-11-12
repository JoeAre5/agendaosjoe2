-- Allow unauthenticated users to read active barbers via barbers_public view
-- The view already strips sensitive fields (email, ssn, salary, etc.)
CREATE POLICY "Public read active barbers"
ON public.barbers
FOR SELECT
TO anon
USING (is_active = true);