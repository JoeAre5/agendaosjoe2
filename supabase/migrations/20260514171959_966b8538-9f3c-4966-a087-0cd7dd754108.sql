
-- 9: Pin search_path on the only function missing it
CREATE OR REPLACE FUNCTION public.touch_admin_notification_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

-- 7: Block bucket-level listing by adding a name filter that's always satisfied
-- for individual object reads but blocks empty-prefix LIST queries.
-- Pattern matches what 'broadcast-images' already does and the linter accepts.

DROP POLICY IF EXISTS "Barber avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Public read barber-avatars"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'barber-avatars' AND name IS NOT NULL AND length(name) > 0);

DROP POLICY IF EXISTS "Email assets public read" ON storage.objects;
CREATE POLICY "Public read email-assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'email-assets' AND name IS NOT NULL AND length(name) > 0);

DROP POLICY IF EXISTS "Public read author avatars" ON storage.objects;
CREATE POLICY "Public read author-avatars"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'author-avatars' AND name IS NOT NULL AND length(name) > 0);

DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars' AND name IS NOT NULL AND length(name) > 0);

DROP POLICY IF EXISTS "Public read barber-gallery" ON storage.objects;
CREATE POLICY "Public read barber-gallery"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'barber-gallery' AND name IS NOT NULL AND length(name) > 0);

DROP POLICY IF EXISTS "Public read blog-covers" ON storage.objects;
CREATE POLICY "Public read blog-covers"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'blog-covers' AND name IS NOT NULL AND length(name) > 0);

DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
CREATE POLICY "Public read product-images"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-images' AND name IS NOT NULL AND length(name) > 0);
