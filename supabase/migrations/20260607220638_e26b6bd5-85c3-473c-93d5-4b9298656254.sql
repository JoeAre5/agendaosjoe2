
UPDATE public.appointments
SET booking_source = 'acuity_sync'
WHERE acuity_id IS NOT NULL
  AND created_by_role IS NULL
  AND (booking_source IS DISTINCT FROM 'acuity_sync');

CREATE OR REPLACE FUNCTION public.enforce_acuity_booking_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.acuity_id IS NOT NULL AND NEW.created_by_role IS NULL THEN
    NEW.booking_source := 'acuity_sync';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_acuity_booking_source ON public.appointments;
CREATE TRIGGER trg_enforce_acuity_booking_source
BEFORE INSERT OR UPDATE OF acuity_id, created_by_role, booking_source
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_acuity_booking_source();

WITH ineligible_awards AS (
  SELECT l.id              AS ledger_id,
         l.client_id,
         l.points,
         l.source_type,
         l.source_appointment_id,
         COALESCE(a.booking_source, 'unknown') AS booking_source
  FROM public.client_rewards_ledger l
  LEFT JOIN public.appointments a ON a.id = l.source_appointment_id
  WHERE l.source_type IN ('spending','matching_bonus','launch_bonus')
    AND l.points > 0
    AND COALESCE(a.booking_source, 'unknown') <> 'pwa'
    AND NOT EXISTS (
      SELECT 1 FROM public.client_rewards_ledger c
      WHERE c.source_type = 'manual_adjust'
        AND c.client_id = l.client_id
        AND (c.metadata->>'original_ledger_id')::uuid = l.id
        AND (c.metadata->>'chargeback')::boolean IS TRUE
    )
)
INSERT INTO public.client_rewards_ledger (
  client_id, points, source_type, source_appointment_id, description_es, description_en, metadata, created_at
)
SELECT client_id,
       -points,
       'manual_adjust',
       source_appointment_id,
       'Reverso: cita no proviene del portal del cliente',
       'Chargeback: appointment not from client portal',
       jsonb_build_object(
         'chargeback', true,
         'pass', 2,
         'reason', 'Source re-attribution: appointment not PWA-originated',
         'original_ledger_id', ledger_id,
         'original_source_type', source_type,
         'original_points', points,
         'booking_source', booking_source
       ),
       now()
FROM ineligible_awards;
