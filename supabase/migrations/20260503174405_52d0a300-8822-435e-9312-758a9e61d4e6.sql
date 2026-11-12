
-- Add WhatsApp + Email contact fields and YouTube share toggle to publication settings.
ALTER TABLE public.blog_publication_settings
  ADD COLUMN IF NOT EXISTS social_whatsapp text,
  ADD COLUMN IF NOT EXISTS social_email text,
  ADD COLUMN IF NOT EXISTS share_youtube_enabled boolean NOT NULL DEFAULT false;

-- Default the share toggles to the user's preferred set: WhatsApp, Facebook,
-- Instagram, YouTube, Email. Existing row gets updated to match.
UPDATE public.blog_publication_settings
SET share_whatsapp_enabled = true,
    share_facebook_enabled = true,
    share_instagram_enabled = true,
    share_youtube_enabled = true,
    share_email_enabled = true,
    share_x_enabled = false,
    share_threads_enabled = false,
    share_linkedin_enabled = false,
    share_copy_enabled = true
WHERE singleton = true;
