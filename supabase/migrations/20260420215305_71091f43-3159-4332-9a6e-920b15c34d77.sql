-- ─── Phase 1B.1: pos_session_audit_events ─────────────────────────────────────

CREATE TABLE public.pos_session_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.pos_payment_sessions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL,

  CONSTRAINT pos_audit_event_type_check CHECK (event_type IN (
    'session_created',
    'ath_payment_posted',
    'poll_response',
    'webhook_received',
    'authorization_called',
    'committed',
    'failed',
    'recovery_resolved',
    'manual_override'
  )),
  CONSTRAINT pos_audit_source_check CHECK (source IN (
    'edge_function',
    'webhook',
    'cron',
    'client'
  )),
  CONSTRAINT pos_audit_payload_size_check CHECK (LENGTH(payload::text) < 8192)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_pos_audit_session_id    ON public.pos_session_audit_events (session_id);
CREATE INDEX idx_pos_audit_created_at    ON public.pos_session_audit_events (created_at DESC);
CREATE INDEX idx_pos_audit_event_type    ON public.pos_session_audit_events (event_type);
CREATE INDEX idx_pos_audit_session_event ON public.pos_session_audit_events (session_id, event_type);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.pos_session_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read audit events"
  ON public.pos_session_audit_events
  FOR SELECT
  TO authenticated
  USING (public.is_owner());

CREATE POLICY "Service role full access audit events"
  ON public.pos_session_audit_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── Retention cleanup function (90-day window) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_pos_audit_events()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.pos_session_audit_events
  WHERE created_at < now() - interval '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;