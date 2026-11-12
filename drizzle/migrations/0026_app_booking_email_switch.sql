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
