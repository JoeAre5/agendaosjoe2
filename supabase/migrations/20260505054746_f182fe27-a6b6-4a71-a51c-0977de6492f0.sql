INSERT INTO storage.buckets (id, name, public) VALUES ('email-assets', 'email-assets', true) ON CONFLICT (id) DO UPDATE SET public = true;
DO $$ BEGIN
  CREATE POLICY "Email assets public read" ON storage.objects FOR SELECT USING (bucket_id = 'email-assets');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;