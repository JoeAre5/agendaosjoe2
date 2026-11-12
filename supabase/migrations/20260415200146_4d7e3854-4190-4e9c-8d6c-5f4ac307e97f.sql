
-- =============================================
-- 1. production_goals
-- =============================================
CREATE TABLE public.production_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid REFERENCES public.barbers(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  target_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barber_id, week_start)
);

ALTER TABLE public.production_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access production_goals"
  ON public.production_goals FOR ALL
  TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "Barber read own goals"
  ON public.production_goals FOR SELECT
  TO authenticated
  USING (
    public.is_barber() AND (
      barber_id IS NULL
      OR barber_id = (SELECT barber_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- =============================================
-- 2. audit_log
-- =============================================
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read audit_log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.is_owner());

CREATE POLICY "Service role insert audit_log"
  ON public.audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow authenticated users to insert their own audit entries
CREATE POLICY "Authenticated insert own audit_log"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- 3. trusted_devices
-- =============================================
CREATE TABLE public.trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  user_agent text,
  trusted_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own trusted_devices"
  ON public.trusted_devices FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_trusted_devices_user_fp ON public.trusted_devices (user_id, device_fingerprint);
CREATE INDEX idx_audit_log_entity ON public.audit_log (entity_type, entity_id);
CREATE INDEX idx_production_goals_week ON public.production_goals (week_start);
