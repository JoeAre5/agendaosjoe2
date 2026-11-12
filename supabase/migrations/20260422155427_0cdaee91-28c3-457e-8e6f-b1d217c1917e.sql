-- Seed bilingual notification templates for booking lifecycle events.
INSERT INTO public.notification_templates (name, title_es, body_es, title_en, body_en, url_path)
VALUES
  ('appointment_confirmed',
   'Cita confirmada ✂️',
   '{{service}} con {{barber}} el {{date}} a las {{time}}. ¡Te esperamos!',
   'Appointment confirmed ✂️',
   '{{service}} with {{barber}} on {{date}} at {{time}}. See you then!',
   '/app/cliente'),
  ('appointment_cancelled_by_shop',
   'Tu cita fue cancelada',
   'Tuvimos que cancelar tu cita del {{date}} a las {{time}}. Reagenda cuando quieras.',
   'Your appointment was cancelled',
   'We had to cancel your {{date}} {{time}} appointment. Rebook anytime.',
   '/app/cliente/nueva-cita')
ON CONFLICT (name) DO UPDATE SET
  title_es = EXCLUDED.title_es,
  body_es = EXCLUDED.body_es,
  title_en = EXCLUDED.title_en,
  body_en = EXCLUDED.body_en,
  url_path = EXCLUDED.url_path,
  updated_at = now();