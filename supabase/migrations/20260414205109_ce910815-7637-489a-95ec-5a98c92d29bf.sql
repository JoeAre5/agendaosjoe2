
-- Switch view to security invoker (uses caller's permissions)
DROP VIEW IF EXISTS public.barbers_public;

CREATE VIEW public.barbers_public
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  color,
  is_active,
  avatar_url,
  description,
  acuity_calendar_key,
  acuity_calendar_id,
  show_in_checkout,
  is_default_checkout_barber,
  employment_type,
  created_at
FROM public.barbers;

GRANT SELECT ON public.barbers_public TO anon, authenticated;

-- Add a SELECT policy for all authenticated users to read active barbers
-- This lets the security_invoker view work for barbers and clients
CREATE POLICY "Authenticated read active barbers"
  ON public.barbers
  FOR SELECT
  TO authenticated
  USING (is_active = true);
