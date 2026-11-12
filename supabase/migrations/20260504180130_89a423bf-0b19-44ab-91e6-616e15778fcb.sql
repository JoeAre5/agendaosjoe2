
DROP POLICY IF EXISTS "Anon read published reviews" ON public.reviews;
DROP POLICY IF EXISTS "Authenticated read published reviews" ON public.reviews;

CREATE OR REPLACE VIEW public.reviews_public
WITH (security_invoker = on) AS
  SELECT id, barber_id, rating, comment, is_published, created_at
  FROM public.reviews
  WHERE is_published = true;

GRANT SELECT ON public.reviews_public TO anon, authenticated;
