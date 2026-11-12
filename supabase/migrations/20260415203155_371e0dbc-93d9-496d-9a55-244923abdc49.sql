-- Drop the overly permissive anon policy
DROP POLICY IF EXISTS "Public read active barbers" ON public.barbers;

-- Create a restrictive anon policy that returns zero rows from the base table
-- Public access goes through the barbers_public view instead
-- (The view already exists and only exposes safe columns)