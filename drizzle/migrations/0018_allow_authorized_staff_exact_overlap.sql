DROP INDEX public.appointments_one_active_exact_slot;
CREATE UNIQUE INDEX appointments_one_active_exact_slot
ON public.appointments (barber_id, starts_at, ends_at)
WHERE status <> 'cancelled' AND overlap_exempt = false;