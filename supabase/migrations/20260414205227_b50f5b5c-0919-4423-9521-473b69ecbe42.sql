
-- Remove the broad authenticated policy
DROP POLICY IF EXISTS "Authenticated read active barbers" ON public.barbers;

-- Allow clients to read only active barbers (for the view to work)
-- The barbers_public view filters sensitive columns
CREATE POLICY "Client read active barbers"
  ON public.barbers
  FOR SELECT
  TO authenticated
  USING (is_client() AND is_active = true);

-- Allow barbers to read all active barbers (they need calendar keys etc for scheduling)
CREATE POLICY "Barber read active barbers"
  ON public.barbers
  FOR SELECT
  TO authenticated
  USING (is_barber() AND is_active = true);
