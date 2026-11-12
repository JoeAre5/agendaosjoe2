
CREATE TABLE public.blog_publication_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  author_first_name text DEFAULT 'Charlie',
  author_last_name text DEFAULT 'Corchado',
  author_bio_es text,
  author_bio_en text,
  author_role_es text DEFAULT 'Owner & Master Barber',
  author_role_en text DEFAULT 'Owner & Master Barber',
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
  share_x_enabled boolean NOT NULL DEFAULT true,
  share_whatsapp_enabled boolean NOT NULL DEFAULT true,
  share_facebook_enabled boolean NOT NULL DEFAULT true,
  share_instagram_enabled boolean NOT NULL DEFAULT false,
  share_threads_enabled boolean NOT NULL DEFAULT false,
  share_linkedin_enabled boolean NOT NULL DEFAULT false,
  share_email_enabled boolean NOT NULL DEFAULT true,
  share_copy_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_publication_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read publication settings"
  ON public.blog_publication_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Owner manage publication settings"
  ON public.blog_publication_settings FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

CREATE TRIGGER blog_publication_settings_updated_at
  BEFORE UPDATE ON public.blog_publication_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.blog_publication_settings (singleton) VALUES (true);

INSERT INTO storage.buckets (id, name, public)
  VALUES ('author-avatars', 'author-avatars', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read author avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'author-avatars');

CREATE POLICY "Owner upload author avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'author-avatars' AND is_owner());

CREATE POLICY "Owner update author avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'author-avatars' AND is_owner());

CREATE POLICY "Owner delete author avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'author-avatars' AND is_owner());
