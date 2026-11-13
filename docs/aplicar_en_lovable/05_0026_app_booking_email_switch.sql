-- PASO 5 de 6: 0026_app_booking_email_switch
-- Antes: respaldo hecho y aprobacion de Charlie. Pegar TODO este archivo y pulsar Run UNA vez.
-- Al final aparece una tabla de comprobacion. Debe dar: correos_de_la_app_esperado_true = true
-- Si da error o un numero distinto: NO seguir; copiar el mensaje y avisar.

-- 0026 — Interruptor para apagar el correo de confirmacion de reserva que envia la app.
--
-- Si un CRM (GoHighLevel) va a enviar los correos de confirmacion a partir de los webhooks de
-- salida (0025), la app no debe enviar el suyo: el cliente recibiria dos. Encendido por defecto
-- (sin cambio de comportamiento). Solo afecta al correo "booking-confirmation"; los recordatorios
-- de la app son notificaciones push y tienen su propio interruptor (notification_templates.is_enabled).
--
-- Apagar:   UPDATE public.outbound_webhook_config SET app_booking_emails = false;
-- Encender: UPDATE public.outbound_webhook_config SET app_booking_emails = true;
-- Rollback: ALTER TABLE public.outbound_webhook_config DROP COLUMN app_booking_emails;
ALTER TABLE public.outbound_webhook_config
  ADD COLUMN IF NOT EXISTS app_booking_emails boolean NOT NULL DEFAULT true;

-- Comprobacion
SELECT 'OK 0026' AS paso, app_booking_emails AS correos_de_la_app_esperado_true FROM public.outbound_webhook_config LIMIT 1;
