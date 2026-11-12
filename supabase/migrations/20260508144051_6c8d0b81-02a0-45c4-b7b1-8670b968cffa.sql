
ALTER TABLE public.booking_rules
  ADD COLUMN IF NOT EXISTS cancel_deadline_type TEXT NOT NULL DEFAULT 'midnight_day_before';

ALTER TABLE public.booking_rules
  DROP CONSTRAINT IF EXISTS booking_rules_cancel_deadline_type_check;

ALTER TABLE public.booking_rules
  ADD CONSTRAINT booking_rules_cancel_deadline_type_check
  CHECK (cancel_deadline_type IN ('hours_before','midnight_day_before'));

-- Ensure a global row exists with the new policy
INSERT INTO public.booking_rules (scope, cancel_window_hours, cancel_deadline_type, is_active)
SELECT 'global', 24, 'midnight_day_before', true
WHERE NOT EXISTS (SELECT 1 FROM public.booking_rules WHERE scope = 'global');

UPDATE public.booking_rules
   SET cancel_deadline_type = 'midnight_day_before'
 WHERE scope = 'global';
