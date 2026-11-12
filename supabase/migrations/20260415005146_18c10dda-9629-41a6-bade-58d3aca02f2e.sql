-- Add cancel_window_hours to booking_rules
ALTER TABLE public.booking_rules
  ADD COLUMN IF NOT EXISTS cancel_window_hours integer NOT NULL DEFAULT 24;

-- Allow clients to read global active booking rules
CREATE POLICY "Client read global rules"
  ON public.booking_rules FOR SELECT
  TO authenticated
  USING (is_client() AND scope = 'global' AND is_active = true);