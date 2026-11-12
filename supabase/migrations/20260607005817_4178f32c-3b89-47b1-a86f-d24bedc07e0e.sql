
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS header_logo_url text,
  ADD COLUMN IF NOT EXISTS sidebar_logo_url text;

CREATE OR REPLACE VIEW public.shop_settings_public
WITH (security_invoker=on) AS
SELECT id, shop_name, address, city, phone, hours, timezone, legal_entity, owner_name,
       header_logo_url, sidebar_logo_url
FROM public.shop_settings;

GRANT SELECT ON public.shop_settings_public TO anon, authenticated;

-- Storage policies: owners can manage brand/* files in email-assets
DROP POLICY IF EXISTS "Owners upload brand assets" ON storage.objects;
CREATE POLICY "Owners upload brand assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] = 'brand'
  AND public.is_owner()
);

DROP POLICY IF EXISTS "Owners update brand assets" ON storage.objects;
CREATE POLICY "Owners update brand assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] = 'brand'
  AND public.is_owner()
);

DROP POLICY IF EXISTS "Owners delete brand assets" ON storage.objects;
CREATE POLICY "Owners delete brand assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] = 'brand'
  AND public.is_owner()
);
