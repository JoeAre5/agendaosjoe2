ALTER TABLE public.appointments
ADD COLUMN created_by_role text,
ADD COLUMN created_by_user_id uuid;

CREATE INDEX idx_appointments_created_by_role ON public.appointments(created_by_role);
CREATE INDEX idx_appointments_starts_at_created_by_role ON public.appointments(starts_at, created_by_role);

COMMENT ON COLUMN public.appointments.created_by_role IS 'Role of the user who created this appointment from inside the app: admin, barber, or client_app. NULL = imported from Acuity (source unknown).';
COMMENT ON COLUMN public.appointments.created_by_user_id IS 'auth.uid() of the user who created this appointment from inside the app. NULL for Acuity imports.';