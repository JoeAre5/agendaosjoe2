DROP POLICY IF EXISTS "Barber read own appointments" ON public.appointments;
CREATE POLICY "Barber read all appointments" ON public.appointments FOR SELECT USING (is_barber());

DROP POLICY IF EXISTS "Barber read own appointments" ON public.block_times;
CREATE POLICY "Barber read all block_times" ON public.block_times FOR SELECT USING (is_barber());