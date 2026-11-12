-- Enable pg_net so we can call edge functions from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ─── 1. Queue table ───
CREATE TABLE public.ghl_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('booking.created','booking.paid','booking.cancelled','booking.rescheduled')),
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempt_count integer NOT NULL DEFAULT 0,
  http_status integer,
  last_error text,
  payload jsonb,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ghl_sync_queue_unique_event UNIQUE (appointment_id, event_type)
);

CREATE INDEX idx_ghl_sync_queue_status ON public.ghl_sync_queue (status, created_at);

-- ─── 2. Grants (service-role only; queue is internal) ───
GRANT ALL ON public.ghl_sync_queue TO service_role;

-- ─── 3. RLS ───
ALTER TABLE public.ghl_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages ghl queue"
  ON public.ghl_sync_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── 4. updated_at trigger ───
CREATE TRIGGER ghl_sync_queue_set_updated_at
  BEFORE UPDATE ON public.ghl_sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 5. Dispatch helper: enqueue + async invoke edge function ───
CREATE OR REPLACE FUNCTION public.enqueue_ghl_event(
  _appointment_id uuid,
  _event_type text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _queue_id uuid;
  _fn_url text := 'https://zskjtfpiohvsgwvbbxnc.supabase.co/functions/v1/ghl-sync-dispatch';
BEGIN
  -- Idempotent insert: skip if (appointment, event_type) already queued.
  INSERT INTO public.ghl_sync_queue (appointment_id, event_type)
  VALUES (_appointment_id, _event_type)
  ON CONFLICT (appointment_id, event_type) DO NOTHING
  RETURNING id INTO _queue_id;

  IF _queue_id IS NULL THEN
    RETURN; -- already queued, nothing to do
  END IF;

  -- Fire async POST to dispatch edge function. pg_net returns immediately.
  PERFORM extensions.http_post(
    url     := _fn_url,
    headers := jsonb_build_object('Content-Type','application/json'),
    body    := jsonb_build_object('queue_id', _queue_id)
  );
EXCEPTION WHEN OTHERS THEN
  -- Never propagate; booking flow must continue even if pg_net is unavailable.
  NULL;
END;
$$;

-- ─── 6. Appointment trigger function ───
CREATE OR REPLACE FUNCTION public.appointments_ghl_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status IS DISTINCT FROM 'cancelled' THEN
        PERFORM public.enqueue_ghl_event(NEW.id, 'booking.created');
      END IF;
      IF NEW.paid = true THEN
        PERFORM public.enqueue_ghl_event(NEW.id, 'booking.paid');
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF COALESCE(OLD.paid, false) = false AND NEW.paid = true THEN
        PERFORM public.enqueue_ghl_event(NEW.id, 'booking.paid');
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Swallow any error so the booking insert/update always succeeds.
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- ─── 7. Wire triggers (separate INSERT and UPDATE for clarity) ───
DROP TRIGGER IF EXISTS appointments_ghl_sync_insert ON public.appointments;
CREATE TRIGGER appointments_ghl_sync_insert
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_ghl_sync_trigger();

DROP TRIGGER IF EXISTS appointments_ghl_sync_update ON public.appointments;
CREATE TRIGGER appointments_ghl_sync_update
  AFTER UPDATE OF paid ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_ghl_sync_trigger();