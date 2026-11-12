ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS hero_image_url text;

CREATE OR REPLACE VIEW public.shop_settings_public
WITH (security_invoker=on) AS
SELECT id, shop_name, address, city, phone, whatsapp, email, maps_url, hours, timezone,
       legal_entity, owner_name, header_logo_url, sidebar_logo_url, hero_image_url
FROM public.shop_settings;

GRANT SELECT ON public.shop_settings_public TO anon, authenticated;