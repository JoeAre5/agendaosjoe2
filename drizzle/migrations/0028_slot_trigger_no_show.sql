-- 0028 — serialize_barber_slot_writes: la cita "no-show" deja de bloquear el horario.
--
-- ATENCION: reemplaza una funcion EXISTENTE de la base de Charlie (trigger trg_serialize_barber_slot_writes).
-- Requiere aprobacion expresa antes de aplicarse en produccion.
--
-- Problema: la base solo admite el estado 'no-show' (con guion; validate_appointment_status), pero esta
-- funcion filtraba 'no_show' (guion bajo), asi que una cita no-show seguia bloqueando al barbero y el
-- trigger rechazaba con slot_taken una hora que el motor de disponibilidad ya ofrece libre.
-- Cambio unico: el filtro acepta ambas grafias. El resto del cuerpo es identico al de produccion.
--
-- Rollback: volver a crear la funcion con IN ('cancelled','no_show') en las dos comparaciones.
CREATE OR REPLACE FUNCTION public.serialize_barber_slot_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _client boolean;
BEGIN
  IF NEW.barber_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('barber_slot:' || NEW.barber_id::text));
  END IF;
  _client := auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'client')
    AND NOT (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'barber')
      OR public.has_role(auth.uid(),'super_owner') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'staff'));
  IF NEW.status NOT IN ('cancelled','no_show','no-show') AND (NOT coalesce(NEW.overlap_exempt,false) OR _client)
     AND EXISTS (SELECT 1 FROM public.appointments a WHERE a.barber_id=NEW.barber_id
       AND a.id IS DISTINCT FROM NEW.id AND a.status NOT IN ('cancelled','no_show','no-show')
       AND a.starts_at < NEW.ends_at AND a.ends_at > NEW.starts_at) THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE='23P01';
  END IF;
  RETURN NEW;
END $function$;

-- La restriccion de exclusion tambien filtra 'no_show' (0018). Se recrea SOLO si la existente aun usa
-- esa grafia y no la otra; si la base ya la tiene corregida, no hace nada.
-- Rollback: recrear con status <> ALL (ARRAY['cancelled','no_show']).
DO $mig$
DECLARE _def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _def
    FROM pg_constraint
   WHERE conrelid = 'public.appointments'::regclass AND conname = 'appointments_no_barber_overlap';
  IF _def IS NOT NULL AND _def LIKE '%no_show%' AND _def NOT LIKE '%no-show%' THEN
    ALTER TABLE public.appointments DROP CONSTRAINT appointments_no_barber_overlap;
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_no_barber_overlap
      EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
      WHERE (status <> ALL (ARRAY['cancelled'::text, 'no_show'::text, 'no-show'::text]) AND overlap_exempt = false);
  END IF;
END
$mig$;

-- El indice unico de cita exacta solo excluye 'cancelled': una cita no-show impediria volver a reservar
-- exactamente la misma hora. Se recrea solo si aun no menciona no-show. Toma un bloqueo breve de la tabla.
-- Rollback: recrear con WHERE status <> 'cancelled' AND overlap_exempt = false.
DO $mig$
DECLARE _def text;
BEGIN
  SELECT indexdef INTO _def FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'appointments_one_active_exact_slot';
  IF _def IS NOT NULL AND _def NOT LIKE '%no-show%' THEN
    DROP INDEX public.appointments_one_active_exact_slot;
    CREATE UNIQUE INDEX appointments_one_active_exact_slot
      ON public.appointments (barber_id, starts_at, ends_at)
      WHERE status NOT IN ('cancelled', 'no_show', 'no-show') AND overlap_exempt = false;
  END IF;
END
$mig$;
