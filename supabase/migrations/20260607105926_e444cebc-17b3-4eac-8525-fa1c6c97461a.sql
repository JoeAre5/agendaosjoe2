-- Add contact fields to shop_settings and expose via public view
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS maps_url text;

DROP VIEW IF EXISTS public.shop_settings_public;
CREATE VIEW public.shop_settings_public
WITH (security_invoker = true)
AS
SELECT
  id,
  shop_name,
  address,
  city,
  phone,
  whatsapp,
  email,
  maps_url,
  hours,
  timezone,
  legal_entity,
  owner_name,
  header_logo_url,
  sidebar_logo_url
FROM public.shop_settings;

GRANT SELECT ON public.shop_settings_public TO anon, authenticated;
