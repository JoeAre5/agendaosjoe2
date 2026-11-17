-- Prueba de la migracion 0033. NO deja datos: termina con una excepcion y deshace todo.
DO $$
DECLARE
  _shop uuid; _bA uuid; _bB uuid; _now timestamptz := now(); _ep uuid;
  c_ok uuid; c_off uuid;
  a1 uuid; a2 uuid; a3 uuid; a4 uuid;
  r1 int; marcas_antes int; marcas_tras_mover int; r_nuevo int; ev jsonb; p jsonb;
BEGIN
  SELECT id INTO _shop FROM public.shops WHERE is_active LIMIT 1;
  SELECT id INTO _bB FROM public.barbers WHERE shop_id = _shop AND is_active ORDER BY name DESC LIMIT 1;
  SELECT id INTO _bA FROM public.barbers WHERE shop_id = _shop AND is_active ORDER BY name ASC LIMIT 1;

  INSERT INTO public.outbound_webhook_endpoints (name, url, event_types, is_active, shop_id)
  VALUES ('ZZ prueba 0033', 'https://example.invalid/hook', '{booking.reminder,booking.rescheduled}', true, NULL) RETURNING id INTO _ep;

  INSERT INTO public.clients (first_name, last_name, phone, shop_id) VALUES ('ZZOk', 'Cliente', '7875559011', _shop) RETURNING id INTO c_ok;
  INSERT INTO public.clients (first_name, last_name, phone, shop_id, notify_sms_appointments) VALUES ('ZZOff', 'Cliente', '7875559012', _shop, false) RETURNING id INTO c_off;

  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_bB,c_ok,'ZZ a1 normal','7875550201','Corte', _now + interval '2 hours', _now + interval '2 hours 5 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a1;
  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_bB,c_ok,'ZZ a2 sin telefono',NULL,'Corte', _now + interval '1 hour 55 minutes', _now + interval '2 hours', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a2;
  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_bB,c_off,'ZZ a3 SMS desactivados','7875550203','Corte', _now + interval '1 hour 50 minutes', _now + interval '1 hour 55 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a3;

  r1 := public.emit_booking_reminders(_now);   -- solo a1 debe salir (a2 sin telefono, a3 con SMS desactivados)
  SELECT count(*) INTO marcas_antes FROM public.booking_reminders_sent WHERE appointment_id IN (a1,a2,a3);

  -- mover a1 a otra hora: las marcas se borran y se emite un booking.rescheduled con time_changed = true
  UPDATE public.appointments SET starts_at = _now + interval '3 hours', ends_at = _now + interval '3 hours 5 minutes' WHERE id = a1;
  SELECT count(*) INTO marcas_tras_mover FROM public.booking_reminders_sent WHERE appointment_id = a1;
  r_nuevo := public.emit_booking_reminders(_now + interval '1 hour');   -- ahora a1 (a las +3h) toca su recordatorio de 2 h

  -- a4: cambia solo el barbero (misma hora)
  INSERT INTO public.appointments (shop_id, barber_id, client_id, client_name, client_phone, service_name, starts_at, ends_at, duration_minutes, price_cents, status, created_at)
  VALUES (_shop,_bB,c_ok,'ZZ a4 cambio de barbero','7875550204','Corte', _now + interval '5 hours', _now + interval '5 hours 5 minutes', 5, 2500,'scheduled', _now - interval '3 days') RETURNING id INTO a4;
  UPDATE public.appointments SET barber_id = _bA WHERE id = a4;

  SELECT coalesce(jsonb_agg(jsonb_build_object('cita', left(a.client_name,5), 'evento', e.event_type, 'time_changed', e.data->'time_changed', 'barber_changed', e.data->'barber_changed') ORDER BY e.created_at), '[]'::jsonb)
    INTO ev FROM public.outbound_webhook_events e JOIN public.appointments a ON a.id = e.entity_id
   WHERE e.event_type = 'booking.rescheduled' AND e.entity_id IN (a1,a4);
  SELECT e.data INTO p FROM public.outbound_webhook_events e WHERE e.event_type='booking.reminder' AND e.entity_id = a1 ORDER BY e.created_at LIMIT 1;

  RAISE EXCEPTION 'RESULTADO %', jsonb_build_object(
    'emitidas_inicial', r1, 'esperado_inicial', 1,
    'marcas_a1_a2_a3_antes_de_mover', marcas_antes, 'esperado_marcas', 1,
    'marcas_a1_tras_mover', marcas_tras_mover, 'esperado_tras_mover', 0,
    'recordatorio_nuevo_tras_mover', r_nuevo, 'esperado_nuevo', 1,
    'reagendaciones', ev,
    'payload_notify_sms', p->'client'->'notify_sms_appointments');
END $$;
