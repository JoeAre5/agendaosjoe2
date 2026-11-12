ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_in_checkout boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_sort_order ON public.products(sort_order);

-- Backfill sort_order using current name alphabetical order so it's not all 0
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) * 10 AS new_order
  FROM public.products
)
UPDATE public.products p
SET sort_order = o.new_order
FROM ordered o
WHERE p.id = o.id AND p.sort_order = 0;

COMMENT ON COLUMN public.products.sort_order IS 'Display order in Checkout product picker. Lower = first.';
COMMENT ON COLUMN public.products.show_in_checkout IS 'When false, product is hidden from POS product picker but still active in Inventory.';