DROP POLICY IF EXISTS "Barber read appointments" ON public.appointments;
CREATE POLICY "Barber read own appointments" ON public.appointments
  FOR SELECT
  USING (is_barber() AND barber_id = get_my_barber_id());