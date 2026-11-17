-- 0031 — Avisos de recordatorio de cita hacia GoHighLevel (booking.reminder), emitidos por la base a la hora exacta.
--
-- Problema (17-nov-2026): los recordatorios armados en GHL con pasos de espera "hasta la cita" (Appointment /
-- calendar event) buscan una cita creada DENTRO del calendario de GHL. Las citas llegan por webhook, GHL no tiene
-- esa cita, da la fecha por vencida y sigue al siguiente paso: al cliente le llegaban TODOS los recordatorios de golpe.
--
-- Solucion: la base emite un evento `booking.reminder` justo a las 24 horas y a las 2 horas antes de cada cita
-- activa; GHL solo envia el SMS cuando llega (sin esperas ni "sacar del flujo").
--   * Solo si la cita sigue activa en ese momento (cancelada o reagendada = no se envia el recordatorio viejo).
--   * Una reserva hecha dentro de la ventana NO genera ese recordatorio (reservar con 5 h de margen no manda el de 24 h).
--   * Una vez por cita y tipo (tabla booking_reminders_sent), aunque la tarea corra varias veces.
--   * Margen de 30 min: si la tarea se retrasa un poco se envia; si se retrasa mas, no se envia tarde.
--   * Si en ese momento no hay destino activo para booking.reminder, el recordatorio se marca como visto y NO se
--     acumula: al activar el destino no sale un aluvion de recordatorios atrasados.
--   * Solo SQL: no usa funciones ni claves. El envio sigue la misma via que el resto de eventos (emit_outbound_event).
--
-- Despues de aplicar, apuntar el destino de recordatorios al evento nuevo:
--   UPDATE public.outbound_webhook_endpoints SET event_types = '{booking.reminder}', updated_at = now()
--    WHERE name = 'GHL - 5 Recordatorios';
-- y desplegar outbound-webhook-dispatch (ejemplos de prueba del evento nuevo).
--
-- Rollback:
--   SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'booking-reminders-emit';
--   DROP FUNCTION public.emit_booking_reminders(timestamptz);
--   DROP TABLE public.booking_reminders_sent;
--   (outbound_sample_event vuelve a su version de 0028 reaplicando ese archivo)

CREATE TABLE IF NOT EXISTS public.booking_reminders_sent (
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('24h', '2h')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (appointment_id, kind)
);

ALTER TABLE public.booking_reminders_sent ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_reminders_sent FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.booking_reminders_sent TO service_role;

CREATE OR REPLACE FUNCTION public.emit_booking_reminders(_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _kind   record;
  _a      public.appointments;
  _count  integer := 0;
  _grace  interval := interval '30 minutes';
  _marked integer;
BEGIN
  FOR _kind IN
    SELECT * FROM (VALUES ('24h'::text, interval '24 hours', 1440), ('2h'::text, interval '2 hours', 120)) AS k(kind, lead, minutes)
  LOOP
    FOR _a IN
      SELECT a.*
        FROM public.appointments a
       WHERE a.status IN ('scheduled', 'confirmed')
         AND a.starts_at > _now
         AND a.starts_at - _kind.lead <= _now                -- ya toca
         AND a.starts_at - _kind.lead > _now - _grace        -- y no se paso por mas del margen
         AND a.created_at <= a.starts_at - _kind.lead        -- se reservo ANTES de que tocara (no dentro de la ventana)
         AND NOT EXISTS (SELECT 1 FROM public.booking_reminders_sent r WHERE r.appointment_id = a.id AND r.kind = _kind.kind)
    LOOP
      INSERT INTO public.booking_reminders_sent (appointment_id, kind)
      VALUES (_a.id, _kind.kind)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS _marked = ROW_COUNT;
      CONTINUE WHEN _marked = 0;   -- otra ejecucion ya lo marco

      PERFORM public.emit_outbound_event(
        'booking.reminder', 'appointment', _a.id, _a.shop_id,
        public.outbound_appointment_payload(_a)
          || jsonb_build_object('reminder', jsonb_build_object('kind', _kind.kind, 'minutes_before', _kind.minutes))
      );
      _count := _count + 1;
    END LOOP;
  END LOOP;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_booking_reminders(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emit_booking_reminders(timestamptz) TO service_role;

-- Una tarea cada 10 minutos (solo SQL).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'booking-reminders-emit';
    PERFORM cron.schedule('booking-reminders-emit', '*/10 * * * *', $job$ SELECT public.emit_booking_reminders(); $job$);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo programar booking-reminders-emit: %', SQLERRM;
END;
$$;

-- ─── Ejemplo de prueba del evento nuevo ──────────────────────────────────────
-- Igual que outbound_sample_event de 0028, anadiendo 'booking.reminder' (cita futura + objeto `reminder`).

CREATE OR REPLACE FUNCTION public.outbound_sample_event(_event_type text, _shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _barber public.barbers%ROWTYPE;
  _svc    public.services%ROWTYPE;
  _addon  public.service_addons%ROWTYPE;
  _start  timestamptz := date_trunc('day', now()) + interval '2 days 15 hours';
  _price  integer;
  _row    public.appointments;
  _d      jsonb;
  _prev   jsonb;
BEGIN
  IF _event_type NOT IN ('booking.created','booking.rescheduled','booking.updated','booking.cancelled','booking.no_show','booking.paid','booking.reminder',
                         'service.created','service.updated','service.deleted','addon.created','addon.updated','addon.deleted') THEN
    RAISE EXCEPTION 'unknown_event_type';
  END IF;

  SELECT * INTO _barber FROM public.barbers WHERE shop_id = _shop_id AND is_active ORDER BY name LIMIT 1;
  SELECT * INTO _svc FROM public.services WHERE shop_id = _shop_id AND is_active
    ORDER BY (barber_id IS NOT DISTINCT FROM _barber.id) DESC, name LIMIT 1;
  SELECT * INTO _addon FROM public.service_addons WHERE shop_id = _shop_id AND is_active ORDER BY name LIMIT 1;
  _price := coalesce(_svc.price_cents, 3500);

  IF _event_type LIKE 'booking.%' THEN
    _row := jsonb_populate_record(NULL::public.appointments, jsonb_build_object(
      'id', gen_random_uuid(), 'shop_id', _shop_id,
      'status', CASE _event_type WHEN 'booking.cancelled' THEN 'cancelled' WHEN 'booking.no_show' THEN 'no-show' ELSE 'scheduled' END,
      'starts_at', _start, 'ends_at', _start + make_interval(mins => coalesce(_svc.duration_minutes, 30)),
      'duration_minutes', coalesce(_svc.duration_minutes, 30),
      'service_name', coalesce(_svc.name, 'Corte (ejemplo)'), 'service_ref_id', _svc.id,
      'addons', jsonb_build_array(coalesce(_addon.name, 'Barba (ejemplo)')),
      'barber_id', _barber.id,
      'client_name', 'Cliente Ejemplo', 'client_email', 'ejemplo@example.com', 'client_phone', '7875550100',
      'price_cents', CASE _event_type WHEN 'booking.updated' THEN _price + 500 ELSE _price END,
      'paid', _event_type = 'booking.paid', 'payment_method', CASE _event_type WHEN 'booking.paid' THEN 'stripe' END,
      'amount_paid_cents', CASE _event_type WHEN 'booking.paid' THEN _price + 500 ELSE 0 END,
      'tip_cents', CASE _event_type WHEN 'booking.paid' THEN 500 ELSE 0 END,
      'booking_source', 'public_site', 'created_by_role', 'public_site', 'is_recurring', false,
      'notes', CASE _event_type WHEN 'booking.updated' THEN 'Nota de ejemplo' END,
      'cancelled_at', CASE _event_type WHEN 'booking.cancelled' THEN now() END,
      'cancelled_by_role', CASE _event_type WHEN 'booking.cancelled' THEN 'client' END,
      'created_at', now() - interval '1 day', 'updated_at', now()));
    _d := public.outbound_appointment_payload(_row)
          || jsonb_build_object('client', jsonb_build_object('id', NULL, 'name', 'Cliente Ejemplo', 'first_name', 'Cliente',
                                                             'last_name', 'Ejemplo', 'email', 'ejemplo@example.com', 'phone', '7875550100'));
    IF _barber.id IS NULL THEN
      _d := _d || jsonb_build_object('barber', jsonb_build_object('id', NULL, 'name', 'Barbero de ejemplo'));
    END IF;
    IF _event_type = 'booking.rescheduled' THEN
      _prev := jsonb_build_object('starts_at', _start - interval '1 day',
                                  'ends_at', _start - interval '1 day' + make_interval(mins => coalesce(_svc.duration_minutes, 30)),
                                  'barber', _d->'barber');
      _d := _d || jsonb_build_object('previous', _prev);
    ELSIF _event_type = 'booking.updated' THEN
      _d := _d || jsonb_build_object('changed', jsonb_build_array('price', 'notes'));
    ELSIF _event_type = 'booking.reminder' THEN
      _d := _d || jsonb_build_object('reminder', jsonb_build_object('kind', '24h', 'minutes_before', 1440));
    END IF;
  ELSIF _event_type LIKE 'service.%' THEN
    _d := jsonb_build_object('service_id', coalesce(_svc.id, gen_random_uuid()), 'name', coalesce(_svc.name, 'Corte (ejemplo)'),
      'description', _svc.description, 'category', _svc.category, 'duration_minutes', coalesce(_svc.duration_minutes, 30), 'price_cents', _price,
      'padding_before_minutes', coalesce(_svc.padding_before_minutes, 0), 'padding_after_minutes', coalesce(_svc.padding_after_minutes, 0),
      'barber_id', _svc.barber_id, 'is_active', coalesce(_svc.is_active, true), 'is_public', coalesce(_svc.is_public, true), 'sort_order', coalesce(_svc.sort_order, 0));
    IF _event_type = 'service.updated' THEN _d := _d || jsonb_build_object('changed', jsonb_build_array('price')); END IF;
  ELSE
    _d := jsonb_build_object('addon_id', coalesce(_addon.id, gen_random_uuid()), 'name', coalesce(_addon.name, 'Barba (ejemplo)'),
      'duration_minutes', coalesce(_addon.duration_minutes, 15), 'price_cents', coalesce(_addon.price_cents, 1000),
      'barber_id', _addon.barber_id, 'is_active', coalesce(_addon.is_active, true));
    IF _event_type = 'addon.updated' THEN _d := _d || jsonb_build_object('changed', jsonb_build_array('price')); END IF;
  END IF;

  RETURN public.outbound_enrich(_d, _shop_id) || jsonb_build_object('test', true);
END;
$$;

REVOKE ALL ON FUNCTION public.outbound_sample_event(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_sample_event(text, uuid) TO service_role;
