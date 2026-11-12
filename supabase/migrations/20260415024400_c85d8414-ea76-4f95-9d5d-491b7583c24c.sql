
-- Add new columns to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS notify_sms_appointments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_whatsapp_appointments boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_email_appointments boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_sms_marketing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_whatsapp_marketing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_email_marketing boolean NOT NULL DEFAULT false;

-- Client avatar storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-avatars', 'client-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Clients upload own avatar"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Clients update own avatar"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'client-avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Public read client avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-avatars');
