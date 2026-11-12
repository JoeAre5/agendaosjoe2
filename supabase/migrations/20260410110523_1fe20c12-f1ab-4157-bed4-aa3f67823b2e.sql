
ALTER TABLE public.appointments ADD COLUMN payment_confirmed boolean NOT NULL DEFAULT false;

-- Mark existing appointments with digital payments as confirmed
UPDATE public.appointments 
SET payment_confirmed = true 
WHERE payment_method IN ('stripe', 'ath_movil', 'paypal') AND paid = true;
