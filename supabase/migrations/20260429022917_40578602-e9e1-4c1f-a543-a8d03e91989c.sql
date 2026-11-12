DROP INDEX IF EXISTS public.idx_appointments_refund_execute_at;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS refund_execute_at;