-- Prueba de recordatorios con clientes recurrentes. NO deja datos: termina con una excepcion y deshace todo.
DO $$
DECLARE
  _shop uuid; _barber uuid; _now timestamptz := now(); _ep uuid;
  c_rec uuid; c_norm uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid;
  r1 int; r2 int; ev jsonb; _p5 jsonb; _p1 jsonb;
BEGIN
  SELECT id INTO _shop FROM public.shops WHERE is_active LIMIT 1;
  SELECT id INTO _barber FROM public.barbers WHERE shop_id = _shop AND is_active ORDER BY name DESC LIMIT 1;

  INSERT INTO public.outbound_webhook_endpoints (name, url, event_types, is_active, shop_id)
  VALUES ('ZZ prueba recurrentes', 'https://example.invalid/hook', '{booking.reminder}', true, NULL) RETURNING id INTO _ep;

  INSERT INTO public.clients (first_name, last_name, phone, shop_id, is_recurring_client) VALUES ('ZZRec', 'Cliente', '7875559001', _shop, true) RETURNING id INTO c_rec;
  INSERT INTO public.clients (first_name, last_name, phone, shop_id) VALUES ('ZZNorm', 'Cliente', '7875559002', _shop) RETURNING id INTO c_norm;

  -- 24 h: normal, cita recurrente, cliente recurrente
  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at, is_recurring)
  VALUES (_shop,_barber,c_norm,'ZZ a1 24h normal','7875550101','Corte', _now + interval '24 hours', _now + interval '24 hours 5 minutes', 5, 2500,'scheduled', _now - interval '3 days', false) RETURNING id INTO a1;
  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at, is_recurring)
  VALUES (_shop,_barber,c_norm,'ZZ a2 24h cita recurrente','7875550102','Corte', _now + interval '23 hours 55 minutes', _now + interval '24 hours', 5, 2500,'scheduled', _now - interval '3 days', true) RETURNING id INTO a2;
  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at, is_recurring)
  VALUES (_shop,_barber,c_rec,'ZZ a3 24h cliente recurrente','7875550103','Corte', _now + interval '23 hours 50 minutes', _now + interval '23 hours 55 minutes', 5, 2500,'scheduled', _now - interval '3 days', false) RETURNING id INTO a3;

  -- 2 h: cita recurrente, cliente recurrente, normal -> los tres deben salir
  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at, is_recurring)
  VALUES (_shop,_barber,c_norm,'ZZ a4 2h cita recurrente','7875550104','Corte', _now + interval '2 hours', _now + interval '2 hours 5 minutes', 5, 2500,'scheduled', _now - interval '3 days', true) RETURNING id INTO a4;
  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at, is_recurring)
  VALUES (_shop,_barber,c_rec,'ZZ a5 2h cliente recurrente','7875550105','Corte', _now + interval '1 hour 55 minutes', _now + interval '2 hours', 5, 2500,'scheduled', _now - interval '3 days', false) RETURNING id INTO a5;
  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at, is_recurring)
  VALUES (_shop,_barber,c_norm,'ZZ a6 2h normal','7875550106','Corte', _now + interval '1 hour 50 minutes', _now + interval '1 hour 55 minutes', 5, 2500,'scheduled', _now - interval '3 days', false) RETURNING id INTO a6;

  r1 := public.emit_booking_reminders(_now);
  SELECT coalesce(jsonb_agg(left(a.client_name, 5) || '/' || (e.data->'reminder'->>'kind') ORDER BY a.client_name), '[]'::jsonb) INTO ev
    FROM public.outbound_webhook_events e JOIN public.appointments a ON a.id = e.entity_id
   WHERE e.event_type = 'booking.reminder' AND e.entity_id IN (a1,a2,a3,a4,a5,a6);
  SELECT e.data INTO _p5 FROM public.outbound_webhook_events e WHERE e.event_type='booking.reminder' AND e.entity_id = a5;
  SELECT e.data INTO _p1 FROM public.outbound_webhook_events e WHERE e.event_type='booking.reminder' AND e.entity_id = a1;
  r2 := public.emit_booking_reminders(_now);

  RAISE EXCEPTION 'RESULTADO %', jsonb_build_object(
    'emitidas', r1, 'esperado', 4, 'eventos', ev, 'repeticion', r2,
    'payload_a5_cliente_recurrente', _p5->'client'->'is_recurring_client',
    'payload_a1_cliente_normal', _p1->'client'->'is_recurring_client',
    'payload_a5_is_recurring_cita', _p5->'is_recurring');
END $$;
