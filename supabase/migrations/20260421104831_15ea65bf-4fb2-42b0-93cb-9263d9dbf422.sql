-- Phase 1B.2: extend pos_session_audit_events.event_type CHECK to allow recovery_failed.
-- recovery_resolved is already in the constraint. We intentionally do NOT add
-- 'recovery_attempted' — emitting it on every cron tick would generate ~1.3M
-- rows/yr with no diagnostic value. Only terminal recovery outcomes are audited.
ALTER TABLE public.pos_session_audit_events DROP CONSTRAINT pos_audit_event_type_check;

ALTER TABLE public.pos_session_audit_events ADD CONSTRAINT pos_audit_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'session_created'::text,
    'ath_payment_posted'::text,
    'poll_response'::text,
    'webhook_received'::text,
    'authorization_called'::text,
    'committed'::text,
    'failed'::text,
    'recovery_resolved'::text,
    'recovery_failed'::text,
    'manual_override'::text
  ]));