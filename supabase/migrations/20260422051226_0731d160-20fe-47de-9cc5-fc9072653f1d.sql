-- ====== 1. Restrict barbers SELECT for clients (use barbers_public view) ======
DROP POLICY IF EXISTS "Client read active barbers" ON public.barbers;

-- Grant clients SELECT on the barbers_public view (safe columns only)
GRANT SELECT ON public.barbers_public TO authenticated, anon;

-- ====== 2. Auth hook: do NOT default to 'barber' ======
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  claims jsonb;
  user_role public.app_role;
BEGIN
  claims := event->'claims';

  SELECT role INTO user_role
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid
  LIMIT 1;

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{app_metadata,role}', to_jsonb(user_role::text));
  ELSE
    -- No assigned role: emit null instead of defaulting to 'barber'.
    -- Edge functions and policies must cross-check user_roles for any elevated access.
    claims := jsonb_set(claims, '{app_metadata,role}', 'null'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);
  RETURN event;
END;
$function$;

-- ====== 3. Scope barber pending_review transaction access to own rows ======
DROP POLICY IF EXISTS "Barber read pending_review transactions" ON public.transactions;
DROP POLICY IF EXISTS "Barber update pending_review transactions" ON public.transactions;

CREATE POLICY "Barber read pending_review transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (
  is_barber()
  AND status = 'pending_review'
  AND barber_id = (SELECT profiles.barber_id FROM public.profiles WHERE profiles.id = auth.uid())
);

CREATE POLICY "Barber update pending_review transactions"
ON public.transactions
FOR UPDATE
TO authenticated
USING (
  is_barber()
  AND status = 'pending_review'
  AND barber_id = (SELECT profiles.barber_id FROM public.profiles WHERE profiles.id = auth.uid())
)
WITH CHECK (
  is_barber()
  AND barber_id = (SELECT profiles.barber_id FROM public.profiles WHERE profiles.id = auth.uid())
);

-- ====== 4. Realtime: restrict broadcasts to staff (owner/barber) only ======
-- Clients must NOT receive raw postgres_changes for appointments/transactions.
-- Drop any existing permissive policy and add a staff-scoped one.
DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Staff can receive realtime" ON realtime.messages;

CREATE POLICY "Staff can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.is_owner() OR public.is_barber());

-- ====== 5. Fix mutable search_path on email helper functions ======
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pgmq'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;