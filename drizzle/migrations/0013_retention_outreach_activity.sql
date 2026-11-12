CREATE TABLE public.outreach_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  actor_barber_id uuid,
  action text NOT NULL DEFAULT 'copy' CHECK (action IN ('copy','whatsapp')),
  copied_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.outreach_activity_logs IS 'Retention outreach copy history. A copy is never a sent message or a reactivation. Credit is derived by outreach_credits(). Not part of history retention cleanup.';
CREATE INDEX idx_outreach_logs_client_time ON public.outreach_activity_logs (client_id, copied_at DESC);
CREATE INDEX idx_outreach_logs_time ON public.outreach_activity_logs (copied_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client_created ON public.appointments (client_id, created_at);

GRANT SELECT ON public.outreach_activity_logs TO authenticated;
GRANT ALL ON public.outreach_activity_logs TO service_role;
ALTER TABLE public.outreach_activity_logs ENABLE ROW LEVEL SECURITY;

-- Clear affinity: among the client's last 6 past non-cancelled appointments,
-- one barber has at least 2 visits and at least two thirds of them. Else NULL (ambiguous).
CREATE OR REPLACE FUNCTION public.outreach_affinity_barber(p_client_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH recent AS (
    SELECT barber_id FROM public.appointments
    WHERE client_id = p_client_id AND status <> 'cancelled' AND starts_at < now()
    ORDER BY starts_at DESC LIMIT 6
  ), total AS (SELECT count(*) AS n FROM recent)
  SELECT r.barber_id FROM recent r, total t
  GROUP BY r.barber_id, t.n
  HAVING count(*) >= 2 AND count(*) * 3 >= 2 * t.n
  ORDER BY count(*) DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.outreach_affinity_barber(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_affinity_barber(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.outreach_can_access_client(p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_owner() OR (
    public.is_barber() AND public.get_my_barber_id() IS NOT NULL
    AND public.outreach_affinity_barber(p_client_id) = public.get_my_barber_id()
  )
$$;
REVOKE ALL ON FUNCTION public.outreach_can_access_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_can_access_client(uuid) TO authenticated;

CREATE POLICY "Staff read accessible outreach activity" ON public.outreach_activity_logs
  FOR SELECT TO authenticated
  USING (public.outreach_can_access_client(client_id));

-- Affinity map for the staff UI (same rule the backend enforces).
CREATE OR REPLACE FUNCTION public.outreach_affinities()
RETURNS TABLE(client_id uuid, barber_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ranked AS (
    SELECT a.client_id, a.barber_id,
           row_number() OVER (PARTITION BY a.client_id ORDER BY a.starts_at DESC) AS rn
    FROM public.appointments a
    WHERE a.client_id IS NOT NULL AND a.status <> 'cancelled' AND a.starts_at < now()
  ), recent AS (SELECT * FROM ranked WHERE rn <= 6),
  totals AS (SELECT client_id, count(*) AS n FROM recent GROUP BY client_id),
  per AS (
    SELECT r.client_id, r.barber_id, count(*) AS c, t.n
    FROM recent r JOIN totals t USING (client_id)
    GROUP BY r.client_id, r.barber_id, t.n
  ), clear AS (
    SELECT DISTINCT ON (client_id) client_id, barber_id
    FROM per WHERE c >= 2 AND c * 3 >= 2 * n
    ORDER BY client_id, c DESC
  )
  SELECT t.client_id, c.barber_id FROM totals t LEFT JOIN clear c USING (client_id)
  WHERE (public.is_owner())
     OR (public.is_barber() AND c.barber_id IS NOT NULL AND c.barber_id = public.get_my_barber_id())
$$;
REVOKE ALL ON FUNCTION public.outreach_affinities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_affinities() TO authenticated;

-- Record a copy. Actor comes from the session; serialized per client.
CREATE OR REPLACE FUNCTION public.record_outreach_copy(p_client_id uuid, p_action text DEFAULT 'copy')
RETURNS TABLE(id uuid, copied_at timestamptz, previous_actor_name text, previous_copied_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev record;
  v_row public.outreach_activity_logs;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('copy','whatsapp') THEN RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023'; END IF;
  IF NOT public.outreach_can_access_client(p_client_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('outreach:' || p_client_id::text, 0));
  SELECT l.copied_at, p.full_name INTO v_prev
  FROM public.outreach_activity_logs l LEFT JOIN public.profiles p ON p.id = l.actor_user_id
  WHERE l.client_id = p_client_id ORDER BY l.copied_at DESC LIMIT 1;
  INSERT INTO public.outreach_activity_logs (shop_id, client_id, actor_user_id, actor_barber_id, action)
  VALUES (public.current_shop_id(v_uid), p_client_id, v_uid, public.get_my_barber_id(), p_action)
  RETURNING * INTO v_row;
  RETURN QUERY SELECT v_row.id, v_row.copied_at, v_prev.full_name, v_prev.copied_at;
END $$;
REVOKE ALL ON FUNCTION public.record_outreach_copy(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_outreach_copy(uuid, text) TO authenticated;

-- Copy history with actor names for visible clients.
CREATE OR REPLACE FUNCTION public.outreach_copy_history(p_since timestamptz)
RETURNS TABLE(id uuid, client_id uuid, actor_user_id uuid, actor_barber_id uuid, actor_name text, action text, copied_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.client_id, l.actor_user_id, l.actor_barber_id, coalesce(p.full_name, '-'), l.action, l.copied_at
  FROM public.outreach_activity_logs l LEFT JOIN public.profiles p ON p.id = l.actor_user_id
  WHERE l.copied_at >= p_since AND public.outreach_can_access_client(l.client_id)
  ORDER BY l.copied_at DESC
$$;
REVOKE ALL ON FUNCTION public.outreach_copy_history(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_copy_history(timestamptz) TO authenticated;

-- Derived credits: latest copy before a valid new booking created within 72h.
-- A copy only opens a cycle if the client had no future non-cancelled booking at copy time.
-- Only the first valid booking per copy is credited; cancelled bookings never earn credit.
CREATE OR REPLACE FUNCTION public.outreach_credits(p_start timestamptz, p_end timestamptz)
RETURNS TABLE(appointment_id uuid, client_id uuid, appointment_created_at timestamptz, appointment_starts_at timestamptz,
              appointment_barber_id uuid, copy_id uuid, copied_at timestamptz, actor_user_id uuid, actor_barber_id uuid, actor_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH eligible AS (
    SELECT l.* FROM public.outreach_activity_logs l
    WHERE l.copied_at >= p_start - interval '72 hours' AND l.copied_at < p_end
      AND NOT EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.client_id = l.client_id AND a.status <> 'cancelled'
          AND a.created_at < l.copied_at AND a.starts_at > l.copied_at)
  ), firsts AS (
    SELECT DISTINCT ON (e.id) e.id AS copy_id, e.client_id, e.copied_at, e.actor_user_id, e.actor_barber_id,
           a.id AS appointment_id, a.created_at, a.starts_at, a.barber_id
    FROM eligible e JOIN public.appointments a
      ON a.client_id = e.client_id AND a.status <> 'cancelled'
     AND a.created_at > e.copied_at AND a.created_at <= e.copied_at + interval '72 hours'
    ORDER BY e.id, a.created_at ASC, a.id
  )
  SELECT f.appointment_id, f.client_id, f.created_at, f.starts_at, f.barber_id,
         f.copy_id, f.copied_at, f.actor_user_id, f.actor_barber_id, coalesce(p.full_name, '-')
  FROM firsts f LEFT JOIN public.profiles p ON p.id = f.actor_user_id
  WHERE f.created_at >= p_start AND f.created_at < p_end
    AND NOT EXISTS (
      SELECT 1 FROM public.outreach_activity_logs l2
      WHERE l2.client_id = f.client_id AND l2.copied_at > f.copied_at AND l2.copied_at < f.created_at)
    AND (public.outreach_can_access_client(f.client_id) OR f.actor_user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.outreach_credits(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_credits(timestamptz, timestamptz) TO authenticated;