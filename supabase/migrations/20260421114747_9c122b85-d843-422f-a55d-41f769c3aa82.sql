ALTER TABLE public.pos_session_audit_events DROP CONSTRAINT IF EXISTS pos_audit_source_check;
ALTER TABLE public.pos_session_audit_events ADD CONSTRAINT pos_audit_source_check
  CHECK (source = ANY (ARRAY['edge_function'::text, 'webhook'::text, 'cron'::text, 'client'::text, 'pos-recovery'::text]));