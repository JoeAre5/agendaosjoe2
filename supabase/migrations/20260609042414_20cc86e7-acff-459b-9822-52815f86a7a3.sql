CREATE OR REPLACE FUNCTION public.enforce_acuity_booking_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.acuity_id IS NOT NULL THEN
    IF NEW.created_by_role = 'client_app' THEN
      NEW.booking_source := 'pwa';
    ELSIF NEW.created_by_role = 'public_site' THEN
      NEW.booking_source := 'public_site';
    ELSIF NEW.created_by_role IS NULL
      AND COALESCE(NEW.booking_source, 'unknown') IN ('unknown', 'acuity_sync') THEN
      NEW.booking_source := 'acuity_sync';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

UPDATE public.appointments
SET booking_source = CASE
      WHEN created_by_role = 'client_app' THEN 'pwa'
      WHEN created_by_role = 'public_site' THEN 'public_site'
      ELSE booking_source
    END
WHERE created_by_role IN ('client_app', 'public_site')
  AND booking_source IS DISTINCT FROM CASE
      WHEN created_by_role = 'client_app' THEN 'pwa'
      WHEN created_by_role = 'public_site' THEN 'public_site'
      ELSE booking_source
    END;