-- Prueba de comportamiento de emit_booking_reminders. NO deja datos: termina con una excepcion que devuelve el
-- resultado y deshace todo (citas, eventos y envios de pg_net). Citas de 5 minutos, sin solaparse.
DO $$
DECLARE
  _shop   uuid;
  _barber uuid;
  _now    timestamptz := now();
  _ep     uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid; a8 uuid; a9 uuid; a11 uuid;
  r1 int; r2 int; r3 int; r4 int;
  ev jsonb;
  sent jsonb;
  _p jsonb;
BEGIN
  SELECT id INTO _shop FROM public.shops WHERE is_active LIMIT 1;
  SELECT id INTO _barber FROM public.barbers WHERE shop_id = _shop AND is_active LIMIT 1;

  INSERT INTO public.outbound_webhook_endpoints (name, url, event_types, is_active, shop_id)
  VALUES ('ZZ prueba recordatorios', 'https://example.invalid/hook', '{booking.reminder}', true, NULL)
  RETURNING id INTO _ep;

  -- Grupo de 24 h (todos dentro del margen de 30 min salvo a5 que aun no toca y a6 que se paso)
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a1 24h debe salir','7875550101','Corte', _now + interval '24 hours', _now + interval '24 hours 5 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a1;
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a2 reservada dentro de ventana','7875550102','Corte', _now + interval '23 hours 55 minutes', _now + interval '24 hours', 5, 2500,'scheduled', _now - interval '2 minutes') RETURNING id INTO a2;
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a3 cancelada','7875550103','Corte', _now + interval '23 hours 50 minutes', _now + interval '23 hours 55 minutes', 5, 2500,'cancelled', _now - interval '3 days') RETURNING id INTO a3;
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a7 24h dentro del margen','7875550107','Corte', _now + interval '23 hours 45 minutes', _now + interval '23 hours 50 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a7;
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a5 aun no toca','7875550105','Corte', _now + interval '24 hours 45 minutes', _now + interval '24 hours 50 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a5;
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a6 se paso del margen','7875550106','Corte', _now + interval '23 hours 15 minutes', _now + interval '23 hours 20 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a6;

  -- Grupo de 2 h
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a4 2h debe salir','7875550104','Corte', _now + interval '2 hours', _now + interval '2 hours 5 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a4;
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a8 reservada dentro de la ventana de 2h','7875550108','Corte', _now + interval '1 hour 55 minutes', _now + interval '2 hours', 5, 2500,'scheduled', _now - interval '2 minutes') RETURNING id INTO a8;
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a9 ya enviada antes','7875550109','Corte', _now + interval '1 hour 50 minutes', _now + interval '1 hour 55 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a9;
  INSERT INTO public.booking_reminders_sent (appointment_id, kind) VALUES (a9, '2h');

  -- 1ª pasada: debe emitir exactamente a1 (24h), a7 (24h) y a4 (2h)
  r1 := public.emit_booking_reminders(_now);
  SELECT coalesce(jsonb_agg(jsonb_build_object('cita', left(a.client_name, 5), 'kind', e.data->'reminder'->>'kind') ORDER BY a.client_name), '[]'::jsonb)
    INTO ev FROM public.outbound_webhook_events e JOIN public.appointments a ON a.id = e.entity_id
   WHERE e.event_type = 'booking.reminder' AND e.entity_id IN (a1,a2,a3,a4,a5,a6,a7,a8,a9);
  SELECT coalesce(jsonb_agg(left(a.client_name, 5) || '/' || s.kind ORDER BY a.client_name), '[]'::jsonb) INTO sent
    FROM public.booking_reminders_sent s JOIN public.appointments a ON a.id = s.appointment_id WHERE a.id IN (a1,a2,a3,a4,a5,a6,a7,a8,a9);
  SELECT e.data INTO _p FROM public.outbound_webhook_events e WHERE e.event_type = 'booking.reminder' AND e.entity_id = a1;

  -- 2ª pasada inmediata: no debe repetir nada
  r2 := public.emit_booking_reminders(_now);

  -- Sin destino activo: se marca como visto pero no se acumula
  UPDATE public.outbound_webhook_endpoints SET is_active = false WHERE id = _ep;
  INSERT INTO public.appointments (shop_id, barber_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_barber,'ZZ a11 sin destino activo','7875550111','Corte', _now + interval '23 hours 40 minutes', _now + interval '23 hours 45 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a11;
  r3 := public.emit_booking_reminders(_now);
  UPDATE public.outbound_webhook_endpoints SET is_active = true WHERE id = _ep;
  r4 := public.emit_booking_reminders(_now);

  RAISE EXCEPTION 'RESULTADO %', jsonb_build_object(
    'pasada1_emitidas', r1, 'esperado_pasada1', 3,
    'eventos', ev,
    'marcadas', sent,
    'pasada2_repetidas', r2, 'esperado_pasada2', 0,
    'sin_destino_marcadas', r3, 'sin_destino_eventos', (SELECT count(*) FROM public.outbound_webhook_events WHERE event_type='booking.reminder' AND entity_id = a11),
    'tras_reactivar_emitidas', r4, 'esperado_tras_reactivar', 0,
    'payload_a1', jsonb_build_object('reminder', _p->'reminder', 'starts_local_hora', _p->'starts_local'->>'time', 'tiene_test', _p ? 'test', 'cliente', _p->'client'->>'name', 'servicio', _p->'service'->>'name')
  );
END $$;
