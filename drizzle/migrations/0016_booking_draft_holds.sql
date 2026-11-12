CREATE TABLE public.booking_draft_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL UNIQUE REFERENCES public.booking_drafts(id) ON DELETE CASCADE,
  shop_id uuid REFERENCES public.shops(id),
  barber_id uuid NOT NULL REFERENCES public.barbers(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','committed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_draft_holds_range_valid CHECK (starts_at < ends_at)
);
CREATE INDEX idx_booking_draft_holds_barber_active ON public.booking_draft_holds (barber_id, expires_at) WHERE status = 'active';
GRANT ALL ON public.booking_draft_holds TO service_role;
GRANT SELECT ON public.booking_draft_holds TO authenticated;
ALTER TABLE public.booking_draft_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners view holds" ON public.booking_draft_holds FOR SELECT TO authenticated
  USING (is_owner() OR has_role(auth.uid(), 'super_owner'::app_role));

CREATE OR REPLACE FUNCTION public.acquire_booking_hold(_draft_id uuid, _barber_id uuid, _starts_at timestamptz, _ends_at timestamptz, _hold_minutes integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _exp timestamptz; _shop uuid;
BEGIN
  IF _starts_at IS NULL OR _ends_at IS NULL OR _starts_at >= _ends_at THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_time_range');
  END IF;
  IF _hold_minutes < 1 OR _hold_minutes > 120 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_hold_minutes');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('barber_slot:' || _barber_id::text));
  IF EXISTS (SELECT 1 FROM appointments WHERE barber_id = _barber_id AND status NOT IN ('cancelled','no_show')
             AND overlap_exempt = false AND starts_at < _ends_at AND ends_at > _starts_at) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'slot_taken', 'clash_type', 'appointment');
  END IF;
  IF EXISTS (SELECT 1 FROM booking_draft_holds WHERE barber_id = _barber_id AND status = 'active'
             AND expires_at > now() AND draft_id <> _draft_id AND starts_at < _ends_at AND ends_at > _starts_at) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'slot_taken', 'clash_type', 'hold');
  END IF;
  SELECT shop_id INTO _shop FROM barbers WHERE id = _barber_id;
  _exp := now() + make_interval(mins => _hold_minutes);
  INSERT INTO booking_draft_holds (draft_id, shop_id, barber_id, starts_at, ends_at, expires_at, status)
  VALUES (_draft_id, _shop, _barber_id, _starts_at, _ends_at, _exp, 'active')
  ON CONFLICT (draft_id) DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
    expires_at = EXCLUDED.expires_at, status = 'active', updated_at = now()
  RETURNING id INTO _id;
  UPDATE booking_drafts SET expires_at = _exp WHERE id = _draft_id;
  RETURN jsonb_build_object('success', true, 'hold_id', _id, 'expires_at', _exp);
END $$;

CREATE OR REPLACE FUNCTION public.release_booking_hold(_draft_id uuid, _final_status text DEFAULT 'released')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _final_status NOT IN ('released','committed') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE booking_draft_holds SET status = _final_status, updated_at = now()
  WHERE draft_id = _draft_id AND status = 'active';
END $$;

CREATE OR REPLACE FUNCTION public.get_busy_intervals(_barber_id uuid, _window_start timestamptz, _window_end timestamptz)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.starts_at, a.ends_at FROM appointments a
  WHERE a.barber_id = _barber_id AND a.status NOT IN ('cancelled','no_show') AND a.overlap_exempt = false
    AND a.starts_at < _window_end AND a.ends_at > _window_start
  UNION ALL
  SELECT h.starts_at, h.ends_at FROM booking_draft_holds h
  WHERE h.barber_id = _barber_id AND h.status = 'active' AND h.expires_at > now()
    AND h.starts_at < _window_end AND h.ends_at > _window_start;
$$;

-- Local appointment writers serialize on the same per-barber lock (no rejection: inbound Acuity is never silently discarded here).
CREATE OR REPLACE FUNCTION public.serialize_barber_slot_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.barber_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('barber_slot:' || NEW.barber_id::text));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_serialize_barber_slot_writes BEFORE INSERT OR UPDATE OF starts_at, ends_at, barber_id, status
  ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.serialize_barber_slot_writes();

REVOKE ALL ON FUNCTION public.acquire_booking_hold(uuid, uuid, timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_booking_hold(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_busy_intervals(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_booking_hold(uuid, uuid, timestamptz, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_booking_hold(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_busy_intervals(uuid, timestamptz, timestamptz) TO service_role;