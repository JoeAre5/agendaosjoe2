ALTER TABLE public.pos_payment_sessions
  ADD COLUMN IF NOT EXISTS ath_auth_token text;

COMMENT ON COLUMN public.pos_payment_sessions.ath_auth_token IS
  'Server-side-only JWT returned by ATH Móvil /payment. Used for /authorization recovery and /cancel. Never exposed to clients.';