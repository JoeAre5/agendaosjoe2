ALTER TABLE public.filho_messages ADD COLUMN IF NOT EXISTS feedback smallint;
CREATE INDEX IF NOT EXISTS idx_filho_messages_feedback ON public.filho_messages (feedback) WHERE feedback IS NOT NULL;