DO $$
DECLARE
  v_group uuid := gen_random_uuid();
BEGIN
  UPDATE public.appointments
     SET recurring_group_id = v_group,
         is_recurring = true,
         updated_at = now()
   WHERE client_id = '64392beb-16fa-4603-8e0b-c3fc98a8fb09'
     AND status = 'scheduled'
     AND starts_at >= '2026-05-15T00:00:00-04:00'
     AND starts_at <= '2026-07-31T23:59:59-04:00';
END $$;