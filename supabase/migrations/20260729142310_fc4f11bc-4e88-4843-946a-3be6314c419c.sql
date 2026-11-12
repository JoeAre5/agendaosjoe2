CREATE TABLE public.athmovil_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  auth_mode text NOT NULL DEFAULT 'unknown',
  verified boolean NOT NULL DEFAULT false,
  status_code integer,
  reference_number text,
  total_cents integer,
  event_status text,
  outcome text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.athmovil_webhook_log TO authenticated;
GRANT ALL ON public.athmovil_webhook_log TO service_role;

ALTER TABLE public.athmovil_webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read ath webhook log"
ON public.athmovil_webhook_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'super_owner'));

CREATE INDEX idx_athmovil_webhook_log_received_at ON public.athmovil_webhook_log (received_at DESC);
CREATE INDEX idx_athmovil_webhook_log_reference ON public.athmovil_webhook_log (reference_number);