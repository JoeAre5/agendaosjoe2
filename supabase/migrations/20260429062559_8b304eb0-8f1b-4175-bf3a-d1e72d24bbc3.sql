ALTER TABLE public.pending_recurring_pushes
ADD COLUMN IF NOT EXISTS event_keys text[] NOT NULL DEFAULT ARRAY[]::text[];