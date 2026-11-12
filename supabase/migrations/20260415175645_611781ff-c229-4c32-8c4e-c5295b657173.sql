
-- Allow multiple blocks per barber per day (e.g. morning + afternoon)
ALTER TABLE public.working_hours DROP CONSTRAINT IF EXISTS working_hours_barber_id_day_of_week_key;
DROP INDEX IF EXISTS idx_working_hours_barber_day;
CREATE INDEX idx_working_hours_barber_day ON public.working_hours (barber_id, day_of_week);
