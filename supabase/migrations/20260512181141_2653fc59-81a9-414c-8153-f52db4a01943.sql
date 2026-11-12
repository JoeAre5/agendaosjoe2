ALTER TABLE public.referral_codes DROP CONSTRAINT referral_codes_owner_type_check;
ALTER TABLE public.referral_codes ADD CONSTRAINT referral_codes_owner_type_check CHECK (owner_type = ANY (ARRAY['barber'::text, 'client'::text, 'shop'::text]));
INSERT INTO public.referral_codes (code, owner_type, owner_id, is_active)
VALUES ('shop', 'shop', '00000000-0000-0000-0000-000000000000', true)
ON CONFLICT (code) DO NOTHING;