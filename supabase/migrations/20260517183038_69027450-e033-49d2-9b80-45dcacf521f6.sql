ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS preferred_payment_methods text[] NOT NULL DEFAULT '{}';

-- Backfill the new array from the existing singular preference where set.
UPDATE public.clients
SET preferred_payment_methods = ARRAY[preferred_payment_method]
WHERE preferred_payment_method IS NOT NULL
  AND (preferred_payment_methods IS NULL OR cardinality(preferred_payment_methods) = 0);