CREATE TABLE IF NOT EXISTS public.pending_recurring_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  template_name text NOT NULL,
  recurring_group_id uuid NOT NULL,
  count integer NOT NULL DEFAULT 0,
  first_starts_at timestamptz,
  last_starts_at timestamptz,
  service text,
  barber text,
  last_event_at timestamptz NOT NULL DEFAULT now(),
  flushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pending_recurring_pushes_open_unique
  ON public.pending_recurring_pushes (client_id, template_name, recurring_group_id)
  WHERE flushed_at IS NULL;

CREATE INDEX IF NOT EXISTS pending_recurring_pushes_flush_idx
  ON public.pending_recurring_pushes (last_event_at)
  WHERE flushed_at IS NULL;

ALTER TABLE public.pending_recurring_pushes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner read pending_recurring_pushes" ON public.pending_recurring_pushes;
CREATE POLICY "Owner read pending_recurring_pushes"
  ON public.pending_recurring_pushes FOR SELECT
  TO authenticated USING (public.is_owner());

DROP POLICY IF EXISTS "Service role full access pending_recurring_pushes" ON public.pending_recurring_pushes;
CREATE POLICY "Service role full access pending_recurring_pushes"
  ON public.pending_recurring_pushes FOR ALL
  TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.notification_templates (name, category, title_es, body_es, title_en, body_en, url_path, is_enabled)
VALUES
  (
    'appointment_cancelled_by_shop_recurring',
    'appointments',
    'Citas canceladas',
    '{{count}} de tus citas recurrentes de {{service}} han sido canceladas.',
    'Appointments cancelled',
    '{{count}} of your recurring {{service}} appointments have been cancelled.',
    '/app/cliente/citas',
    true
  ),
  (
    'appointment_rescheduled_recurring',
    'appointments',
    'Citas reprogramadas',
    '{{count}} de tus citas recurrentes de {{service}} con {{barber}} fueron reprogramadas.',
    'Appointments rescheduled',
    '{{count}} of your recurring {{service}} appointments with {{barber}} were rescheduled.',
    '/app/cliente/citas',
    true
  )
ON CONFLICT (name) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('flush-recurring-pushes');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'flush-recurring-pushes',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://zskjtfpiohvsgwvbbxnc.supabase.co/functions/v1/flush-recurring-pushes',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $cron$
);