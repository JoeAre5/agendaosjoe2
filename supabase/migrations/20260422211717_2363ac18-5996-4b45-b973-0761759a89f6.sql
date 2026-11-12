-- Allow public (anon + authenticated) to read active barbers via the barbers_public view.
-- The view only exposes safe public fields (no email, ssn_last4, salary, etc.).
-- This fixes intermittent missing barber avatars on the client booking flow when
-- the user is a client (no barber/owner role) — RLS was previously denying SELECT.

CREATE POLICY "Public read active barbers"
ON public.barbers
FOR SELECT
TO anon, authenticated
USING (is_active = true);
