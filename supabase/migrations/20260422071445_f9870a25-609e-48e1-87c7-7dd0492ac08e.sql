-- Add stripe_payment_method_type to appointments
ALTER TABLE public.appointments
  ADD COLUMN stripe_payment_method_type TEXT NULL;

COMMENT ON COLUMN public.appointments.stripe_payment_method_type IS
  'When payment_method=stripe: card | apple_pay | google_pay | klarna | link. Null for non-stripe methods (cash, ath_movil, paypal).';

-- Add stripe_payment_method_type to transactions
ALTER TABLE public.transactions
  ADD COLUMN stripe_payment_method_type TEXT NULL;

COMMENT ON COLUMN public.transactions.stripe_payment_method_type IS
  'Same enum as appointments.stripe_payment_method_type';

-- Partial index for reporting (only non-null rows)
CREATE INDEX idx_appointments_stripe_pmt
  ON public.appointments(stripe_payment_method_type)
  WHERE stripe_payment_method_type IS NOT NULL;

CREATE INDEX idx_transactions_stripe_pmt
  ON public.transactions(stripe_payment_method_type)
  WHERE stripe_payment_method_type IS NOT NULL;