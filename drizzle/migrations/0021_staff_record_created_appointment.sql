CREATE OR REPLACE FUNCTION public.staff_record_created_appointment(
  _acuity_id bigint, _barber_id uuid, _client_id uuid, _client_name text,
  _client_email text, _client_phone text, _service_name text, _service_id integer,
  _addons text[], _starts_at timestamptz, _ends_at timestamptz,
  _duration_minutes integer, _price_cents integer, _is_recurring boolean,
  _recurring_group_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _role text;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  _is_admin := public.has_role(_uid,'owner') OR public.has_role(_uid,'super_owner');
  IF NOT (_is_admin OR public.has_role(_uid,'barber')) THEN RAISE EXCEPTION 'not_staff'; END IF;
  _role := CASE WHEN _is_admin THEN 'admin' ELSE 'barber' END;

  IF NOT EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = _barber_id
                 AND b.shop_id = public.current_shop_id(_uid)) THEN
    RAISE EXCEPTION 'barber_not_in_shop';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.acuity_operator_log l
                 WHERE l.acuity_id = _acuity_id AND l.user_id = _uid
                   AND l.action = 'create' AND l.status_code BETWEEN 200 AND 299
                   AND l.created_at > now() - interval '2 hours') THEN
    RAISE EXCEPTION 'not_creator';
  END IF;

  INSERT INTO public.appointments(acuity_id, barber_id, client_id, client_name, client_email,
    client_phone, service_name, service_id, addons, starts_at, ends_at, duration_minutes,
    price_cents, status, paid, is_recurring, recurring_group_id, created_by_role, created_by_user_id)
  VALUES (_acuity_id, _barber_id, _client_id, _client_name, _client_email, _client_phone,
    _service_name, _service_id, coalesce(_addons,'{}'), _starts_at, _ends_at, _duration_minutes,
    _price_cents, 'scheduled', false, coalesce(_is_recurring,false), _recurring_group_id, _role, _uid)
  ON CONFLICT (acuity_id) DO UPDATE SET
    barber_id = EXCLUDED.barber_id,
    client_id = coalesce(EXCLUDED.client_id, appointments.client_id),
    client_name = EXCLUDED.client_name,
    client_email = coalesce(EXCLUDED.client_email, appointments.client_email),
    client_phone = coalesce(EXCLUDED.client_phone, appointments.client_phone),
    service_name = EXCLUDED.service_name,
    service_id = EXCLUDED.service_id,
    addons = EXCLUDED.addons,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    duration_minutes = EXCLUDED.duration_minutes,
    price_cents = EXCLUDED.price_cents,
    is_recurring = EXCLUDED.is_recurring,
    recurring_group_id = EXCLUDED.recurring_group_id,
    created_by_role = EXCLUDED.created_by_role,
    created_by_user_id = EXCLUDED.created_by_user_id
  RETURNING id INTO _id;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.staff_record_created_appointment(bigint,uuid,uuid,text,text,text,text,integer,text[],timestamptz,timestamptz,integer,integer,boolean,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_record_created_appointment(bigint,uuid,uuid,text,text,text,text,integer,text[],timestamptz,timestamptz,integer,integer,boolean,uuid) TO authenticated;