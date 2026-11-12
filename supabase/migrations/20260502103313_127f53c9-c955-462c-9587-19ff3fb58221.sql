ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS eligible_for_commission boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.products.eligible_for_commission IS
'When false, sales of this product never generate barber commission (e.g., snacks, drinks, passive waiting-room items). When true (default), commission_rate applies normally.';