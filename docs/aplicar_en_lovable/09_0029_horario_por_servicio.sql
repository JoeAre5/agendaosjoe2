-- 0029 — Horario propio por servicio (agenda nativa).
--
-- Pedido del cliente: servicios como HORARIO VIP y LA EXPERIENCIA se ofrecen de 7 a. m. a 7 p. m.,
-- por encima del horario normal de la tienda y del barbero. Si un servicio tiene filas activas aqui,
-- su disponibilidad semanal es ESTA (reemplaza horario de tienda y de barbero). Sin filas = el
-- comportamiento de siempre. Las excepciones por fecha (cierres, vacaciones) siguen ganando, y las
-- citas, bloqueos y reservas temporales siguen impidiendo el choque.
--
-- Rollback:
--   DROP TABLE public.service_hours;

CREATE TABLE IF NOT EXISTS public.service_hours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL DEFAULT public.current_shop_id() REFERENCES public.shops(id) ON DELETE CASCADE,
  service_id  uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0 = domingo
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_hours_range CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_service_hours_service ON public.service_hours (service_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_service_hours_shop ON public.service_hours (shop_id);

ALTER TABLE public.service_hours ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_hours FROM anon;

DROP POLICY IF EXISTS "Owner manage service hours" ON public.service_hours;
CREATE POLICY "Owner manage service hours" ON public.service_hours
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Barber read service hours" ON public.service_hours;
CREATE POLICY "Barber read service hours" ON public.service_hours
  FOR SELECT TO authenticated USING (public.is_barber());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_hours TO authenticated, service_role;
