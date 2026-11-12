-- Switch view back to security_invoker=on (recommended pattern)
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

GRANT SELECT ON public.barbers_public TO anon, authenticated;

-- Re-add a public RLS policy on the base table (anon needs row visibility for the view to return rows)
CREATE POLICY "Public read active barbers"
ON public.barbers
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- COLUMN-LEVEL GRANTS: anon may only read the 11 safe columns from the base table.
-- This means SELECT * as anon will fail with "permission denied for column ..." on any sensitive column.
GRANT SELECT (
  id, name, avatar_url, color, description,
  acuity_calendar_id, acuity_calendar_key,
  show_in_checkout, is_default_checkout_barber,
  is_active, created_at
) ON public.barbers TO anon;