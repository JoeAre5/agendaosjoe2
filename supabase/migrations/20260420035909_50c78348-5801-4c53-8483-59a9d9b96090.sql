ALTER TABLE public.booking_drafts
ADD COLUMN IF NOT EXISTS ath_ecommerce_id text;

CREATE INDEX IF NOT EXISTS idx_booking_drafts_ath_ecommerce_id
  ON public.booking_drafts (ath_ecommerce_id)
  WHERE ath_ecommerce_id IS NOT NULL;