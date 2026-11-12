
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_payment_method_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_payment_method_check
  CHECK (payment_method = ANY (ARRAY['cash'::text, 'ath_movil'::text, 'stripe'::text, 'paypal'::text, 'unpaid'::text, 'benefit'::text]));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_payment_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_payment_method_check
  CHECK (payment_method = ANY (ARRAY['cash'::text, 'ath_movil'::text, 'stripe'::text, 'paypal'::text, 'benefit'::text]));
