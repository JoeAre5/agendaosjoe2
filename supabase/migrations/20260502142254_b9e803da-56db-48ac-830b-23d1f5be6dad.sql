-- Allow any barber (staff) to read all appointments and block times across calendars.
-- Write policies remain unchanged (barbers can only insert/update their own data).
-- This unblocks the calendar visibility toggle for non-owner barbers like Joseph and Hector.

DROP POLICY IF EXISTS "Barber select own appointments" ON public.appointments;

CREATE POLICY "Barber read all appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (is_barber());

-- block_times already has "Barber full access blocks" (ALL → is_barber()), so all barbers
-- can already see all blocks. No change needed there.