CREATE TABLE IF NOT EXISTS public.shop_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week SMALLINT NOT NULL,
  start_time TIME WITHOUT TIME ZONE NOT NULL,
  end_time TIME WITHOUT TIME ZONE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT shop_hours_day_of_week_unique UNIQUE (day_of_week)
);

ALTER TABLE public.shop_hours ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_shop_hours_day_of_week ON public.shop_hours(day_of_week);
CREATE INDEX IF NOT EXISTS idx_working_hours_barber_day ON public.working_hours(barber_id, day_of_week);

CREATE OR REPLACE FUNCTION public.validate_schedule_time_range()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.day_of_week < 0 OR NEW.day_of_week > 6 THEN
    RAISE EXCEPTION 'day_of_week must be between 0 and 6';
  END IF;

  IF NEW.is_active AND NEW.start_time >= NEW.end_time THEN
    RAISE EXCEPTION 'start_time must be before end_time when active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_shop_hours_time_range ON public.shop_hours;
CREATE TRIGGER validate_shop_hours_time_range
BEFORE INSERT OR UPDATE ON public.shop_hours
FOR EACH ROW
EXECUTE FUNCTION public.validate_schedule_time_range();

DROP TRIGGER IF EXISTS validate_working_hours_time_range ON public.working_hours;
CREATE TRIGGER validate_working_hours_time_range
BEFORE INSERT OR UPDATE ON public.working_hours
FOR EACH ROW
EXECUTE FUNCTION public.validate_schedule_time_range();

DROP TRIGGER IF EXISTS update_shop_hours_updated_at ON public.shop_hours;
CREATE TRIGGER update_shop_hours_updated_at
BEFORE UPDATE ON public.shop_hours
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.working_hours
  DROP CONSTRAINT IF EXISTS working_hours_barber_id_day_of_week_key;

ALTER TABLE public.working_hours
  ADD CONSTRAINT working_hours_barber_id_day_of_week_key UNIQUE (barber_id, day_of_week);

DROP POLICY IF EXISTS "Team read shop hours" ON public.shop_hours;
CREATE POLICY "Team read shop hours"
ON public.shop_hours
FOR SELECT
TO authenticated
USING (is_barber() OR is_owner());

DROP POLICY IF EXISTS "Owner full access shop hours" ON public.shop_hours;
CREATE POLICY "Owner full access shop hours"
ON public.shop_hours
FOR ALL
TO authenticated
USING (is_owner())
WITH CHECK (is_owner());

DROP POLICY IF EXISTS "Barber read own working_hours" ON public.working_hours;
DROP POLICY IF EXISTS "Team read working_hours" ON public.working_hours;
CREATE POLICY "Team read working_hours"
ON public.working_hours
FOR SELECT
TO authenticated
USING (is_barber() OR is_owner());

DROP POLICY IF EXISTS "Barber manage own working_hours" ON public.working_hours;
CREATE POLICY "Barber manage own working_hours"
ON public.working_hours
FOR ALL
TO authenticated
USING (
  is_barber() AND barber_id = (
    SELECT profiles.barber_id
    FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
)
WITH CHECK (
  is_barber() AND barber_id = (
    SELECT profiles.barber_id
    FROM public.profiles
    WHERE profiles.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Owner full access working_hours" ON public.working_hours;
CREATE POLICY "Owner full access working_hours"
ON public.working_hours
FOR ALL
TO authenticated
USING (is_owner())
WITH CHECK (is_owner());