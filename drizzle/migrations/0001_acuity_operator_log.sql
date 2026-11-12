CREATE TABLE public.acuity_operator_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  user_email text,
  role text,
  barber_id uuid,
  barber_name text,
  action text NOT NULL,
  method text,
  path text,
  acuity_id bigint,
  target_datetime text,
  target_calendar_id bigint,
  status_code int,
  user_agent text
);
GRANT SELECT ON public.acuity_operator_log TO authenticated;
GRANT ALL ON public.acuity_operator_log TO service_role;
ALTER TABLE public.acuity_operator_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read operator log" ON public.acuity_operator_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'owner'::public.app_role));
CREATE INDEX acuity_operator_log_acuity_id_idx ON public.acuity_operator_log (acuity_id);
CREATE INDEX acuity_operator_log_created_idx ON public.acuity_operator_log (created_at DESC);