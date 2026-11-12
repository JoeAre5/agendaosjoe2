-- Add unique constraint for acuity_type_id + barber_id
ALTER TABLE public.services ADD CONSTRAINT services_acuity_type_barber_unique UNIQUE (acuity_type_id, barber_id);

-- Allow service_role to delete from services (needed for sync)
CREATE POLICY "Service role full access services"
ON public.services
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
