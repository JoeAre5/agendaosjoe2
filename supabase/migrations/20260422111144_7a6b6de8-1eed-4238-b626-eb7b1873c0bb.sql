ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz NULL;

COMMENT ON COLUMN public.clients.onboarding_completed_at IS 'Timestamp when client finished the welcome tutorial. NULL until first completion. Updated only on first completion (replay does not overwrite).';