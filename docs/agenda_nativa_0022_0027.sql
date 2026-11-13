-- Agenda nativa: migraciones 0022 a 0027, en orden, con comprobacion al final de cada una.
-- NO ejecutar sin: (1) respaldo / punto de restauracion de Supabase hecho, (2) aprobacion de Charlie.
-- Todas son aditivas: no borran ni cambian datos y NO cambian ninguna tienda a nativo.
-- Si una comprobacion no da lo esperado, DETENERSE y avisar. Reversa: ver 'Rollback' en el encabezado de cada una.
-- Antes de empezar anotar:  SELECT count(*) FROM public.appointments;   (debe seguir igual al final)

-- ==================== 0022_native_scheduling_schema ====================
-- 0022 — Agenda nativa, esquema (aditivo y reversible).
--
-- Permite que una cita, un servicio o un complemento existan SIN identificador de
-- Acuity, y agrega las referencias propias que usa la agenda nativa. No cambia ni
-- borra filas. Las tiendas que siguen en Acuity conservan todo lo que usan:
--   * UNIQUE (acuity_id) se mantiene; Postgres trata los NULL como distintos, asi que las
--     citas nativas (acuity_id IS NULL) no chocan y los upsert ON CONFLICT (acuity_id)
--     siguen funcionando igual.
--   * Igual para services (acuity_type_id, barber_id) y service_addons (acuity_addon_id, barber_id).
--
-- La proteccion contra choques NO cambia: la agenda nativa usa el mismo candado por barbero
-- (pg_advisory_xact_lock('barber_slot:' || barber_id)), booking_draft_holds y get_busy_intervals
-- de la migracion 0016.
--
-- Rollback:
--   ALTER TABLE public.appointments DROP COLUMN service_ref_id, DROP COLUMN addon_ref_ids;
--   ALTER TABLE public.booking_drafts DROP COLUMN service_ref_id, DROP COLUMN addon_ref_ids;
--   DROP INDEX idx_appointments_barber_starts, idx_block_times_barber_starts, idx_appointments_service_ref;
--   (volver a poner NOT NULL en las columnas de Acuity solo es posible mientras no existan filas nativas)

-- 1. Los identificadores de Acuity pasan a ser opcionales
ALTER TABLE public.appointments   ALTER COLUMN acuity_id           DROP NOT NULL;
ALTER TABLE public.services       ALTER COLUMN acuity_type_id      DROP NOT NULL;
ALTER TABLE public.service_addons ALTER COLUMN acuity_addon_id     DROP NOT NULL;
ALTER TABLE public.booking_drafts ALTER COLUMN appointment_type_id DROP NOT NULL;
ALTER TABLE public.booking_drafts ALTER COLUMN calendar_id         DROP NOT NULL;

COMMENT ON COLUMN public.appointments.acuity_id IS
  'ID de la cita en Acuity. NULL para citas reservadas por la agenda nativa.';
COMMENT ON COLUMN public.services.acuity_type_id IS
  'ID del tipo de cita en Acuity. NULL para servicios administrados de forma nativa.';
COMMENT ON COLUMN public.service_addons.acuity_addon_id IS
  'ID del complemento en Acuity. NULL para complementos administrados de forma nativa.';

-- 2. Referencias nativas
-- appointments.service_id (integer) es el ID de tipo de Acuity; las citas nativas apuntan a services.id.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_ref_id uuid REFERENCES public.services (id),
  ADD COLUMN IF NOT EXISTS addon_ref_ids  uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.booking_drafts
  ADD COLUMN IF NOT EXISTS service_ref_id uuid REFERENCES public.services (id),
  ADD COLUMN IF NOT EXISTS addon_ref_ids  uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.appointments.service_ref_id IS
  'services.id para reservas nativas (las de Acuity conservan el service_id entero).';
COMMENT ON COLUMN public.appointments.addon_ref_ids IS
  'Lista de service_addons.id para reservas nativas; addons conserva los nombres para mostrar.';

-- 3. Indices de agenda: la disponibilidad lee "citas activas de estos barberos entre dos fechas"
CREATE INDEX IF NOT EXISTS idx_appointments_barber_starts
  ON public.appointments (barber_id, starts_at)
  WHERE status NOT IN ('cancelled', 'no_show', 'no-show');

CREATE INDEX IF NOT EXISTS idx_block_times_barber_starts
  ON public.block_times (barber_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_appointments_service_ref
  ON public.appointments (service_ref_id)
  WHERE service_ref_id IS NOT NULL;

-- 4. shop_hours.day_of_week dentro de 0 (domingo) a 6 (sabado)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shop_hours_day_of_week_check') THEN
    ALTER TABLE public.shop_hours
      ADD CONSTRAINT shop_hours_day_of_week_check
      CHECK (day_of_week >= 0 AND day_of_week <= 6) NOT VALID;
    BEGIN
      ALTER TABLE public.shop_hours VALIDATE CONSTRAINT shop_hours_day_of_week_check;
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'shop_hours tiene filas fuera de 0..6; la restriccion queda NOT VALID, corrige las filas y valida';
    END;
  END IF;
END $$;

-- Comprobacion 0022
SELECT 'OK 0022' AS paso, (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name IN ('service_ref_id','addon_ref_ids')) AS columnas_citas_esperadas_2, (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='acuity_id') AS acuity_id_nullable_esperado_YES;

-- ==================== 0023_native_booking_functions ====================
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
    WHERE a.barber_id = _barber_id AND a.status NOT IN ('cancelled', 'no_show', 'no-show') AND a.overlap_exempt = false
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

  -- guard_overlap_exempt (produccion) exige esta marca para fijar overlap_exempt; solo se llega aqui con staff autorizado.
  IF coalesce(_allow_overlap, false) AND coalesce(_as_staff, false) THEN PERFORM set_config('app.overlap_override', 'on', true); END IF;

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
  IF v_appt.status IN ('cancelled', 'no_show', 'no-show') THEN
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
      AND a.status NOT IN ('cancelled', 'no_show', 'no-show') AND a.overlap_exempt = false
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

  -- guard_overlap_exempt (produccion) exige esta marca para fijar overlap_exempt; solo se llega aqui con staff autorizado.
  IF coalesce(_allow_overlap, false) THEN PERFORM set_config('app.overlap_override', 'on', true); END IF;

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
  VALUES (COALESCE(_actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid), 'cancel_native_appointment', 'appointment', _appointment_id,
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

-- Comprobacion 0023
SELECT 'OK 0023' AS paso, count(*) AS funciones_esperadas_4 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('shop_booking_provider','book_native_slot','reschedule_native_appointment','cancel_native_appointment');

-- ==================== 0024_native_cutover_helpers ====================
-- 0024 — Agenda nativa, herramientas del corte (cambiar UNA tienda de Acuity a nativo, y volver).
--
-- Nada de esto se ejecuta solo: son funciones que un operador llama a proposito (service_role).
-- El estado inicial sigue siendo shops.booking_provider = 'acuity'.
--
--   native_backfill_service_refs(shop)   enlaza las citas heredadas de Acuity con su servicio local
--   native_cutover_check(shop)           informe de lo que falta antes de cambiar (solo lectura)
--   switch_shop_to_native(shop, actor)   comprueba, rellena referencias y cambia el proveedor
--   switch_shop_to_acuity(shop, actor)   reversa: vuelve a Acuity
--
-- El catalogo de servicios, complementos y horarios NO se migra: las tablas services,
-- service_addons y working_hours ya contienen el catalogo que hoy sincroniza Acuity; al pasar a
-- nativo esas mismas filas pasan a ser la fuente de verdad y se editan desde el admin.
--
-- Rollback: DROP FUNCTION de las de arriba. Para volver una tienda atras use switch_shop_to_acuity.

CREATE OR REPLACE FUNCTION public.native_backfill_service_refs(_shop_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  -- appointments.service_id es el ID de tipo de Acuity; services.acuity_type_id lo enlaza con
  -- la fila local (un servicio por barbero, o compartido si barber_id es NULL).
  WITH upd AS (
    UPDATE public.appointments a
       SET service_ref_id = s.id
      FROM public.services s
     WHERE a.shop_id = _shop_id
       AND a.service_ref_id IS NULL
       AND a.service_id IS NOT NULL AND a.service_id > 0
       AND a.status NOT IN ('cancelled', 'no_show', 'no-show')
       AND a.starts_at >= now() - interval '1 day'
       AND s.shop_id = _shop_id
       AND s.acuity_type_id = a.service_id
       AND (s.barber_id IS NULL OR s.barber_id = a.barber_id)
    RETURNING a.id
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.native_cutover_check(_shop_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_provider text;
  v_barbers int; v_barbers_no_hours int; v_services int; v_future int; v_future_no_ref int; v_open_drafts int;
BEGIN
  SELECT s.booking_provider INTO v_provider FROM public.shops s WHERE s.id = _shop_id AND s.is_active;
  SELECT count(*) INTO v_barbers FROM public.barbers b WHERE b.shop_id = _shop_id AND b.is_active AND b.is_bookable;
  SELECT count(*) INTO v_barbers_no_hours FROM public.barbers b
   WHERE b.shop_id = _shop_id AND b.is_active AND b.is_bookable
     AND NOT EXISTS (SELECT 1 FROM public.working_hours w WHERE w.barber_id = b.id AND w.is_active);
  SELECT count(*) INTO v_services FROM public.services s WHERE s.shop_id = _shop_id AND s.is_active AND s.is_public;
  SELECT count(*) INTO v_future FROM public.appointments a
   WHERE a.shop_id = _shop_id AND a.status NOT IN ('cancelled', 'no_show', 'no-show') AND a.starts_at >= now();
  SELECT count(*) INTO v_future_no_ref FROM public.appointments a
   WHERE a.shop_id = _shop_id AND a.status NOT IN ('cancelled', 'no_show', 'no-show') AND a.starts_at >= now()
     AND a.service_ref_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.services s
                      WHERE s.shop_id = _shop_id AND s.acuity_type_id = a.service_id AND a.service_id > 0
                        AND (s.barber_id IS NULL OR s.barber_id = a.barber_id));
  SELECT count(*) INTO v_open_drafts FROM public.booking_drafts d
   WHERE d.shop_id = _shop_id AND d.status IN ('pending', 'processing') AND d.expires_at > now();

  RETURN jsonb_build_object(
    'provider', v_provider,
    'bookable_barbers', v_barbers,
    'bookable_barbers_without_hours', v_barbers_no_hours,
    'public_services', v_services,
    'future_appointments', v_future,
    'future_appointments_without_service_match', v_future_no_ref,
    'open_booking_drafts', v_open_drafts,
    'ready', v_provider = 'acuity' AND v_barbers > 0 AND v_barbers_no_hours = 0 AND v_services > 0 AND v_open_drafts = 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_shop_to_native(_shop_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_check jsonb;
  v_linked integer;
BEGIN
  v_check := public.native_cutover_check(_shop_id);
  IF v_check->>'provider' IS DISTINCT FROM 'acuity' THEN
    RAISE EXCEPTION 'cutover_not_from_acuity';
  END IF;
  IF (v_check->>'bookable_barbers')::int = 0 THEN RAISE EXCEPTION 'cutover_no_bookable_barbers'; END IF;
  IF (v_check->>'bookable_barbers_without_hours')::int > 0 THEN RAISE EXCEPTION 'cutover_barber_without_hours'; END IF;
  IF (v_check->>'public_services')::int = 0 THEN RAISE EXCEPTION 'cutover_no_services'; END IF;
  -- Un borrador abierto nacio con datos de Acuity y no podria confirmarse de forma nativa.
  IF (v_check->>'open_booking_drafts')::int > 0 THEN RAISE EXCEPTION 'cutover_open_drafts'; END IF;

  v_linked := public.native_backfill_service_refs(_shop_id);
  UPDATE public.shops SET booking_provider = 'native', updated_at = now() WHERE id = _shop_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (COALESCE(_actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid), 'switch_shop_to_native', 'shop', _shop_id,
          jsonb_build_object('check', v_check, 'appointments_linked', v_linked));

  RETURN jsonb_build_object('success', true, 'provider', 'native', 'appointments_linked', v_linked, 'check', v_check);
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_shop_to_acuity(_shop_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_native_only integer;
BEGIN
  IF public.shop_booking_provider(_shop_id) IS DISTINCT FROM 'native' THEN
    RAISE EXCEPTION 'rollback_not_from_native';
  END IF;
  -- Las citas creadas de forma nativa (sin acuity_id) no existen en Acuity: se informa cuantas.
  SELECT count(*) INTO v_native_only FROM public.appointments a
   WHERE a.shop_id = _shop_id AND a.acuity_id IS NULL AND a.status NOT IN ('cancelled', 'no_show', 'no-show') AND a.starts_at >= now();

  UPDATE public.shops SET booking_provider = 'acuity', updated_at = now() WHERE id = _shop_id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (COALESCE(_actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid), 'switch_shop_to_acuity', 'shop', _shop_id,
          jsonb_build_object('future_native_only_appointments', v_native_only));

  RETURN jsonb_build_object('success', true, 'provider', 'acuity', 'future_native_only_appointments', v_native_only);
END;
$$;

REVOKE ALL ON FUNCTION public.native_backfill_service_refs(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.native_cutover_check(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.switch_shop_to_native(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.switch_shop_to_acuity(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.native_backfill_service_refs(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.native_cutover_check(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.switch_shop_to_native(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.switch_shop_to_acuity(uuid, uuid) TO service_role;

-- Proveedor de agenda de la tienda unica, legible por cualquiera (visitantes, clientes, staff).
-- Los clientes y visitantes no pueden leer public.shops, y el navegador necesita saber si la tienda
-- agenda de forma nativa. Solo expone lo no sensible: id, proveedor y zona horaria.
-- Devuelve NULL si no hay exactamente una tienda activa (el navegador conserva entonces Acuity).
CREATE OR REPLACE FUNCTION public.get_shop_booking_provider()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE WHEN count(*) = 1
    THEN (SELECT jsonb_build_object('shop_id', s.id, 'booking_provider', s.booking_provider, 'timezone', s.timezone)
            FROM public.shops s WHERE s.is_active LIMIT 1)
    ELSE NULL END
  FROM public.shops WHERE is_active;
$$;
REVOKE ALL ON FUNCTION public.get_shop_booking_provider() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_booking_provider() TO anon, authenticated, service_role;

-- Comprobacion 0024
SELECT 'OK 0024' AS paso, count(*) AS funciones_esperadas_5 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('native_backfill_service_refs','native_cutover_check','switch_shop_to_native','switch_shop_to_acuity','get_shop_booking_provider');

-- ==================== 0025_outbound_webhooks ====================
-- 0025 — Webhooks de salida (GoHighLevel u otro CRM).
--
-- Cada cambio importante de citas y del catalogo genera un evento que se envia por POST a las URL
-- que el dueño configure. Los disparadores viven en la base de datos, asi que cubren TODOS los
-- caminos (admin, cliente, web publica, pagos, funciones nativas de reservar/reprogramar/cancelar).
--
-- Eventos:  booking.created  booking.rescheduled  booking.updated  booking.cancelled
--           booking.no_show  booking.paid  service.created  service.updated  service.deleted
--           addon.created  addon.updated  addon.deleted
--
-- Garantias:
--   * Ningun disparador puede romper una reserva: todo error se traga (la cita se guarda igual).
--   * Sin destinos activos no se guarda nada (no crece ninguna cola).
--   * La URL de las funciones NO esta escrita a mano: vive en outbound_webhook_config (por entorno).
--     Si esta vacia, los eventos quedan en cola y salen cuando se configure (barrido por cron).
--   * No toca la cola heredada (ghl_sync_queue / GHL_WEBHOOK_URL); ambas pueden convivir.
--
-- Configuracion (solo service_role / SQL):
--   UPDATE public.outbound_webhook_config SET functions_base_url = 'https://<ref>.supabase.co/functions/v1';
--   INSERT INTO public.outbound_webhook_endpoints (name, url, event_types, secret)
--     VALUES ('GoHighLevel', 'https://services.leadconnectorhq.com/hooks/...', '{*}', 'clave-opcional');
--
-- Rollback: DROP TRIGGER ... (los *_outbound_webhook), DROP FUNCTION emit_outbound_event y demas,
--           DROP TABLE outbound_webhook_events, outbound_webhook_endpoints, outbound_webhook_config;
--           SELECT cron.unschedule('outbound-webhook-retry');

CREATE TABLE IF NOT EXISTS public.outbound_webhook_config (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  functions_base_url text,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.outbound_webhook_config (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.outbound_webhook_endpoints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid REFERENCES public.shops(id) ON DELETE CASCADE,   -- NULL = todas las tiendas
  name        text NOT NULL,
  url         text NOT NULL CHECK (url ~* '^https://'),
  event_types text[] NOT NULL DEFAULT '{*}',                         -- '*' = todos los eventos
  secret      text,                                                  -- firma HMAC-SHA256 opcional
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outbound_webhook_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id         uuid,
  event_type      text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  data            jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),  -- failed = se agotaron los reintentos
  attempt_count   integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  deliveries      jsonb NOT NULL DEFAULT '{}'::jsonb,                -- { "<endpoint_id>": { ok, http_status, at } }
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_outbound_events_due ON public.outbound_webhook_events (next_attempt_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbound_events_entity ON public.outbound_webhook_events (entity_type, entity_id, created_at DESC);

ALTER TABLE public.outbound_webhook_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_webhook_config, public.outbound_webhook_endpoints, public.outbound_webhook_events FROM anon;
DROP POLICY IF EXISTS "Owner manage webhook endpoints" ON public.outbound_webhook_endpoints;
CREATE POLICY "Owner manage webhook endpoints" ON public.outbound_webhook_endpoints
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
DROP POLICY IF EXISTS "Owner read webhook events" ON public.outbound_webhook_events;
CREATE POLICY "Owner read webhook events" ON public.outbound_webhook_events
  FOR SELECT TO authenticated USING (public.is_owner());
-- outbound_webhook_config: sin politicas => solo service_role.

-- ─── Cargas utiles ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.outbound_appointment_payload(_a public.appointments)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'appointment_id', _a.id,
    'status', _a.status,
    'starts_at', _a.starts_at,
    'ends_at', _a.ends_at,
    'duration_minutes', _a.duration_minutes,
    'service', jsonb_build_object('id', _a.service_ref_id, 'name', _a.service_name),
    'addons', to_jsonb(coalesce(_a.addons, ARRAY[]::text[])),
    'barber', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM public.barbers b WHERE b.id = _a.barber_id),
    'client', jsonb_build_object(
      'id', _a.client_id,
      'name', _a.client_name,
      'first_name', (SELECT c.first_name FROM public.clients c WHERE c.id = _a.client_id),
      'last_name', (SELECT c.last_name FROM public.clients c WHERE c.id = _a.client_id),
      'email', CASE WHEN lower(coalesce(_a.client_email, '')) LIKE '%@placeholder.local' THEN NULL ELSE _a.client_email END,
      'phone', _a.client_phone
    ),
    'price_cents', _a.price_cents,
    'paid', _a.paid,
    'payment_method', _a.payment_method,
    'amount_paid_cents', _a.amount_paid_cents,
    'tip_cents', _a.tip_cents,
    'booking_source', _a.booking_source,
    'created_by_role', _a.created_by_role,
    'is_recurring', _a.is_recurring,
    'recurring_group_id', _a.recurring_group_id,
    'label', _a.label,
    'notes', _a.notes,
    'cancelled_at', _a.cancelled_at,
    'cancelled_by_role', _a.cancelled_by_role,
    'refund_status', _a.refund_status,
    'created_at', _a.created_at,
    'updated_at', _a.updated_at
  );
$$;

-- ─── Emision (nunca lanza error) ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.emit_outbound_event(
  _event_type text, _entity_type text, _entity_id uuid, _shop_id uuid, _data jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _id uuid;
  _base text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.outbound_webhook_endpoints e
     WHERE e.is_active
       AND (e.shop_id IS NULL OR e.shop_id IS NOT DISTINCT FROM _shop_id)
       AND ('*' = ANY (e.event_types) OR _event_type = ANY (e.event_types))
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.outbound_webhook_events (shop_id, event_type, entity_type, entity_id, data)
  VALUES (_shop_id, _event_type, _entity_type, _entity_id, _data)
  RETURNING id INTO _id;

  SELECT c.functions_base_url INTO _base FROM public.outbound_webhook_config c WHERE c.id;
  IF coalesce(_base, '') <> '' THEN
    -- pg_net envia despues del COMMIT; no bloquea la reserva.
    PERFORM net.http_post(
      url     := rtrim(_base, '/') || '/outbound-webhook-dispatch',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', public.get_internal_job_secret()),
      body    := jsonb_build_object('event_id', _id)
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ─── Citas ───────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.appointments_outbound_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _payload jsonb;
  _changed jsonb;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      _payload := public.outbound_appointment_payload(NEW);
      IF NEW.status IS DISTINCT FROM 'cancelled' THEN
        PERFORM public.emit_outbound_event('booking.created', 'appointment', NEW.id, NEW.shop_id, _payload);
      END IF;
      IF coalesce(NEW.paid, false) THEN
        PERFORM public.emit_outbound_event('booking.paid', 'appointment', NEW.id, NEW.shop_id, _payload);
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      _payload := public.outbound_appointment_payload(NEW);
      IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
        PERFORM public.emit_outbound_event('booking.cancelled', 'appointment', NEW.id, NEW.shop_id, _payload);
      ELSIF NEW.status IN ('no_show', 'no-show') AND OLD.status NOT IN ('no_show', 'no-show') THEN
        PERFORM public.emit_outbound_event('booking.no_show', 'appointment', NEW.id, NEW.shop_id, _payload);
      ELSIF NEW.status NOT IN ('cancelled', 'no_show', 'no-show') THEN
        IF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.barber_id IS DISTINCT FROM OLD.barber_id THEN
          PERFORM public.emit_outbound_event('booking.rescheduled', 'appointment', NEW.id, NEW.shop_id,
            _payload || jsonb_build_object('previous', jsonb_build_object(
              'starts_at', OLD.starts_at, 'ends_at', OLD.ends_at,
              'barber', (SELECT jsonb_build_object('id', b.id, 'name', b.name) FROM public.barbers b WHERE b.id = OLD.barber_id))));
        END IF;
        SELECT coalesce(jsonb_agg(v.f), '[]'::jsonb) INTO _changed FROM (VALUES
          ('service',  OLD.service_name IS DISTINCT FROM NEW.service_name OR OLD.service_ref_id IS DISTINCT FROM NEW.service_ref_id),
          ('price',    OLD.price_cents IS DISTINCT FROM NEW.price_cents),
          ('duration', OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes),
          ('addons',   OLD.addons IS DISTINCT FROM NEW.addons),
          ('items',    OLD.edit_line_items IS DISTINCT FROM NEW.edit_line_items),
          ('notes',    OLD.notes IS DISTINCT FROM NEW.notes),
          ('label',    OLD.label IS DISTINCT FROM NEW.label),
          ('client',   OLD.client_id IS DISTINCT FROM NEW.client_id OR OLD.client_name IS DISTINCT FROM NEW.client_name
                       OR OLD.client_email IS DISTINCT FROM NEW.client_email OR OLD.client_phone IS DISTINCT FROM NEW.client_phone)
        ) AS v(f, diff) WHERE v.diff;
        IF jsonb_array_length(_changed) > 0 THEN
          PERFORM public.emit_outbound_event('booking.updated', 'appointment', NEW.id, NEW.shop_id,
            _payload || jsonb_build_object('changed', _changed));
        END IF;
      END IF;
      IF NOT coalesce(OLD.paid, false) AND coalesce(NEW.paid, false) THEN
        PERFORM public.emit_outbound_event('booking.paid', 'appointment', NEW.id, NEW.shop_id, _payload);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;  -- la cita siempre se guarda
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_outbound_webhook ON public.appointments;
CREATE TRIGGER appointments_outbound_webhook
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_outbound_trigger();

-- ─── Servicios y complementos ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.services_outbound_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _row public.services;
  _data jsonb;
  _changed jsonb;
BEGIN
  BEGIN
    _row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    _data := jsonb_build_object(
      'service_id', _row.id, 'name', _row.name, 'description', _row.description, 'category', _row.category,
      'duration_minutes', _row.duration_minutes, 'price_cents', _row.price_cents,
      'padding_before_minutes', _row.padding_before_minutes, 'padding_after_minutes', _row.padding_after_minutes,
      'barber_id', _row.barber_id, 'is_active', _row.is_active, 'is_public', _row.is_public, 'sort_order', _row.sort_order);
    IF TG_OP = 'INSERT' THEN
      PERFORM public.emit_outbound_event('service.created', 'service', NEW.id, NEW.shop_id, _data);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.emit_outbound_event('service.deleted', 'service', OLD.id, OLD.shop_id, _data);
    ELSE
      SELECT coalesce(jsonb_agg(v.f), '[]'::jsonb) INTO _changed FROM (VALUES
        ('name', OLD.name IS DISTINCT FROM NEW.name), ('description', OLD.description IS DISTINCT FROM NEW.description),
        ('category', OLD.category IS DISTINCT FROM NEW.category), ('duration', OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes),
        ('price', OLD.price_cents IS DISTINCT FROM NEW.price_cents),
        ('padding', OLD.padding_before_minutes IS DISTINCT FROM NEW.padding_before_minutes OR OLD.padding_after_minutes IS DISTINCT FROM NEW.padding_after_minutes),
        ('barber', OLD.barber_id IS DISTINCT FROM NEW.barber_id), ('active', OLD.is_active IS DISTINCT FROM NEW.is_active),
        ('public', OLD.is_public IS DISTINCT FROM NEW.is_public)
      ) AS v(f, diff) WHERE v.diff;
      IF jsonb_array_length(_changed) > 0 THEN
        PERFORM public.emit_outbound_event('service.updated', 'service', NEW.id, NEW.shop_id, _data || jsonb_build_object('changed', _changed));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS services_outbound_webhook ON public.services;
CREATE TRIGGER services_outbound_webhook
  AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.services_outbound_trigger();

CREATE OR REPLACE FUNCTION public.service_addons_outbound_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _row public.service_addons;
  _data jsonb;
  _changed jsonb;
BEGIN
  BEGIN
    _row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    _data := jsonb_build_object('addon_id', _row.id, 'name', _row.name, 'duration_minutes', _row.duration_minutes,
                                'price_cents', _row.price_cents, 'barber_id', _row.barber_id, 'is_active', _row.is_active);
    IF TG_OP = 'INSERT' THEN
      PERFORM public.emit_outbound_event('addon.created', 'addon', NEW.id, NEW.shop_id, _data);
    ELSIF TG_OP = 'DELETE' THEN
      PERFORM public.emit_outbound_event('addon.deleted', 'addon', OLD.id, OLD.shop_id, _data);
    ELSE
      SELECT coalesce(jsonb_agg(v.f), '[]'::jsonb) INTO _changed FROM (VALUES
        ('name', OLD.name IS DISTINCT FROM NEW.name), ('duration', OLD.duration_minutes IS DISTINCT FROM NEW.duration_minutes),
        ('price', OLD.price_cents IS DISTINCT FROM NEW.price_cents), ('barber', OLD.barber_id IS DISTINCT FROM NEW.barber_id),
        ('active', OLD.is_active IS DISTINCT FROM NEW.is_active)
      ) AS v(f, diff) WHERE v.diff;
      IF jsonb_array_length(_changed) > 0 THEN
        PERFORM public.emit_outbound_event('addon.updated', 'addon', NEW.id, NEW.shop_id, _data || jsonb_build_object('changed', _changed));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS service_addons_outbound_webhook ON public.service_addons;
CREATE TRIGGER service_addons_outbound_webhook
  AFTER INSERT OR UPDATE OR DELETE ON public.service_addons
  FOR EACH ROW EXECUTE FUNCTION public.service_addons_outbound_trigger();

-- ─── Permisos ────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.outbound_appointment_payload(public.appointments) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emit_outbound_event(text, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outbound_appointment_payload(public.appointments) TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_outbound_event(text, text, uuid, uuid, jsonb) TO service_role;

-- ─── Reintentos: un barrido cada 5 minutos (una sola tarea; autenticada con x-internal-secret) ──────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'outbound-webhook-retry';
    PERFORM cron.schedule(
      'outbound-webhook-retry',
      '*/5 * * * *',
      $job$
        SELECT net.http_post(
          url     := rtrim(c.functions_base_url, '/') || '/outbound-webhook-dispatch',
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', public.get_internal_job_secret()),
          body    := '{"sweep": true}'::jsonb)
        FROM public.outbound_webhook_config c
        WHERE coalesce(c.functions_base_url, '') <> ''
          AND EXISTS (SELECT 1 FROM public.outbound_webhook_events e WHERE e.status = 'pending' AND e.next_attempt_at <= now());
      $job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'No se pudo programar outbound-webhook-retry: %', SQLERRM;
END;
$$;

-- Comprobacion 0025
SELECT 'OK 0025' AS paso, (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('outbound_webhook_config','outbound_webhook_endpoints','outbound_webhook_events')) AS tablas_esperadas_3, (SELECT count(*) FROM public.outbound_webhook_endpoints) AS destinos_esperado_0;

-- ==================== 0026_app_booking_email_switch ====================
-- 0026 — Interruptor para apagar el correo de confirmacion de reserva que envia la app.
--
-- Si un CRM (GoHighLevel) va a enviar los correos de confirmacion a partir de los webhooks de
-- salida (0025), la app no debe enviar el suyo: el cliente recibiria dos. Encendido por defecto
-- (sin cambio de comportamiento). Solo afecta al correo "booking-confirmation"; los recordatorios
-- de la app son notificaciones push y tienen su propio interruptor (notification_templates.is_enabled).
--
-- Apagar:   UPDATE public.outbound_webhook_config SET app_booking_emails = false;
-- Encender: UPDATE public.outbound_webhook_config SET app_booking_emails = true;
-- Rollback: ALTER TABLE public.outbound_webhook_config DROP COLUMN app_booking_emails;
ALTER TABLE public.outbound_webhook_config
  ADD COLUMN IF NOT EXISTS app_booking_emails boolean NOT NULL DEFAULT true;

-- Comprobacion 0026
SELECT 'OK 0026' AS paso, app_booking_emails AS correos_de_la_app_esperado_true FROM public.outbound_webhook_config LIMIT 1;

-- ==================== 0027_schedule_exceptions ====================
-- 0027 — Excepciones de horario por fecha e intervalo de 30 minutos por defecto (agenda nativa).
--
-- Pedido del cliente: poder cerrar un dia concreto o cambiar el horario de un dia concreto sin tocar
-- el horario semanal. Una excepcion REEMPLAZA el horario semanal (negocio y barbero) de esa fecha para
-- su alcance. barber_id NULL = todos los barberos; la de un barbero gana a la general. Varias filas
-- no cerradas para el mismo alcance y fecha forman un horario partido (por ejemplo con almuerzo).
-- Una cita que ya existe en un dia que luego se cierra NO se cancela: solo deja de ofrecerse ese dia.
--
-- Rollback:
--   DROP TABLE public.schedule_exceptions;
--   ALTER TABLE public.booking_rules ALTER COLUMN slot_interval_minutes SET DEFAULT 15;

CREATE TABLE IF NOT EXISTS public.schedule_exceptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id        uuid NOT NULL DEFAULT public.current_shop_id() REFERENCES public.shops(id) ON DELETE CASCADE,
  barber_id      uuid REFERENCES public.barbers(id) ON DELETE CASCADE,   -- NULL = todos los barberos
  exception_date date NOT NULL,                                          -- dia local de la tienda
  is_closed      boolean NOT NULL DEFAULT true,
  start_time     time,
  end_time       time,
  note           text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_exceptions_shape CHECK (
    (is_closed AND start_time IS NULL AND end_time IS NULL)
    OR (NOT is_closed AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  )
);

CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_shop_date ON public.schedule_exceptions (shop_id, exception_date);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_barber_date ON public.schedule_exceptions (barber_id, exception_date);

ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_exceptions FROM anon;

-- Dueño: todo. Barbero: lee las generales y las suyas, y gestiona solo las suyas.
DROP POLICY IF EXISTS "Owner manage schedule exceptions" ON public.schedule_exceptions;
CREATE POLICY "Owner manage schedule exceptions" ON public.schedule_exceptions
  FOR ALL TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Barber read schedule exceptions" ON public.schedule_exceptions;
CREATE POLICY "Barber read schedule exceptions" ON public.schedule_exceptions
  FOR SELECT TO authenticated
  USING (public.is_barber() AND (barber_id IS NULL OR barber_id = public.get_my_barber_id()));

DROP POLICY IF EXISTS "Barber manage own schedule exceptions" ON public.schedule_exceptions;
CREATE POLICY "Barber manage own schedule exceptions" ON public.schedule_exceptions
  FOR ALL TO authenticated
  USING (public.is_barber() AND barber_id IS NOT NULL AND barber_id = public.get_my_barber_id())
  WITH CHECK (public.is_barber() AND barber_id IS NOT NULL AND barber_id = public.get_my_barber_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_exceptions TO authenticated, service_role;

-- Intervalo de horas ofrecidas: 30 min para reglas nuevas (las existentes no cambian).
ALTER TABLE public.booking_rules ALTER COLUMN slot_interval_minutes SET DEFAULT 30;

-- Comprobacion 0027
SELECT 'OK 0027' AS paso, (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='schedule_exceptions') AS tabla_esperada_1;

-- Comprobacion final: el numero de citas no cambio y ninguna tienda esta en nativo.
SELECT (SELECT count(*) FROM public.appointments) AS citas, (SELECT count(*) FROM public.shops WHERE booking_provider <> 'acuity') AS tiendas_no_acuity_esperado_0;
