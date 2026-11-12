ALTER TABLE public.barbers
ADD COLUMN IF NOT EXISTS bonus_threshold_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.barbers.bonus_threshold_cents IS 'Weekly gross production (in cents) at which the barber commission rate is bumped by +6 percentage points for that week. 0 = disabled.';