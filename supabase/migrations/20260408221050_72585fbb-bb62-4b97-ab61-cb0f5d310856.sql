
-- Add avatar_url column to barbers
ALTER TABLE public.barbers ADD COLUMN IF NOT EXISTS avatar_url text;

-- Create storage bucket for barber avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('barber-avatars', 'barber-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access
CREATE POLICY "Barber avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'barber-avatars');

-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload barber avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'barber-avatars');

-- Authenticated users can update
CREATE POLICY "Authenticated users can update barber avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'barber-avatars');

-- Authenticated users can delete
CREATE POLICY "Authenticated users can delete barber avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'barber-avatars');
