-- Recreate the public view with SECURITY DEFINER semantics so anon callers
-- can read it even though they have no privileges on the base table.
-- The view only exposes columns that are intentionally public.
DROP VIEW IF EXISTS public.barbers_public;

CREATE VIEW public.barbers_public
WITH (security_invoker = off) AS
SELECT
  id,
  name,
  avatar_url,
  color,
  description,
  acuity_calendar_id,
  acuity_calendar_key,
  show_in_checkout,
  is_default_checkout_barber,
  is_active,
  created_at
FROM public.barbers
WHERE is_active = true;

GRANT SELECT ON public.barbers_public TO anon, authenticated;