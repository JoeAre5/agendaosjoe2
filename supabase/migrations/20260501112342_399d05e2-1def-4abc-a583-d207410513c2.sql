DROP VIEW IF EXISTS public.barbers_public;
CREATE VIEW public.barbers_public AS
SELECT
  b.id,
  b.name,
  b.avatar_url,
  b.color,
  b.description,
  b.acuity_calendar_id,
  b.show_in_checkout,
  b.is_default_checkout_barber,
  b.is_active,
  b.created_at
FROM public.barbers b
WHERE b.is_active = true;

GRANT SELECT ON public.barbers_public TO anon, authenticated;