ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS refund_execute_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_appointments_refund_pending
ON public.appointments (refund_execute_at)
WHERE refund_status = 'pending_undo';