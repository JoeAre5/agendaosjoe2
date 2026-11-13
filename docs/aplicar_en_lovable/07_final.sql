-- PASO FINAL (solo lectura): comparar con el paso 0.
-- citas, clientes y servicios deben ser IGUALES a los del paso 0; tiendas_no_acuity debe ser 0 (la tienda sigue en Acuity).
SELECT (SELECT count(*) FROM public.appointments) AS citas,
       (SELECT count(*) FROM public.clients) AS clientes,
       (SELECT count(*) FROM public.services) AS servicios,
       (SELECT count(*) FROM public.shops WHERE booking_provider <> 'acuity') AS tiendas_no_acuity_esperado_0,
       (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('schedule_exceptions','outbound_webhook_config','outbound_webhook_endpoints','outbound_webhook_events')) AS tablas_nuevas_esperado_4,
       (SELECT count(*) FROM cron.job WHERE jobname='outbound-webhook-retry') AS tarea_reintentos_esperado_1;
