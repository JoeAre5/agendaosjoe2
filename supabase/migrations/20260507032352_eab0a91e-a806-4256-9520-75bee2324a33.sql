ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS duplicate_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_dismissed_by uuid,
  ADD COLUMN IF NOT EXISTS duplicate_dismissed_reason text;