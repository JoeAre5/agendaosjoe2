-- 0023 — Agenda nativa, funciones de escritura (tiendas con shops.booking_provider = 'native').
--
-- El motor de disponibilidad (supabase/functions/_shared/availability) decide que horarios se
-- ofrecen; estas funciones son la via de escritura y la ultima guarda. Nunca tocan Acuity y
-- rechazan las tiendas que no corren en modo nativo.
--
--   shop_booking_provider(shop)              'acuity' | 'native' | 'external' | NULL
--   book_native_slot(...)                    crea UNA cita, o falla con un codigo estable
--   reschedule_native_appointment(...)       mueve y/o cambia la duracion de una cita
--   cancel_native_appointment(...)           cancela (misma semantica que staff_cancel_paid_appointment)
--
-- Quien las llama: SOLO service_role (las Edge Functions, despues de autenticar al usuario y de
-- validar el horario con el motor). Igual que acquire_booking_hold (0016): sin acceso para
-- anon ni authenticated.
--
-- Concurrencia: el MISMO candado por barbero que acquire_booking_hold y el disparador
-- serialize_barber_slot_writes: pg_advisory_xact_lock(hashtext('barber_slot:' || barber_id)).
-- Asi una reserva nativa, una reserva temporal y una cita entrante de Acuity se serializan entre si.
--
-- Codigos de error (los leen las funciones y el navegador):
--   provider_not_native, barber_unavailable, service_unavailable, addon_unavailable,
--   invalid_time, invalid_booking_source, slot_blocked, slot_held, slot_taken,
--   appointment_not_found, appointment_not_active, client_name_required.
--
-- Rollback: DROP FUNCTION de las funciones de arriba. No hay cambios de datos.

CREATE OR REPLACE FUNCTION public.shop_booking_provider(_shop_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.booking_provider FROM public.shops s WHERE s.id = _shop_id AND s.is_active
$$;

-- ─── book_native_slot ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.book_native_slot(
  _shop_id            uuid,
  _barber_id          uuid,
  _service_id         uuid,
  _starts_at          timestamptz,
  _client             jsonb,                       -- {client_id?, first_name, last_name?, phone?, email?}
  _addon_ids          uuid[]  DEFAULT '{}',
  _notes              text    DEFAULT NULL,
  _booking_source     text    DEFAULT 'public_site',
  _created_by_role    text    DEFAULT NULL,
  _created_by_user_id uuid    DEFAULT NULL,
  _payment            jsonb   DEFAULT '{}'::jsonb, -- paid, payment_confirmed, payment_method, amount_paid_cents,
                                                   -- tip_cents, payment_reference_id, stripe_payment_method_type,
                                                   -- applied_benefit_redemption_id, benefit_discount_cents
  _price_cents        integer DEFAULT NULL,        -- cambio manual (staff); por defecto servicio + complementos
  _draft_id           uuid    DEFAULT NULL,        -- el borrador que se confirma: su propia reserva temporal se ignora
  _recurring_group_id uuid    DEFAULT NULL,
  _label              text    DEFAULT NULL,
  _as_staff           boolean DEFAULT false,       -- permite servicios privados y barberos no reservables
  _allow_overlap      boolean DEFAULT false        -- solo staff: "reservar de todos modos" sobre otra cita (queda overlap_exempt)
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_service     public.services%ROWTYPE;
  v_barber      public.barbers%ROWTYPE;
  v_addon_ids   uuid[];
  v_addon_names text[] := '{}';
  v_addon_min   integer := 0;
  v_addon_cents integer := 0;
  v_addon_count integer := 0;
  v_duration    integer;
  v_ends_at     timestamptz;
  v_client_id   uuid;
  v_first       text;
  v_last        text;
  v_row         public.appointments%ROWTYPE;
BEGIN
  IF public.shop_booking_provider(_shop_id) IS DISTINCT FROM 'native' THEN
    RAISE EXCEPTION 'provider_not_native';
  END IF;
  IF _starts_at IS NULL THEN
    RAISE EXCEPTION 'invalid_time';
  END IF;
  IF _booking_source IS NULL OR _booking_source NOT IN
     ('pwa','public_site','public_referral','admin_manual','barber_manual','walk_in','phone','post_booking_link','unknown') THEN
    RAISE EXCEPTION 'invalid_booking_source';
  END IF;

  SELECT * INTO v_barber FROM public.barbers b
  WHERE b.id = _barber_id AND b.shop_id = _shop_id AND b.is_active;
  IF NOT FOUND OR (NOT v_barber.is_bookable AND NOT coalesce(_as_staff, false)) THEN
    RAISE EXCEPTION 'barber_unavailable';
  END IF;

  SELECT * INTO v_service FROM public.services s
  WHERE s.id = _service_id AND s.shop_id = _shop_id AND s.is_active
    AND (s.barber_id IS NULL OR s.barber_id = _barber_id);
  IF NOT FOUND OR (NOT v_service.is_public AND NOT coalesce(_as_staff, false)) THEN
    RAISE EXCEPTION 'service_unavailable';
  END IF;

  -- Complementos en el orden pedido, sin repetir; los nombres quedan alineados con los ids.
  SELECT coalesce(array_agg(x.id ORDER BY x.ord), '{}') INTO v_addon_ids
  FROM (
    SELECT DISTINCT ON (u.id) u.id, u.ord
    FROM unnest(coalesce(_addon_ids, '{}')) WITH ORDINALITY AS u(id, ord)
    ORDER BY u.id, u.ord
  ) x;
  IF coalesce(array_length(v_addon_ids, 1), 0) > 0 THEN
    SELECT count(*), coalesce(sum(a.duration_minutes), 0), coalesce(sum(a.price_cents), 0),
           coalesce(array_agg(a.name ORDER BY u.ord), '{}')
      INTO v_addon_count, v_addon_min, v_addon_cents, v_addon_names
    FROM unnest(v_addon_ids) WITH ORDINALITY AS u(id, ord)
    JOIN public.service_addons a ON a.id = u.id
    WHERE a.shop_id = _shop_id AND a.is_active
      AND (a.barber_id IS NULL OR a.barber_id = _barber_id);
    IF v_addon_count <> array_length(v_addon_ids, 1) THEN
      RAISE EXCEPTION 'addon_unavailable';
    END IF;
  END IF;

  v_duration := v_service.duration_minutes + v_addon_min;
  IF v_duration <= 0 THEN
    RAISE EXCEPTION 'service_unavailable';
  END IF;
  v_ends_at := _starts_at + make_interval(mins => v_duration);

  -- Mismo candado que acquire_booking_hold y serialize_barber_slot_writes (0016).
  PERFORM pg_advisory_xact_lock(hashtext('barber_slot:' || _barber_id::text));

  IF EXISTS (
    SELECT 1 FROM public.block_times bt
    WHERE bt.barber_id = _barber_id
      AND tstzrange(bt.starts_at, bt.ends_at, '[)') && tstzrange(_starts_at, v_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_blocked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.barber_id = _barber_id AND a.status NOT IN ('cancelled', 'no_show') AND a.overlap_exempt = false
      AND a.starts_at < v_ends_at AND a.ends_at > _starts_at
      AND NOT (coalesce(_allow_overlap, false) AND coalesce(_as_staff, false))
  ) THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_draft_holds h
    WHERE h.barber_id = _barber_id AND h.status = 'active' AND h.expires_at > now()
      AND h.draft_id IS DISTINCT FROM _draft_id
      AND h.starts_at < v_ends_at AND h.ends_at > _starts_at
  ) THEN
    RAISE EXCEPTION 'slot_held';
  END IF;

  -- Cliente: id explicito (debe ser de la tienda) o datos de identidad; el disparador
  -- ensure_client_exists enlaza o crea la fila de clients.
  v_client_id := nullif(_client->>'client_id', '')::uuid;
  IF v_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients c WHERE c.id = v_client_id AND c.shop_id = _shop_id
  ) THEN
    RAISE EXCEPTION 'client_name_required';
  END IF;
  v_first := coalesce(nullif(btrim(_client->>'first_name'), ''),
                      (SELECT c.first_name FROM public.clients c WHERE c.id = v_client_id));
  v_last  := coalesce(nullif(btrim(_client->>'last_name'), ''),
                      (SELECT c.last_name FROM public.clients c WHERE c.id = v_client_id));
  IF v_first IS NULL THEN
    RAISE EXCEPTION 'client_name_required';
  END IF;

  INSERT INTO public.appointments (
    shop_id, acuity_id, barber_id, client_id, client_name, client_email, client_phone,
    service_name, service_id, service_ref_id, addons, addon_ref_ids,
    starts_at, ends_at, duration_minutes, price_cents,
    paid, payment_confirmed, payment_method, amount_paid_cents, tip_cents,
    payment_reference_id, stripe_payment_method_type,
    applied_benefit_redemption_id, benefit_discount_cents,
    notes, label, status, is_recurring, recurring_group_id,
    created_by_role, created_by_user_id, booking_source, overlap_exempt
  ) VALUES (
    _shop_id, NULL, _barber_id, v_client_id,
    btrim(v_first || ' ' || coalesce(v_last, '')),
    nullif(lower(btrim(_client->>'email')), ''),
    nullif(btrim(_client->>'phone'), ''),
    v_service.name, NULL, v_service.id, v_addon_names, v_addon_ids,
    _starts_at, v_ends_at, v_duration,
    coalesce(_price_cents, v_service.price_cents + v_addon_cents),
    coalesce((_payment->>'paid')::boolean, false),
    coalesce((_payment->>'payment_confirmed')::boolean, false),
    nullif(_payment->>'payment_method', ''),
    coalesce((_payment->>'amount_paid_cents')::integer, 0),
    coalesce((_payment->>'tip_cents')::integer, 0),
    nullif(_payment->>'payment_reference_id', ''),
    nullif(_payment->>'stripe_payment_method_type', ''),
    nullif(_payment->>'applied_benefit_redemption_id', '')::uuid,
    coalesce((_payment->>'benefit_discount_cents')::integer, 0),
    nullif(btrim(_notes), ''), nullif(btrim(_label), ''),
    'scheduled', _recurring_group_id IS NOT NULL, _recurring_group_id,
    _created_by_role, _created_by_user_id, _booking_source,
    coalesce(_allow_overlap, false) AND coalesce(_as_staff, false)
  )
  RETURNING * INTO v_row;

  -- La reserva temporal de este borrador queda confirmada en la misma transaccion.
  IF _draft_id IS NOT NULL THEN
    UPDATE public.booking_draft_holds SET status = 'committed', updated_at = now()
    WHERE draft_id = _draft_id AND status = 'active';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

-- ─── reschedule_native_appointment ──────────────────────────────────────────
-- Mueve una cita y/o cambia su duracion bajo las mismas guardas que una reserva nueva.
-- NO recalcula precio ni complementos: el precio y las instantaneas de edit_line_items que el
-- staff guardo se conservan.
CREATE OR REPLACE FUNCTION public.reschedule_native_appointment(
  _appointment_id   uuid,
  _starts_at        timestamptz,
  _barber_id        uuid    DEFAULT NULL,
  _duration_minutes integer DEFAULT NULL,
  _allow_overlap    boolean DEFAULT false        -- staff confirmo "reservar de todos modos"
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_appt     public.appointments%ROWTYPE;
  v_barber   uuid;
  v_duration integer;
  v_ends_at  timestamptz;
BEGIN
  IF _starts_at IS NULL THEN
    RAISE EXCEPTION 'invalid_time';
  END IF;

  SELECT * INTO v_appt FROM public.appointments WHERE id = _appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;
  -- En una tienda nativa TODAS sus citas se manejan aqui, incluidas las heredadas de Acuity
  -- (acuity_id puesto): al cambiar la tienda a nativa, esas citas ya no se gestionan en Acuity.
  IF public.shop_booking_provider(v_appt.shop_id) IS DISTINCT FROM 'native' THEN
    RAISE EXCEPTION 'provider_not_native';
  END IF;

  v_barber := coalesce(_barber_id, v_appt.barber_id);
  IF NOT EXISTS (SELECT 1 FROM public.barbers b WHERE b.id = v_barber AND b.shop_id = v_appt.shop_id AND b.is_active) THEN
    RAISE EXCEPTION 'barber_unavailable';
  END IF;

  v_duration := coalesce(_duration_minutes, v_appt.duration_minutes);
  IF v_duration IS NULL OR v_duration <= 0 THEN
    RAISE EXCEPTION 'invalid_time';
  END IF;
  v_ends_at := _starts_at + make_interval(mins => v_duration);

  -- Candado del barbero de destino (y del de origen si cambia, siempre en el mismo orden).
  PERFORM pg_advisory_xact_lock(hashtext('barber_slot:' || x::text))
  FROM unnest(ARRAY(SELECT DISTINCT y FROM unnest(ARRAY[v_barber, v_appt.barber_id]) y ORDER BY y)) x;

  -- Se vuelve a leer ya con el candado: el estado pudo cambiar mientras esperaba.
  SELECT * INTO v_appt FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF v_appt.status IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'appointment_not_active';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.block_times bt
    WHERE bt.barber_id = v_barber
      AND tstzrange(bt.starts_at, bt.ends_at, '[)') && tstzrange(_starts_at, v_ends_at, '[)')
  ) THEN
    RAISE EXCEPTION 'slot_blocked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.barber_id = v_barber AND a.id <> _appointment_id
      AND a.status NOT IN ('cancelled', 'no_show') AND a.overlap_exempt = false
      AND a.starts_at < v_ends_at AND a.ends_at > _starts_at
      AND NOT coalesce(_allow_overlap, false)
  ) THEN
    RAISE EXCEPTION 'slot_taken';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_draft_holds h
    WHERE h.barber_id = v_barber AND h.status = 'active' AND h.expires_at > now()
      AND h.starts_at < v_ends_at AND h.ends_at > _starts_at
  ) THEN
    RAISE EXCEPTION 'slot_held';
  END IF;

  UPDATE public.appointments
     SET starts_at = _starts_at, ends_at = v_ends_at, barber_id = v_barber,
         duration_minutes = v_duration, updated_at = now(),
         overlap_exempt = overlap_exempt OR coalesce(_allow_overlap, false)
   WHERE id = _appointment_id
  RETURNING * INTO v_appt;

  RETURN to_jsonb(v_appt);
END;
$$;

-- ─── cancel_native_appointment ──────────────────────────────────────────────
-- Misma semantica que staff_cancel_paid_appointment (0020): la cita queda cancelada y no pagada,
-- y si habia un cobro el reembolso queda como 'manual'. NUNCA hay reembolsos automaticos.
CREATE OR REPLACE FUNCTION public.cancel_native_appointment(
  _appointment_id     uuid,
  _reason             text DEFAULT NULL,
  _cancelled_by_role  text DEFAULT 'owner',
  _actor_user_id      uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = _appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;
  IF public.shop_booking_provider(v_appt.shop_id) IS DISTINCT FROM 'native' THEN
    RAISE EXCEPTION 'provider_not_native';
  END IF;
  IF v_appt.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true, 'status', 'cancelled');
  END IF;

  UPDATE public.appointments SET
    status = 'cancelled',
    paid = false,
    cancelled_at = coalesce(cancelled_at, now()),
    cancelled_by_role = coalesce(cancelled_by_role, _cancelled_by_role),
    refund_status = CASE WHEN v_appt.amount_paid_cents > 0 THEN coalesce(refund_status, 'manual') ELSE refund_status END,
    updated_at = now()
  WHERE id = _appointment_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (_actor_user_id, 'cancel_native_appointment', 'appointment', _appointment_id,
    jsonb_build_object('reason', _reason, 'actor_role', _cancelled_by_role,
      'amount_paid_cents', v_appt.amount_paid_cents, 'starts_at', v_appt.starts_at));

  RETURN jsonb_build_object('success', true, 'already_cancelled', false, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.shop_booking_provider(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.book_native_slot(uuid, uuid, uuid, timestamptz, jsonb, uuid[], text, text, text, uuid, jsonb, integer, uuid, uuid, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_native_appointment(uuid, timestamptz, uuid, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_native_appointment(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_booking_provider(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.book_native_slot(uuid, uuid, uuid, timestamptz, jsonb, uuid[], text, text, text, uuid, jsonb, integer, uuid, uuid, text, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_native_appointment(uuid, timestamptz, uuid, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_native_appointment(uuid, text, text, uuid) TO service_role;
