-- Grant SELECT on newsletter columns so admin Suscriptores can read them
GRANT SELECT (
  newsletter_opt_in,
  newsletter_opt_in_at,
  newsletter_language,
  newsletter_source
) ON public.clients TO authenticated;

-- Enable realtime so admin sees new subscribers live
ALTER TABLE public.clients REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'clients'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.clients';
  END IF;
END $$;