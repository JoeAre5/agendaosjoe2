-- 0027 — Excepciones de horario por fecha e intervalo de 30 minutos por defecto (agenda nativa).
--
-- Pedido del cliente: poder cerrar un dia concreto o cambiar el horario de un dia concreto sin tocar
-- el horario semanal. Una excepcion REEMPLAZA el horario semanal (negocio y barbero) de esa fecha para
-- su alcance. barber_id NULL = todos los barberos; la de un barbero gana a la general. Varias filas
-- no cerradas para el mismo alcance y fecha forman un horario partido (por ejemplo con almuerzo).
-- Una cita que ya existe en un dia que luego se cierra NO se cancela: solo deja de ofrecerse ese dia.
--
-- Rollback:
--   DROP TABLE public.schedule_exceptions;
--   ALTER TABLE public.booking_rules ALTER COLUMN slot_interval_minutes SET DEFAULT 15;

CREATE TABLE IF NOT EXISTS public.schedule_exceptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        uuid NOT NULL DEFAULT public.current_shop_id() REFERENCES public.shops(id) ON DELETE CASCADE,
  barber_id      uuid REFERENCES public.barbers(id) ON DELETE CASCADE,   -- NULL = todos los barberos
  exception_date date NOT NULL,                                          -- dia local de la tienda
  is_closed      boolean NOT NULL DEFAULT true,
  start_time     time,
  end_time       time,
  note           text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_exceptions_shape CHECK (
    (is_closed AND start_time IS NULL AND end_time IS NULL)
    OR (NOT is_closed AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_shop_date ON public.schedule_exceptions (shop_id, exception_date);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_barber_date ON public.schedule_exceptions (barber_id, exception_date);

ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_exceptions FROM anon;

-- Dueño: todo. Barbero: lee las generales y las suyas, y gestiona solo las suyas.
DROP POLICY IF EXISTS "Owner manage schedule exceptions" ON public.schedule_exceptions;
CREATE POLICY "Owner manage schedule exceptions" ON public.schedule_exceptions
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Barber read schedule exceptions" ON public.schedule_exceptions;
CREATE POLICY "Barber read schedule exceptions" ON public.schedule_exceptions
  FOR SELECT TO authenticated
  USING (public.is_barber() AND (barber_id IS NULL OR barber_id = public.get_my_barber_id()));

DROP POLICY IF EXISTS "Barber manage own schedule exceptions" ON public.schedule_exceptions;
CREATE POLICY "Barber manage own schedule exceptions" ON public.schedule_exceptions
  FOR ALL TO authenticated
  USING (public.is_barber() AND barber_id IS NOT NULL AND barber_id = public.get_my_barber_id())
  WITH CHECK (public.is_barber() AND barber_id IS NOT NULL AND barber_id = public.get_my_barber_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_exceptions TO authenticated, service_role;

-- Intervalo de horas ofrecidas: 30 min para reglas nuevas (las existentes no cambian).
ALTER TABLE public.booking_rules ALTER COLUMN slot_interval_minutes SET DEFAULT 30;
