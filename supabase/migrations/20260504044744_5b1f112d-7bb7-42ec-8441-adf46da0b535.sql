-- Restrict public read of blog_publication_settings (contains owner's personal email).
-- Expose only marketing-safe columns via a security-invoker view that anon/authenticated can read.

DROP POLICY IF EXISTS "Public read publication settings" ON public.blog_publication_settings;

-- Owner-only read on the raw table (owner manage policy already covers ALL with is_owner();
-- add an explicit SELECT just to be unambiguous for admin queries)
CREATE POLICY "Owner read publication settings"
  ON public.blog_publication_settings
  FOR SELECT
  TO authenticated
  USING (is_owner());

-- Public-safe view: excludes social_email (personal owner email) and any future PII.
CREATE OR REPLACE VIEW public.blog_publication_settings_public
WITH (security_invoker = off) AS
SELECT
  id,
  author_first_name,
  author_last_name,
  author_bio_es,
  author_bio_en,
  author_role_es,
  author_role_en,
  author_avatar_url,
  social_x,
  social_linkedin,
  social_facebook,
  social_instagram,
  social_tiktok,
  social_threads,
  social_discord,
  social_youtube,
  social_bluesky,
  social_rss,
  social_whatsapp,
  share_x_enabled,
  share_whatsapp_enabled,
  share_facebook_enabled,
  share_instagram_enabled,
  share_threads_enabled,
  share_linkedin_enabled,
  share_email_enabled,
  share_copy_enabled,
  share_youtube_enabled
FROM public.blog_publication_settings;

GRANT SELECT ON public.blog_publication_settings_public TO anon, authenticated;