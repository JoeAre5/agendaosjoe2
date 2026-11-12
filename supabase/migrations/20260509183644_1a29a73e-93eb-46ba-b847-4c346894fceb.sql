ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS home_grid_photos text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.get_home_grid_photos()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(home_grid_photos, '{}'::text[]) FROM public.shop_settings LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_grid_photos() TO anon, authenticated;