
-- Add push opt-in column on clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS notify_push_appointments boolean NOT NULL DEFAULT true;

-- ─── push_subscriptions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  language text NOT NULL DEFAULT 'es',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  failure_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_client ON public.push_subscriptions(client_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client manage own push_subscriptions"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (is_client() AND client_id = get_my_client_id())
  WITH CHECK (is_client() AND client_id = get_my_client_id());

CREATE POLICY "Owner read push_subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  TO authenticated
  USING (is_owner());

CREATE POLICY "Service role full access push_subscriptions"
  ON public.push_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── notification_templates ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  title_es text NOT NULL,
  body_es text NOT NULL,
  title_en text NOT NULL,
  body_en text NOT NULL,
  url_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read templates"
  ON public.notification_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owner manage templates"
  ON public.notification_templates
  FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

CREATE POLICY "Service role full access templates"
  ON public.notification_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── notification_dispatch_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  template_name text NOT NULL,
  dispatch_key text NOT NULL,
  subscription_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_log_unique_key ON public.notification_dispatch_log(dispatch_key);
CREATE INDEX IF NOT EXISTS idx_dispatch_log_appointment ON public.notification_dispatch_log(appointment_id);

ALTER TABLE public.notification_dispatch_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read dispatch_log"
  ON public.notification_dispatch_log
  FOR SELECT
  TO authenticated
  USING (is_owner());

CREATE POLICY "Service role full access dispatch_log"
  ON public.notification_dispatch_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── Seed templates ────────────────────────────────────────────────────
INSERT INTO public.notification_templates (name, title_es, body_es, title_en, body_en, url_path)
VALUES
  ('appointment_reminder_24h',
   'Tu cita es mañana ✂️',
   'Recordatorio: {{service}} con {{barber}} mañana a las {{time}}. ¡Te esperamos!',
   'Your appointment is tomorrow ✂️',
   'Reminder: {{service}} with {{barber}} tomorrow at {{time}}. See you soon!',
   '/citas'),
  ('appointment_reminder_2h',
   'Tu cita es en 2 horas ⏰',
   '{{service}} con {{barber}} a las {{time}}. ¡Nos vemos pronto!',
   'Your appointment is in 2 hours ⏰',
   '{{service}} with {{barber}} at {{time}}. See you soon!',
   '/citas'),
  ('appointment_update',
   'Actualización de tu cita',
   'Tu cita del {{date}} fue actualizada. Toca para ver detalles.',
   'Appointment update',
   'Your appointment on {{date}} has been updated. Tap for details.',
   '/citas')
ON CONFLICT (name) DO NOTHING;
