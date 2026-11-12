-- Inbound email handling: extend contact_submissions to also store email replies
ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,
  ADD COLUMN IF NOT EXISTS from_email text,
  ADD COLUMN IF NOT EXISTS to_email text;

CREATE UNIQUE INDEX IF NOT EXISTS contact_submissions_gmail_message_id_uidx
  ON public.contact_submissions (gmail_message_id)
  WHERE gmail_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_submissions_source_status
  ON public.contact_submissions (source, status, created_at DESC);