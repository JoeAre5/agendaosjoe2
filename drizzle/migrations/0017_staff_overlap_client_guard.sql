-- STAGED ONLY. Validated locally; do not apply to production without release approval.
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
             AND starts_at < _ends_at AND ends_at > _starts_at) THEN
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

CREATE OR REPLACE FUNCTION public.get_busy_intervals(_barber_id uuid, _window_start timestamptz, _window_end timestamptz)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.starts_at, a.ends_at FROM appointments a
  WHERE a.barber_id = _barber_id AND a.status NOT IN ('cancelled','no_show') 
    AND a.starts_at < _window_end AND a.ends_at > _window_start
  UNION ALL
  SELECT h.starts_at, h.ends_at FROM booking_draft_holds h
  WHERE h.barber_id = _barber_id AND h.status = 'active' AND h.expires_at > now()
    AND h.starts_at < _window_end AND h.ends_at > _window_start;
$$;


-- Keep the existing serializer and protect nonexempt writes from exempt appointments too.
CREATE OR REPLACE FUNCTION public.serialize_barber_slot_writes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _client boolean;
BEGIN
  IF NEW.barber_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('barber_slot:' || NEW.barber_id::text));
  END IF;
  _client := auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'client')
    AND NOT (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'barber')
      OR public.has_role(auth.uid(),'super_owner') OR public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'staff'));
  IF NEW.status NOT IN ('cancelled','no_show') AND (NOT coalesce(NEW.overlap_exempt,false) OR _client)
     AND EXISTS (SELECT 1 FROM public.appointments a WHERE a.barber_id=NEW.barber_id
       AND a.id IS DISTINCT FROM NEW.id AND a.status NOT IN ('cancelled','no_show')
       AND a.starts_at < NEW.ends_at AND a.ends_at > NEW.starts_at) THEN
    RAISE EXCEPTION 'slot_taken' USING ERRCODE='23P01';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.acquire_booking_hold(uuid,uuid,timestamptz,timestamptz,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.get_busy_intervals(uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_booking_hold(uuid,uuid,timestamptz,timestamptz,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_busy_intervals(uuid,timestamptz,timestamptz) TO service_role;
