CREATE OR REPLACE FUNCTION public.get_pending_badge_counts()
RETURNS TABLE(
  pending_review_count integer,
  contact_count integer,
  recruitment_count integer,
  duplicate_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_owner() OR public.is_barber() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: staff role required';
  END IF;

  RETURN QUERY
  WITH dup AS (
    SELECT t.appointment_id
    FROM public.transactions t
    LEFT JOIN public.appointments a ON a.id = t.appointment_id
    WHERE t.status = 'completed'
      AND t.type = 'service'
      AND t.appointment_id IS NOT NULL
      AND (a.duplicate_dismissed_at IS NULL)
    GROUP BY t.appointment_id
    HAVING count(*) >= 2
  )
  SELECT
    (SELECT count(*)::int FROM public.transactions WHERE status = 'pending_review'),
    (SELECT count(*)::int FROM public.contact_submissions WHERE status = 'new'),
    (SELECT count(*)::int FROM public.recruitment_submissions WHERE status = 'new'),
    (SELECT count(*)::int FROM dup);
END;
$function$;