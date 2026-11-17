-- 0032 — Cliente recurrente (de confianza): marca por CLIENTE, no por cita.
--
-- Pedido del dueno (17-nov-2026): los clientes recurrentes (su lista de ~20 personas) reciben SOLO el
-- recordatorio de 2 horas; NO el de 24 horas, NI avisos de cancelacion, NI de reagendacion.
-- La marca existente `appointments.is_recurring` es por CITA y solo la llevan las citas creadas como serie:
-- unas 60 citas futuras de esos clientes (citas sueltas) quedaban sin marca. Esta migracion agrega la marca
-- al cliente y la usa en dos sitios:
--   1. Los avisos hacia GHL llevan `data.client.is_recurring_client` (ademas de `data.is_recurring`), para que los
--      flujos de cancelaciones y reagendaciones terminen sin SMS.
--   2. emit_booking_reminders omite el recordatorio de 24 h de una cita recurrente (de serie o de cliente
--      recurrente) y SIEMPRE emite el de 2 h. Asi esos clientes no generan ejecuciones de 24 h.
--
-- La columna se lee desde la app con GRANT por columna (la tabla clients revoca SELECT general a authenticated;
-- migracion 20260501111636). UPDATE ya esta concedido a nivel de tabla.
--
-- Rollback:
--   ALTER TABLE public.clients DROP COLUMN is_recurring_client;
--   y reaplicar 0025 (payload), 0031 (recordatorios y ejemplo) para volver a las funciones anteriores.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_recurring_client boolean NOT NULL DEFAULT false;
GRANT SELECT (is_recurring_client) ON public.clients TO authenticated;

-- ─── Carga util de las citas: igual que 0025, anadiendo is_recurring_client al cliente ───
CREATE OR REPLACE FUNCTION public.outbound_appointment_payload(_a public.appointments)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'appointment_id', _a.id,
    'status', _a.status,
    'starts_at', _a.starts_at,
    'ends_at', _a.ends_at,
    'duration_minutes', _a.duration_minutes,
    'service', jsonb_build_object('id', _a.service_ref_id, 'name', _a.service_name),
    'addons', to_jsonb(coalesce(_a.addons, ARRAY[]::text[])),
    'barber', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM public.barbers b WHERE b.id = _a.barber_id),
    'client', jsonb_build_object(
      'id', _a.client_id,
      'name', _a.client_name,
      'first_name', (SELECT c.first_name FROM public.clients c WHERE c.id = _a.client_id),
      'last_name', (SELECT c.last_name FROM public.clients c WHERE c.id = _a.client_id),
      'email', CASE WHEN lower(coalesce(_a.client_email, '')) LIKE '%@placeholder.local' THEN NULL ELSE _a.client_email END,
      'phone', _a.client_phone,
      'is_recurring_client', coalesce((SELECT c.is_recurring_client FROM public.clients c WHERE c.id = _a.client_id), false)
    ),
    'price_cents', _a.price_cents,
    'paid', _a.paid,
    'payment_method', _a.payment_method,
    'amount_paid_cents', _a.amount_paid_cents,
    'tip_cents', _a.tip_cents,
    'booking_source', _a.booking_source,
    'created_by_role', _a.created_by_role,
    'is_recurring', _a.is_recurring,
    'recurring_group_id', _a.recurring_group_id,
    'label', _a.label,
    'notes', _a.notes,
    'cancelled_at', _a.cancelled_at,
    'cancelled_by_role', _a.cancelled_by_role,
    'refund_status', _a.refund_status,
    'created_at', _a.created_at,
    'updated_at', _a.updated_at
  );
$$;

-- ─── Recordatorios: igual que 0031; el de 24 h se omite para citas/clientes recurrentes, el de 2 h siempre sale ───
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
         AND (
           _kind.kind = '2h'                                  -- el de 2 h sale para todos
           OR NOT (
             coalesce(a.is_recurring, false)                  -- el de 24 h no sale para series ni clientes recurrentes
             OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = a.client_id AND c.is_recurring_client)
           )
         )
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
REVOKE ALL ON FUNCTION public.outbound_appointment_payload(public.appointments) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_appointment_payload(public.appointments) TO service_role;

-- ─── Ejemplo de prueba: igual que 0031, con is_recurring_client en el cliente de ejemplo ───
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
                                                             'last_name', 'Ejemplo', 'email', 'ejemplo@example.com', 'phone', '7875550100',
                                                             'is_recurring_client', false));
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
