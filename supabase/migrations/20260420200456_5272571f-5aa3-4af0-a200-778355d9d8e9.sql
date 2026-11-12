UPDATE public.barbers 
SET product_commission_rate = 0.10 
WHERE is_active = true 
  AND commission_rate > 0 
  AND product_commission_rate IS NULL;