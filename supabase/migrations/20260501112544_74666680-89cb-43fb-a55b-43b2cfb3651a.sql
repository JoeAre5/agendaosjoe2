DROP VIEW IF EXISTS public.barbers_public;

CREATE TABLE IF NOT EXISTS public.barbers_public (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  avatar_url text,
  color text,
  description text,
  acuity_calendar_id integer,
  show_in_checkout boolean,
  is_default_checkout_barber boolean,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone
);

ALTER TABLE public.barbers_public ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read safe barbers" ON public.barbers_public;
CREATE POLICY "Public read safe barbers"
ON public.barbers_public
FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE OR REPLACE FUNCTION public.sync_barbers_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.barbers_public (id, name, avatar_url, color, description, acuity_calendar_id, show_in_checkout, is_default_checkout_barber, is_active, created_at)
  VALUES (NEW.id, NEW.name, NEW.avatar_url, NEW.color, NEW.description, NEW.acuity_calendar_id, NEW.show_in_checkout, NEW.is_default_checkout_barber, NEW.is_active, NEW.created_at)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    avatar_url = EXCLUDED.avatar_url,
    color = EXCLUDED.color,
    description = EXCLUDED.description,
    acuity_calendar_id = EXCLUDED.acuity_calendar_id,
    show_in_checkout = EXCLUDED.show_in_checkout,
    is_default_checkout_barber = EXCLUDED.is_default_checkout_barber,
    is_active = EXCLUDED.is_active,
    created_at = EXCLUDED.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_barbers_public_after_write ON public.barbers;
CREATE TRIGGER sync_barbers_public_after_write
AFTER INSERT OR UPDATE ON public.barbers
FOR EACH ROW EXECUTE FUNCTION public.sync_barbers_public();

INSERT INTO public.barbers_public (id, name, avatar_url, color, description, acuity_calendar_id, show_in_checkout, is_default_checkout_barber, is_active, created_at)
SELECT id, name, avatar_url, color, description, acuity_calendar_id, show_in_checkout, is_default_checkout_barber, is_active, created_at
FROM public.barbers
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  avatar_url = EXCLUDED.avatar_url,
  color = EXCLUDED.color,
  description = EXCLUDED.description,
  acuity_calendar_id = EXCLUDED.acuity_calendar_id,
  show_in_checkout = EXCLUDED.show_in_checkout,
  is_default_checkout_barber = EXCLUDED.is_default_checkout_barber,
  is_active = EXCLUDED.is_active,
  created_at = EXCLUDED.created_at;

DROP POLICY IF EXISTS "Barber select appointments" ON public.appointments;
CREATE POLICY "Barber select own appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  public.is_barber()
  AND barber_id = (
    SELECT p.barber_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1
  )
);