CREATE TABLE public.filho_otp_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  ip_hash text NOT NULL,
  attempts_count integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_filho_otp_client_created ON public.filho_otp_attempts(client_id, created_at DESC);
CREATE INDEX idx_filho_otp_iphash_created ON public.filho_otp_attempts(ip_hash, created_at DESC);

ALTER TABLE public.filho_otp_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read filho_otp_attempts"
ON public.filho_otp_attempts FOR SELECT
TO authenticated
USING (is_owner());

CREATE POLICY "Service role full access filho_otp_attempts"
ON public.filho_otp_attempts FOR ALL
TO service_role
USING (true)
WITH CHECK (true);