ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS last_pushed_at timestamptz;
ALTER TABLE public.block_times ADD COLUMN IF NOT EXISTS last_pushed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_appointments_last_pushed_at ON public.appointments(last_pushed_at) WHERE last_pushed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_block_times_last_pushed_at ON public.block_times(last_pushed_at) WHERE last_pushed_at IS NOT NULL;