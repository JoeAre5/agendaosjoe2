CREATE UNIQUE INDEX IF NOT EXISTS appointments_one_active_exact_slot
ON public.appointments (barber_id, starts_at, ends_at)
WHERE status <> 'cancelled';