-- Internal caller secret for scheduled jobs and DB-triggered function calls
CREATE TABLE IF NOT EXISTS public.internal_job_secret (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.internal_job_secret TO service_role;
REVOKE ALL ON public.internal_job_secret FROM anon, authenticated;
ALTER TABLE public.internal_job_secret ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_job_secret (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_internal_job_secret()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT secret FROM public.internal_job_secret WHERE id = true $$;
REVOKE ALL ON FUNCTION public.get_internal_job_secret() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_internal_job_secret(_secret text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT coalesce(length(_secret) > 0 AND _secret = (SELECT secret FROM public.internal_job_secret WHERE id = true), false) $$;
REVOKE ALL ON FUNCTION public.verify_internal_job_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_job_secret(text) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_ghl_event(_appointment_id uuid, _event_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  _queue_id uuid;
  _fn_url text := 'https://zskjtfpiohvsgwvbbxnc.supabase.co/functions/v1/ghl-sync-dispatch';
BEGIN
  INSERT INTO public.ghl_sync_queue (appointment_id, event_type)
  VALUES (_appointment_id, _event_type)
  ON CONFLICT (appointment_id, event_type) DO NOTHING
  RETURNING id INTO _queue_id;

  IF _queue_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM extensions.http_post(
    url     := _fn_url,
    headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', public.get_internal_job_secret()),
    body    := jsonb_build_object('queue_id', _queue_id)
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$function$;