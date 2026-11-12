
-- Waitlist table
CREATE TABLE public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text,
  phone text,
  service_name text NOT NULL,
  service_duration_minutes integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'waiting',
  requested_at timestamptz NOT NULL DEFAULT now(),
  seated_at timestamptz,
  cancelled_at timestamptz,
  barber_id uuid REFERENCES public.barbers(id),
  appointment_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Owner full access waitlist" ON public.waitlist FOR ALL TO public USING (is_owner()) WITH CHECK (is_owner());
CREATE POLICY "Barber read waitlist" ON public.waitlist FOR SELECT TO authenticated USING (is_barber());
CREATE POLICY "Barber insert waitlist" ON public.waitlist FOR INSERT TO authenticated WITH CHECK (is_barber());
CREATE POLICY "Barber update waitlist" ON public.waitlist FOR UPDATE TO authenticated USING (is_barber()) WITH CHECK (is_barber());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
