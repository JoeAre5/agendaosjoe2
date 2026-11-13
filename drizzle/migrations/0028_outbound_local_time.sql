-- 0028 — Webhooks de salida: hora local de la tienda e importes en dólares en el contenido.
--
-- Pedido por el cliente para armar sus flujos de GoHighLevel: "Fecha de Cita" y "Hora de Cita" ("10:00 AM") deben
-- llegar ya en hora de Puerto Rico, no en UTC. Se completa el contenido justo antes de guardarlo, sin tocar los
-- disparadores de 0025: `emit_outbound_event` pasa los datos por `outbound_enrich`.
--
-- Campos que se AGREGAN (nada se quita ni se renombra; los de 0025 siguen igual):
--   timezone                      zona de la tienda (por ejemplo America/Puerto_Rico)
--   starts_local / ends_local     { iso, date, time ("9:00 AM"), time_24h, weekday ("viernes"), date_text ("viernes 8 de enero de 2027") }
--   previous.starts_local / ends_local   igual, en eventos de reprogramación
--   price, amount_paid, tip       en dólares (price_cents / 100), solo si existe la clave en centavos
--
-- Si algo falla al completar, se envía el contenido original: un fallo aquí nunca bloquea ni cambia una reserva.
-- Segunda parte: EJEMPLOS COMPLETOS por tipo de evento, para que el cliente configure sus flujos de GoHighLevel
-- ("Fetch sample requests") con el contenido real y no con una muestra reducida:
--   outbound_sample_event(tipo, tienda)      arma el contenido con la MISMA función que usan los eventos reales
--   send_test_webhook(destino, tipo)         pide a outbound-webhook-dispatch que lo envíe SOLO a ese destino
-- Uso (desde el editor SQL):  SELECT public.send_test_webhook('<id-del-destino>', 'booking.rescheduled');
-- El ejemplo lleva data.test = true y no se guarda como evento ni toca ninguna cita.
--
-- Aplicar DESPUÉS de 0025. Es aditiva; no toca datos.
--
-- Rollback:
--   Volver a crear public.emit_outbound_event con el cuerpo de 0025 (sin la línea que llama a outbound_enrich) y
--   DROP FUNCTION public.outbound_enrich(jsonb, uuid); DROP FUNCTION public.outbound_local_time(timestamptz, text);
--   DROP FUNCTION public.outbound_sample_event(text, uuid); DROP FUNCTION public.send_test_webhook(uuid, text);

-- ─── Hora local ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.outbound_local_time(_ts timestamptz, _tz text)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT CASE WHEN _ts IS NULL THEN NULL ELSE (
    SELECT jsonb_build_object(
      'iso',       to_char(l.t, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'date',      to_char(l.t, 'YYYY-MM-DD'),
      'time',      to_char(l.t, 'FMHH12:MI AM'),
      'time_24h',  to_char(l.t, 'HH24:MI'),
      'weekday',   w.nombre,
      'date_text', w.nombre || ' ' || extract(day FROM l.t)::int || ' de ' ||
                   (ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month FROM l.t)::int] ||
                   ' de ' || extract(year FROM l.t)::int
    )
    FROM (SELECT _ts AT TIME ZONE coalesce(nullif(_tz, ''), 'America/Puerto_Rico') AS t) l,
         LATERAL (SELECT (ARRAY['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow FROM l.t)::int] AS nombre) w
  ) END;
$$;

-- ─── Completar el contenido ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.outbound_enrich(_data jsonb, _shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _tz   text;
  _out  jsonb := _data;
  _prev jsonb;
BEGIN
  IF _data IS NULL OR jsonb_typeof(_data) <> 'object' THEN
    RETURN _data;
  END IF;

  SELECT s.timezone INTO _tz FROM public.shops s WHERE s.id = _shop_id;
  _tz := coalesce(nullif(_tz, ''), 'America/Puerto_Rico');

  IF coalesce(_data->>'starts_at', '') <> '' THEN
    _out := _out || jsonb_build_object('timezone', _tz, 'starts_local', public.outbound_local_time((_data->>'starts_at')::timestamptz, _tz));
  END IF;
  IF coalesce(_data->>'ends_at', '') <> '' THEN
    _out := _out || jsonb_build_object('ends_local', public.outbound_local_time((_data->>'ends_at')::timestamptz, _tz));
  END IF;

  IF coalesce(_data->>'price_cents', '') <> '' THEN
    _out := _out || jsonb_build_object('price', round((_data->>'price_cents')::numeric / 100, 2));
  END IF;
  IF coalesce(_data->>'amount_paid_cents', '') <> '' THEN
    _out := _out || jsonb_build_object('amount_paid', round((_data->>'amount_paid_cents')::numeric / 100, 2));
  END IF;
  IF coalesce(_data->>'tip_cents', '') <> '' THEN
    _out := _out || jsonb_build_object('tip', round((_data->>'tip_cents')::numeric / 100, 2));
  END IF;

  IF jsonb_typeof(_data->'previous') = 'object' THEN
    _prev := _data->'previous';
    IF coalesce(_prev->>'starts_at', '') <> '' THEN
      _prev := _prev || jsonb_build_object('starts_local', public.outbound_local_time((_prev->>'starts_at')::timestamptz, _tz));
    END IF;
    IF coalesce(_prev->>'ends_at', '') <> '' THEN
      _prev := _prev || jsonb_build_object('ends_local', public.outbound_local_time((_prev->>'ends_at')::timestamptz, _tz));
    END IF;
    _out := jsonb_set(_out, '{previous}', _prev);
  END IF;

  RETURN _out;
EXCEPTION WHEN OTHERS THEN
  RETURN _data;   -- nunca bloquear: se envia el contenido original
END;
$$;

-- ─── Emisión: igual que en 0025, pasando el contenido por outbound_enrich ────

CREATE OR REPLACE FUNCTION public.emit_outbound_event(
  _event_type text, _entity_type text, _entity_id uuid, _shop_id uuid, _data jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _id uuid;
  _base text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.outbound_webhook_endpoints e
     WHERE e.is_active
       AND (e.shop_id IS NULL OR e.shop_id IS NOT DISTINCT FROM _shop_id)
       AND ('*' = ANY (e.event_types) OR _event_type = ANY (e.event_types))
  ) THEN
    RETURN;
  END IF;

  _data := public.outbound_enrich(_data, _shop_id);

  INSERT INTO public.outbound_webhook_events (shop_id, event_type, entity_type, entity_id, data)
  VALUES (_shop_id, _event_type, _entity_type, _entity_id, _data)
  RETURNING id INTO _id;

  SELECT c.functions_base_url INTO _base FROM public.outbound_webhook_config c WHERE c.id;
  IF coalesce(_base, '') <> '' THEN
    -- pg_net envia despues del COMMIT; no bloquea la reserva.
    PERFORM net.http_post(
      url     := rtrim(_base, '/') || '/outbound-webhook-dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', public.get_internal_job_secret()),
      body    := jsonb_build_object('event_id', _id)
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.outbound_local_time(timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.outbound_enrich(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_local_time(timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbound_enrich(jsonb, uuid) TO service_role;

-- ─── Ejemplos completos por tipo de evento ───────────────────────────────────

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
  IF _event_type NOT IN ('booking.created','booking.rescheduled','booking.updated','booking.cancelled','booking.no_show','booking.paid',
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

-- Envía el ejemplo a UN destino (no a todos), por la misma vía que los eventos reales.
CREATE OR REPLACE FUNCTION public.send_test_webhook(_endpoint_id uuid, _event_type text DEFAULT 'booking.created')
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _base text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.outbound_webhook_endpoints WHERE id = _endpoint_id) THEN
    RAISE EXCEPTION 'endpoint_not_found';
  END IF;
  SELECT c.functions_base_url INTO _base FROM public.outbound_webhook_config c WHERE c.id;
  IF coalesce(_base, '') = '' THEN
    RAISE EXCEPTION 'functions_base_url_missing';
  END IF;
  PERFORM net.http_post(
    url     := rtrim(_base, '/') || '/outbound-webhook-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', public.get_internal_job_secret()),
    body    := jsonb_build_object('test', jsonb_build_object('endpoint_id', _endpoint_id, 'event_type', _event_type))
  );
  RETURN 'Ejemplo ' || _event_type || ' enviado; revisa el flujo en unos segundos.';
END;
$$;

REVOKE ALL ON FUNCTION public.outbound_sample_event(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_test_webhook(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_sample_event(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.send_test_webhook(uuid, text) TO service_role;
