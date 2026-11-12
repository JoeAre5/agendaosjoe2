-- Add commission rate to products (percentage paid to barber on sale)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0;

-- Create a view that exposes product sales with computed cost & commission
CREATE OR REPLACE VIEW public.product_sales AS
SELECT
  ti.id                                           AS item_id,
  ti.transaction_id,
  t.created_at,
  t.barber_id,
  b.name                                          AS barber_name,
  t.client_id,
  t.payment_method,
  ti.item_id                                      AS product_id,
  ti.name                                         AS product_name,
  ti.quantity,
  ti.unit_price_cents,
  ti.total_cents                                  AS revenue_cents,
  COALESCE(p.cost_cents, 0) * ti.quantity         AS cost_cents,
  ROUND(ti.total_cents * COALESCE(p.commission_rate, 0) / 100)::int AS commission_cents,
  (ti.total_cents
    - (COALESCE(p.cost_cents, 0) * ti.quantity)
    - ROUND(ti.total_cents * COALESCE(p.commission_rate, 0) / 100))::int AS profit_cents
FROM public.transaction_items ti
JOIN public.transactions t       ON t.id = ti.transaction_id
LEFT JOIN public.products p      ON p.id = ti.item_id
LEFT JOIN public.barbers b       ON b.id = t.barber_id
WHERE ti.item_type = 'product'
  AND t.status = 'completed';

-- Grant view access (RLS on underlying tables governs row visibility)
GRANT SELECT ON public.product_sales TO authenticated;