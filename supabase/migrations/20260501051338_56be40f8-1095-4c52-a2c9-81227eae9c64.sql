ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS preferred_payment_method text;

COMMENT ON COLUMN public.clients.preferred_payment_method IS
  'Most recently used payment method for this client. Used to pre-select on next checkout. Values: stripe, apple_pay, google_pay, link, paypal, ath_movil, cash.';