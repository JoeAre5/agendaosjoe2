-- 1. Drop over-permissive public policy on base table
DROP POLICY IF EXISTS "Public read active barbers" ON public.barbers;

-- 2. Drop redundant Barber policy (superseded by "Staff read active barbers")
DROP POLICY IF EXISTS "Barber read active barbers" ON public.barbers;

-- 3. Revoke direct table SELECT from anon and authenticated
REVOKE SELECT ON public.barbers FROM anon, authenticated;

-- 4. Recreate barbers_public view with only public-safe columns (drops employment_type leak)
DROP VIEW IF EXISTS public.barbers_public;

CREATE VIEW public.barbers_public
WITH (security_invoker = on) AS
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

-- 5. Grant SELECT on the safe view to anon and authenticated
GRANT SELECT ON public.barbers_public TO anon, authenticated;