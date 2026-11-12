
-- Table for storing WebAuthn credentials (passkeys / Face ID)
CREATE TABLE public.webauthn_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  credential_id text NOT NULL UNIQUE,
  public_key text NOT NULL,
  sign_count bigint NOT NULL DEFAULT 0,
  device_name text,
  transports text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own credentials"
  ON public.webauthn_credentials FOR SELECT
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users delete own credentials"
  ON public.webauthn_credentials FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- Service role will insert/update via edge functions, so no INSERT/UPDATE policy needed for users

-- Table for temporary WebAuthn challenges
CREATE TABLE public.webauthn_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  challenge text NOT NULL,
  type text NOT NULL CHECK (type IN ('registration', 'authentication')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;

-- No direct user access needed - edge functions use service role

-- Index for fast lookup
CREATE INDEX idx_webauthn_credentials_user ON public.webauthn_credentials(user_id);
CREATE INDEX idx_webauthn_challenges_user ON public.webauthn_challenges(user_id);

-- Cleanup function for expired challenges (older than 5 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.webauthn_challenges
  WHERE created_at < now() - interval '5 minutes';
$$;
