-- 0033 — Ajustes para que los avisos hacia GHL coincidan con los flujos armados (revision del 17-nov-2026).
--
-- 1. Reagendaciones: el aviso booking.rescheduled tambien sale cuando cambia SOLO el barbero (misma hora). El SMS
--    del flujo dice "antes X, ahora Y" con horas; con la misma hora quedaria "antes 11:00, ahora 11:00". Ahora el
--    aviso lleva `time_changed` y `barber_changed` para que GHL pueda terminar el flujo si la hora no cambio.
-- 2. Recordatorios al reagendar: booking_reminders_sent recuerda que ya se mando el de 24 h / 2 h. Si la cita se mueve
--    a otra hora, esas marcas se borran para que los recordatorios se calculen con la hora nueva.
-- 3. Recordatorios: no se emiten si la cita no tiene telefono (el flujo de GHL solo manda SMS) ni si el cliente
--    desactivo los SMS de citas en su perfil (clients.notify_sms_appointments = false).
-- 4. Todos los avisos de cita llevan data.client.notify_sms_appointments, para que los flujos de GHL puedan respetarlo.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS appointments_reset_reminders ON public.appointments;
--   DROP FUNCTION IF EXISTS public.appointments_reset_reminders();
--   y reaplicar 0025 (trigger de citas), 0032 (payload, recordatorios y ejemplo) para volver a las versiones anteriores.

-- ─── Carga util: igual que 0032, anadiendo notify_sms_appointments al cliente ───
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
      'is_recurring_client', coalesce((SELECT c.is_recurring_client FROM public.clients c WHERE c.id = _a.client_id), false),
      'notify_sms_appointments', coalesce((SELECT c.notify_sms_appointments FROM public.clients c WHERE c.id = _a.client_id), true)
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
REVOKE ALL ON FUNCTION public.outbound_appointment_payload(public.appointments) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_appointment_payload(public.appointments) TO service_role;

-- ─── Disparador de citas: igual que 0025; booking.rescheduled lleva time_changed y barber_changed ───
CREATE OR REPLACE FUNCTION public.appointments_outbound_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _payload jsonb;
  _changed jsonb;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      _payload := public.outbound_appointment_payload(NEW);
      IF NEW.status IS DISTINCT FROM 'cancelled' THEN
        PERFORM public.emit_outbound_event('booking.created', 'appointment', NEW.id, NEW.shop_id, _payload);
      END IF;
      IF coalesce(NEW.paid, false) THEN
        PERFORM public.emit_outbound_event('booking.paid', 'appointment', NEW.id, NEW.shop_id, _payload);
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      _payload := public.outbound_appointment_payload(NEW);
      IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
        PERFORM public.emit_outbound_event('booking.cancelled', 'appointment', NEW.id, NEW.shop_id, _payload);
      ELSIF NEW.status IN ('no_show', 'no-show') AND OLD.status NOT IN ('no_show', 'no-show') THEN
        PERFORM public.emit_outbound_event('booking.no_show', 'appointment', NEW.id, NEW.shop_id, _payload);
      ELSIF NEW.status NOT IN ('cancelled', 'no_show', 'no-show') THEN
        IF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.barber_id IS DISTINCT FROM OLD.barber_id THEN
          PERFORM public.emit_outbound_event('booking.rescheduled', 'appointment', NEW.id, NEW.shop_id,
            _payload || jsonb_build_object(
              'time_changed', NEW.starts_at IS DISTINCT FROM OLD.starts_at,
              'barber_changed', NEW.barber_id IS DISTINCT FROM OLD.barber_id,
              'previous', jsonb_build_object(
                'starts_at', OLD.starts_at, 'ends_at', OLD.ends_at,
                'barber', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM public.barbers b WHERE b.id = OLD.barber_id))));
        END IF;
        SELECT coalesce(jsonb_agg(v.f), '[]'::jsonb) INTO _changed FROM (VALUES
          ('service',  OLD.service_name IS DISTINCT FROM NEW.service_name OR OLD.service_ref_id IS DISTINCT FROM NEW.service_ref_id),
          ('price',    OLD.price_cents IS DISTINCT FROM NEW.price_cents),
          ('duration', OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes),
          ('addons',   OLD.addons IS DISTINCT FROM NEW.addons),
          ('items',    OLD.edit_line_items IS DISTINCT FROM NEW.edit_line_items),
          ('notes',    OLD.notes IS DISTINCT FROM NEW.notes),
          ('label',    OLD.label IS DISTINCT FROM NEW.label),
          ('client',   OLD.client_id IS DISTINCT FROM NEW.client_id OR OLD.client_name IS DISTINCT FROM NEW.client_name
                       OR OLD.client_email IS DISTINCT FROM NEW.client_email OR OLD.client_phone IS DISTINCT FROM NEW.client_phone)
        ) AS v(f, diff) WHERE v.diff;
        IF jsonb_array_length(_changed) > 0 THEN
          PERFORM public.emit_outbound_event('booking.updated', 'appointment', NEW.id, NEW.shop_id,
            _payload || jsonb_build_object('changed', _changed));
        END IF;
      END IF;
      IF NOT coalesce(OLD.paid, false) AND coalesce(NEW.paid, false) THEN
        PERFORM public.emit_outbound_event('booking.paid', 'appointment', NEW.id, NEW.shop_id, _payload);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- la cita siempre se guarda
  END;
  RETURN NEW;
END;
$$;

-- ─── Al cambiar la hora de una cita, sus recordatorios se calculan de nuevo ───
CREATE OR REPLACE FUNCTION public.appointments_reset_reminders()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    DELETE FROM public.booking_reminders_sent WHERE appointment_id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- la cita siempre se guarda
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_reset_reminders ON public.appointments;
CREATE TRIGGER appointments_reset_reminders
  AFTER UPDATE OF starts_at ON public.appointments
  FOR EACH ROW WHEN (OLD.starts_at IS DISTINCT FROM NEW.starts_at)
  EXECUTE FUNCTION public.appointments_reset_reminders();

-- ─── Recordatorios: igual que 0032; omite citas sin telefono y clientes con SMS de citas desactivados ───
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
         AND coalesce(btrim(a.client_phone), '') <> ''        -- el flujo de GHL solo manda SMS
         AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = a.client_id AND c.notify_sms_appointments = false)
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

-- ─── Ejemplo de prueba: igual que 0032; el cliente de ejemplo lleva notify_sms_appointments y la reagendacion time_changed/barber_changed ───
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
                                                             'is_recurring_client', false, 'notify_sms_appointments', true));
    IF _barber.id IS NULL THEN
      _d := _d || jsonb_build_object('barber', jsonb_build_object('id', NULL, 'name', 'Barbero de ejemplo'));
    END IF;
    IF _event_type = 'booking.rescheduled' THEN
      _prev := jsonb_build_object('starts_at', _start - interval '1 day',
                                  'ends_at', _start - interval '1 day' + make_interval(mins => coalesce(_svc.duration_minutes, 30)),
                                  'barber', _d->'barber');
      _d := _d || jsonb_build_object('previous', _prev, 'time_changed', true, 'barber_changed', false);
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
