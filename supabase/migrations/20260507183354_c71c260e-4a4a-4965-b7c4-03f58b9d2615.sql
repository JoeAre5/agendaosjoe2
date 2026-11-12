
-- ============================================================
-- FILHO AI AGENT — BUNDLE A SCHEMA
-- ============================================================

-- 1) filho_conversations
CREATE TABLE public.filho_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('client', 'admin')),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  summary text,
  message_count integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_filho_conversations_user ON public.filho_conversations(user_id, last_message_at DESC);

ALTER TABLE public.filho_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client read own filho_conversations"
  ON public.filho_conversations FOR SELECT TO authenticated
  USING (is_client() AND user_id = auth.uid() AND role = 'client');

CREATE POLICY "Client insert own filho_conversations"
  ON public.filho_conversations FOR INSERT TO authenticated
  WITH CHECK (is_client() AND user_id = auth.uid() AND role = 'client');

CREATE POLICY "Client update own filho_conversations"
  ON public.filho_conversations FOR UPDATE TO authenticated
  USING (is_client() AND user_id = auth.uid() AND role = 'client')
  WITH CHECK (is_client() AND user_id = auth.uid() AND role = 'client');

-- Admin policy prepared but inert until Bundle B (is_owner() exists already)
CREATE POLICY "Owner read all filho_conversations"
  ON public.filho_conversations FOR SELECT TO authenticated
  USING (is_owner());

CREATE POLICY "Service role full access filho_conversations"
  ON public.filho_conversations FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- 2) filho_messages
CREATE TABLE public.filho_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.filho_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content text,
  tool_calls jsonb,
  tool_name text,
  tool_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_filho_messages_conversation ON public.filho_messages(conversation_id, created_at);

ALTER TABLE public.filho_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client read own filho_messages"
  ON public.filho_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.filho_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
        AND is_client()
    )
  );

CREATE POLICY "Owner read all filho_messages"
  ON public.filho_messages FOR SELECT TO authenticated
  USING (is_owner());

CREATE POLICY "Service role full access filho_messages"
  ON public.filho_messages FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- 3) filho_identity_attempts
CREATE TABLE public.filho_identity_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  attempted_first_name text,
  attempted_last_name text,
  attempted_phone_last4 text,
  success boolean NOT NULL DEFAULT false,
  matched_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_filho_identity_attempts_ip ON public.filho_identity_attempts(ip_hash, created_at DESC);

ALTER TABLE public.filho_identity_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read filho_identity_attempts"
  ON public.filho_identity_attempts FOR SELECT TO authenticated
  USING (is_owner());

CREATE POLICY "Service role full access filho_identity_attempts"
  ON public.filho_identity_attempts FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- 4) clients.default_payment_method_id
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS default_payment_method_id text;

CREATE INDEX IF NOT EXISTS idx_clients_default_pm
  ON public.clients(default_payment_method_id)
  WHERE default_payment_method_id IS NOT NULL;


-- 5) booking_drafts.created_via
ALTER TABLE public.booking_drafts
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'web';


-- 6) RPC: find_client_by_name_phone
CREATE OR REPLACE FUNCTION public.find_client_by_name_phone(
  _first text,
  _last text,
  _phone text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _phone_norm text;
  _result uuid;
BEGIN
  _phone_norm := right(regexp_replace(coalesce(_phone, ''), '\D', '', 'g'), 10);
  IF length(_phone_norm) < 10 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO _result
  FROM public.clients
  WHERE right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = _phone_norm
    AND lower(trim(first_name)) = lower(trim(coalesce(_first, '')))
    AND lower(trim(coalesce(last_name, ''))) = lower(trim(coalesce(_last, '')))
  LIMIT 1;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_client_by_name_phone(text, text, text) TO anon, authenticated;


-- 7) 90-day retention cron (pg_cron)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'filho-90day-cleanup',
  '0 7 * * *',  -- 03:00 AST = 07:00 UTC
  $$
    DELETE FROM public.filho_messages
      WHERE created_at < now() - interval '90 days';
    DELETE FROM public.filho_conversations
      WHERE last_message_at < now() - interval '90 days';
  $$
);
