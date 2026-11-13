-- 0022 — Agenda nativa, esquema (aditivo y reversible).
--
-- Permite que una cita, un servicio o un complemento existan SIN identificador de
-- Acuity, y agrega las referencias propias que usa la agenda nativa. No cambia ni
-- borra filas. Las tiendas que siguen en Acuity conservan todo lo que usan:
--   * UNIQUE (acuity_id) se mantiene; Postgres trata los NULL como distintos, asi que las
--     citas nativas (acuity_id IS NULL) no chocan y los upsert ON CONFLICT (acuity_id)
--     siguen funcionando igual.
--   * Igual para services (acuity_type_id, barber_id) y service_addons (acuity_addon_id, barber_id).
--
-- La proteccion contra choques NO cambia: la agenda nativa usa el mismo candado por barbero
-- (pg_advisory_xact_lock('barber_slot:' || barber_id)), booking_draft_holds y get_busy_intervals
-- de la migracion 0016.
--
-- Rollback:
--   ALTER TABLE public.appointments DROP COLUMN service_ref_id, DROP COLUMN addon_ref_ids;
--   ALTER TABLE public.booking_drafts DROP COLUMN service_ref_id, DROP COLUMN addon_ref_ids;
--   DROP INDEX idx_appointments_barber_starts, idx_block_times_barber_starts, idx_appointments_service_ref;
--   (volver a poner NOT NULL en las columnas de Acuity solo es posible mientras no existan filas nativas)

-- 1. Los identificadores de Acuity pasan a ser opcionales
ALTER TABLE public.appointments   ALTER COLUMN acuity_id           DROP NOT NULL;
ALTER TABLE public.services       ALTER COLUMN acuity_type_id      DROP NOT NULL;
ALTER TABLE public.service_addons ALTER COLUMN acuity_addon_id     DROP NOT NULL;
ALTER TABLE public.booking_drafts ALTER COLUMN appointment_type_id DROP NOT NULL;
ALTER TABLE public.booking_drafts ALTER COLUMN calendar_id         DROP NOT NULL;

COMMENT ON COLUMN public.appointments.acuity_id IS
  'ID de la cita en Acuity. NULL para citas reservadas por la agenda nativa.';
COMMENT ON COLUMN public.services.acuity_type_id IS
  'ID del tipo de cita en Acuity. NULL para servicios administrados de forma nativa.';
COMMENT ON COLUMN public.service_addons.acuity_addon_id IS
  'ID del complemento en Acuity. NULL para complementos administrados de forma nativa.';

-- 2. Referencias nativas
-- appointments.service_id (integer) es el ID de tipo de Acuity; las citas nativas apuntan a services.id.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_ref_id uuid REFERENCES public.services (id),
  ADD COLUMN IF NOT EXISTS addon_ref_ids  uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.booking_drafts
  ADD COLUMN IF NOT EXISTS service_ref_id uuid REFERENCES public.services (id),
  ADD COLUMN IF NOT EXISTS addon_ref_ids  uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.appointments.service_ref_id IS
  'services.id para reservas nativas (las de Acuity conservan el service_id entero).';
COMMENT ON COLUMN public.appointments.addon_ref_ids IS
  'Lista de service_addons.id para reservas nativas; addons conserva los nombres para mostrar.';

-- 3. Indices de agenda: la disponibilidad lee "citas activas de estos barberos entre dos fechas"
CREATE INDEX IF NOT EXISTS idx_appointments_barber_starts
  ON public.appointments (barber_id, starts_at)
  WHERE status NOT IN ('cancelled', 'no_show', 'no-show');

CREATE INDEX IF NOT EXISTS idx_block_times_barber_starts
  ON public.block_times (barber_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_appointments_service_ref
  ON public.appointments (service_ref_id)
  WHERE service_ref_id IS NOT NULL;

-- 4. shop_hours.day_of_week dentro de 0 (domingo) a 6 (sabado)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_hours_day_of_week_check') THEN
    ALTER TABLE public.shop_hours
      ADD CONSTRAINT shop_hours_day_of_week_check
      CHECK (day_of_week >= 0 AND day_of_week <= 6) NOT VALID;
    BEGIN
      ALTER TABLE public.shop_hours VALIDATE CONSTRAINT shop_hours_day_of_week_check;
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'shop_hours tiene filas fuera de 0..6; la restriccion queda NOT VALID, corrige las filas y valida';
    END;
  END IF;
END $$;
