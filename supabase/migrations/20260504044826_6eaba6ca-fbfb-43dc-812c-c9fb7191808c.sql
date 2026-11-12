DROP POLICY IF EXISTS "Public read publication settings via view" ON public.blog_publication_settings;
DROP VIEW IF EXISTS public.blog_publication_settings_public;

CREATE OR REPLACE FUNCTION public.get_publication_settings_public()
RETURNS TABLE (
  id uuid,
  author_first_name text,
  author_last_name text,
  author_bio_es text,
  author_bio_en text,
  author_role_es text,
  author_role_en text,
  author_avatar_url text,
  social_x text,
  social_linkedin text,
  social_facebook text,
  social_instagram text,
  social_tiktok text,
  social_threads text,
  social_discord text,
  social_youtube text,
  social_bluesky text,
  social_rss text,
  social_whatsapp text,
  share_x_enabled boolean,
  share_whatsapp_enabled boolean,
  share_facebook_enabled boolean,
  share_instagram_enabled boolean,
  share_threads_enabled boolean,
  share_linkedin_enabled boolean,
  share_email_enabled boolean,
  share_copy_enabled boolean,
  share_youtube_enabled boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, author_first_name, author_last_name, author_bio_es, author_bio_en,
    author_role_es, author_role_en, author_avatar_url,
    social_x, social_linkedin, social_facebook, social_instagram, social_tiktok,
    social_threads, social_discord, social_youtube, social_bluesky, social_rss,
    social_whatsapp,
    share_x_enabled, share_whatsapp_enabled, share_facebook_enabled,
    share_instagram_enabled, share_threads_enabled, share_linkedin_enabled,
    share_email_enabled, share_copy_enabled, share_youtube_enabled
  FROM public.blog_publication_settings
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_publication_settings_public() TO anon, authenticated;