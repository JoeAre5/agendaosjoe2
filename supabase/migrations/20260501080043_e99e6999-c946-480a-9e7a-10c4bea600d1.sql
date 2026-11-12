-- 1) Drop the anon-exposing policy on barbers
DROP POLICY IF EXISTS "Public read active barbers" ON public.barbers;

-- 2) Re-create it for authenticated only (logged-in clients still need to see their barber)
CREATE POLICY "Authenticated read active barbers"
  ON public.barbers
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- 3) Rebuild barbers_public view WITHOUT any sensitive fields.
-- Keep acuity_calendar_key — it's a public slug (CHARLIE/PITO/JOSEPH) used in URLs, not a secret.
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

-- 4) Grant explicit read access on the public view to anon + authenticated
GRANT SELECT ON public.barbers_public TO anon, authenticated;