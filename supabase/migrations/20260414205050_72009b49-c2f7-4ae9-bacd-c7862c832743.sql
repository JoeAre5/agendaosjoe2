
-- Drop existing overly permissive SELECT policies for barbers and clients
DROP POLICY IF EXISTS "Barbers read active" ON public.barbers;
DROP POLICY IF EXISTS "Client read active barbers" ON public.barbers;

-- Create restricted SELECT policy for barbers: only non-sensitive columns via RLS
-- Since RLS can't restrict columns, we create a secure view instead

-- Create a public-safe view for barber data
CREATE OR REPLACE VIEW public.barbers_public
WITH (security_invoker = false)
AS
SELECT
  id,
  name,
  color,
  is_active,
  avatar_url,
  description,
  acuity_calendar_key,
  acuity_calendar_id,
  show_in_checkout,
  is_default_checkout_barber,
  employment_type,
  created_at
FROM public.barbers;

-- Grant access to the view
GRANT SELECT ON public.barbers_public TO anon, authenticated;

-- Re-create narrower policies on the barbers table
-- Barbers can only read their own row from the actual table
CREATE POLICY "Barber read own record"
  ON public.barbers
  FOR SELECT
  TO authenticated
  USING (
    is_barber() AND id = (
      SELECT profiles.barber_id FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- Clients have NO direct access to the barbers table
-- They must use the barbers_public view instead
