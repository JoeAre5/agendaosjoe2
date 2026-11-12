-- Add sort_order for admin-controlled service ordering
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Flag rows whose name/duration/price the admin edited locally — sync must not overwrite them
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS locally_edited boolean NOT NULL DEFAULT false;

-- Seed sort_order so existing services have a stable initial order (alphabetical by name)
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY name) AS rn
  FROM public.services
)
UPDATE public.services s
SET sort_order = ranked.rn * 10
FROM ranked
WHERE s.id = ranked.id AND s.sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_services_sort_order ON public.services (sort_order);