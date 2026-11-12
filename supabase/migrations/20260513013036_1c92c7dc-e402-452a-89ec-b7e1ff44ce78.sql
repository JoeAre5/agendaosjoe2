-- Admin notification rules per event
CREATE TABLE public.admin_notification_rules (
  event_key text PRIMARY KEY,
  category text NOT NULL DEFAULT 'general',
  is_enabled boolean NOT NULL DEFAULT true,
  title_es text NOT NULL,
  title_en text NOT NULL,
  body_es text NOT NULL,
  body_en text NOT NULL,
  url_path text,
  description_es text,
  description_en text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.admin_notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access admin_notification_rules"
  ON public.admin_notification_rules FOR ALL
  TO authenticated
  USING (is_owner()) WITH CHECK (is_owner());

CREATE POLICY "Service role full access admin_notification_rules"
  ON public.admin_notification_rules FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Single-row delivery preferences
CREATE TABLE public.admin_notification_prefs (
  id boolean PRIMARY KEY DEFAULT true,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_start time NOT NULL DEFAULT '22:00',
  quiet_end time NOT NULL DEFAULT '07:00',
  sound_enabled boolean NOT NULL DEFAULT true,
  group_similar boolean NOT NULL DEFAULT true,
  group_window_minutes int NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT singleton CHECK (id = true)
);

ALTER TABLE public.admin_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access admin_notification_prefs"
  ON public.admin_notification_prefs FOR ALL
  TO authenticated
  USING (is_owner()) WITH CHECK (is_owner());

CREATE POLICY "Service role full access admin_notification_prefs"
  ON public.admin_notification_prefs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO public.admin_notification_prefs (id) VALUES (true);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_admin_notification_rules()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_admin_notification_rules_touch
  BEFORE UPDATE ON public.admin_notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_admin_notification_rules();

CREATE TRIGGER trg_admin_notification_prefs_touch
  BEFORE UPDATE ON public.admin_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.touch_admin_notification_rules();

-- Seed admin events. Body templates use {{var}} substitution.
INSERT INTO public.admin_notification_rules
  (event_key, category, title_es, title_en, body_es, body_en, url_path, description_es, description_en)
VALUES
  ('admin_booking_new', 'appointments',
    'Nueva cita ({{source}})', 'New booking ({{source}})',
    '{{client}} reservó {{service}}, {{date}}.', '{{client}} booked {{service}}, {{date}}.',
    '/admin/appointment/{{appointment_id}}',
    'Cliente reservó una cita en línea.', 'Client booked an appointment online.'),
  ('admin_booking_cancelled', 'appointments',
    'Cita cancelada (Cliente)', 'Booking cancelled (Client)',
    '{{client}} canceló {{service}}, {{date}}.', '{{client}} cancelled {{service}}, {{date}}.',
    '/admin/appointment/{{appointment_id}}',
    'Cliente canceló su cita desde el portal.', 'Client cancelled their booking from the portal.'),
  ('admin_appointment_changed', 'appointments',
    'Cita {{kind_label}} (Cliente)', 'Booking {{kind_label}} (Client)',
    '{{client}} {{verb}} {{service}}, {{date}}.', '{{client}} {{verb}} {{service}}, {{date}}.',
    '/admin/appointment/{{appointment_id}}',
    'Cliente reprogramó o creó una cita desde la app.', 'Client rescheduled or created a booking from the app.'),
  ('admin_contact_form', 'inbox',
    'Nuevo mensaje de contacto', 'New contact message',
    '{{name}}: {{preview}}', '{{name}}: {{preview}}',
    '/admin/bandeja',
    'Submisión del formulario de contacto.', 'Submission from the contact form.'),
  ('admin_email_reply', 'inbox',
    'Nuevo email', 'New email',
    '{{sender}}: {{subject}}', '{{sender}}: {{subject}}',
    '/admin/bandeja',
    'Email entrante o respuesta al newsletter.', 'Inbound email or newsletter reply.'),
  ('admin_payment_received', 'payments',
    'Pago recibido', 'Payment received',
    '{{client}} pagó {{amount}}.', '{{client}} paid {{amount}}.',
    '/admin/appointment/{{appointment_id}}',
    'Pago capturado por la cita.', 'Payment captured for the appointment.');