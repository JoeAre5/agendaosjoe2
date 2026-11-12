
-- =============================================
-- 1. service_addons table
-- =============================================
CREATE TABLE public.service_addons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acuity_addon_id integer NOT NULL,
  name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 0,
  price_cents integer NOT NULL DEFAULT 0,
  barber_id uuid REFERENCES public.barbers(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_addons_acuity_barber_unique UNIQUE (acuity_addon_id, barber_id)
);

ALTER TABLE public.service_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barber read active addons" ON public.service_addons
  FOR SELECT TO authenticated USING (is_barber() AND is_active = true);

CREATE POLICY "Owner full access addons" ON public.service_addons
  FOR ALL TO authenticated USING (is_owner());

CREATE POLICY "Service role full access addons" ON public.service_addons
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- 2. booking_rules table
-- =============================================
CREATE TABLE public.booking_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope text NOT NULL DEFAULT 'global',
  barber_id uuid REFERENCES public.barbers(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  min_advance_minutes integer NOT NULL DEFAULT 60,
  max_advance_days integer NOT NULL DEFAULT 90,
  padding_before_minutes integer NOT NULL DEFAULT 0,
  padding_after_minutes integer NOT NULL DEFAULT 0,
  slot_interval_minutes integer NOT NULL DEFAULT 15,
  max_per_day integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_rules_scope_unique UNIQUE (scope, barber_id, service_id)
);

ALTER TABLE public.booking_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barber read active rules" ON public.booking_rules
  FOR SELECT TO authenticated USING (is_barber() AND is_active = true);

CREATE POLICY "Owner full access rules" ON public.booking_rules
  FOR ALL TO authenticated USING (is_owner());

CREATE POLICY "Service role full access rules" ON public.booking_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_booking_rules_updated_at
  BEFORE UPDATE ON public.booking_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default global rule
INSERT INTO public.booking_rules (scope, barber_id, service_id, min_advance_minutes, max_advance_days, padding_before_minutes, padding_after_minutes, slot_interval_minutes)
VALUES ('global', NULL, NULL, 60, 90, 0, 0, 15);

-- =============================================
-- 3. Missing fields on services
-- =============================================
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS addon_ids integer[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS padding_before_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS padding_after_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS scheduling_url text,
  ADD COLUMN IF NOT EXISTS form_ids integer[] DEFAULT '{}';

-- =============================================
-- 4. Missing fields on barbers
-- =============================================
ALTER TABLE public.barbers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Puerto_Rico',
  ADD COLUMN IF NOT EXISTS description text;

-- =============================================
-- 5. Missing fields on appointments
-- =============================================
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS price_sold_cents integer,
  ADD COLUMN IF NOT EXISTS certificate_code text,
  ADD COLUMN IF NOT EXISTS form_responses text;

-- =============================================
-- 6. Missing fields on clients
-- =============================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS card_brand text;
