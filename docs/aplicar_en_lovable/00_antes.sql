-- PASO 0 (solo lectura): anota estos numeros ANTES de empezar. Al final deben seguir igual.
SELECT (SELECT count(*) FROM public.appointments) AS citas,
       (SELECT count(*) FROM public.clients) AS clientes,
       (SELECT count(*) FROM public.services) AS servicios,
       (SELECT count(*) FROM public.shops WHERE booking_provider <> 'acuity') AS tiendas_no_acuity_esperado_0,
       (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('schedule_exceptions','outbound_webhook_config')) AS tablas_nuevas_ya_existentes_esperado_0;
