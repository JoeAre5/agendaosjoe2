-- ============================================================================
-- Phase 5 Step 1: Notification template management schema
-- ============================================================================

-- 1. Extend notification_templates with admin-editable controls
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS offset_minutes integer NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'appointments';

-- Index for the reminder cron's offset_minutes lookup
CREATE INDEX IF NOT EXISTS idx_notification_templates_offset
  ON public.notification_templates (offset_minutes)
  WHERE offset_minutes IS NOT NULL AND is_enabled = true;

-- 2. Set offset_minutes for the time-based reminders (negative = before event)
UPDATE public.notification_templates
SET offset_minutes = -1440, category = 'reminders'
WHERE name = 'appointment_reminder_24h';

UPDATE public.notification_templates
SET offset_minutes = -120, category = 'reminders'
WHERE name = 'appointment_reminder_2h';

-- 3. Categorize existing event-based templates
UPDATE public.notification_templates
SET category = 'appointments'
WHERE name IN ('appointment_confirmed', 'appointment_cancelled_by_shop');

-- 4. Repurpose appointment_update -> appointment_rescheduled
UPDATE public.notification_templates
SET name = 'appointment_rescheduled',
    title_es = 'Tu cita fue reagendada',
    body_es = 'Tu cita con {{barber}} ahora es el {{date}} a las {{time}}.',
    title_en = 'Your appointment was rescheduled',
    body_en = 'Your appointment with {{barber}} is now {{date}} at {{time}}.',
    url_path = '/app/cliente',
    category = 'appointments',
    updated_at = now()
WHERE name = 'appointment_update';

-- 5. Seed payment_received (insert if missing)
INSERT INTO public.notification_templates (name, title_es, body_es, title_en, body_en, url_path, category)
VALUES (
  'payment_received',
  'Pago recibido ✅',
  'Recibimos tu pago de ${{amount}}. ¡Gracias por tu confianza!',
  'Payment received ✅',
  'We received your ${{amount}} payment. Thanks for your trust!',
  '/app/cliente',
  'payments'
)
ON CONFLICT (name) DO UPDATE SET
  title_es = EXCLUDED.title_es,
  body_es = EXCLUDED.body_es,
  title_en = EXCLUDED.title_en,
  body_en = EXCLUDED.body_en,
  category = EXCLUDED.category,
  updated_at = now();

-- 6. Auto-touch updated_at on every template change
CREATE OR REPLACE FUNCTION public.touch_notification_template_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_notification_template ON public.notification_templates;
CREATE TRIGGER trg_touch_notification_template
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_notification_template_updated_at();

-- ============================================================================
-- 7. notification_template_history (audit trail + revert support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notification_template_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.notification_templates(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  title_es_old text, title_es_new text,
  body_es_old text,  body_es_new text,
  title_en_old text, title_en_new text,
  body_en_old text,  body_en_new text,
  offset_minutes_old integer, offset_minutes_new integer,
  is_enabled_old boolean, is_enabled_new boolean,
  change_kind text NOT NULL DEFAULT 'edit', -- 'edit' | 'revert' | 'pause' | 'resume'
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_history_template_id
  ON public.notification_template_history (template_id, changed_at DESC);

ALTER TABLE public.notification_template_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner read template history" ON public.notification_template_history;
CREATE POLICY "Owner read template history"
  ON public.notification_template_history
  FOR SELECT
  TO authenticated
  USING (public.is_owner());

DROP POLICY IF EXISTS "Service role full access template history" ON public.notification_template_history;
CREATE POLICY "Service role full access template history"
  ON public.notification_template_history
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 8. Global pause snapshot column on shop_settings
-- ============================================================================
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS notifications_paused_snapshot jsonb NULL;
-- When NULL  => not paused.
-- When set   => map of { "<template_name>": <prior_is_enabled_bool> } captured at pause time.