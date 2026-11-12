ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS newsletter_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS newsletter_opt_in_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS newsletter_language text NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS newsletter_source text;

CREATE INDEX IF NOT EXISTS idx_clients_newsletter_opt_in
  ON public.clients (newsletter_opt_in, newsletter_opt_in_at DESC)
  WHERE newsletter_opt_in = true;