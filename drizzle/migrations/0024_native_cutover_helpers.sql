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
       AND a.status NOT IN ('cancelled', 'no_show')
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
   WHERE a.shop_id = _shop_id AND a.status NOT IN ('cancelled', 'no_show') AND a.starts_at >= now();
  SELECT count(*) INTO v_future_no_ref FROM public.appointments a
   WHERE a.shop_id = _shop_id AND a.status NOT IN ('cancelled', 'no_show') AND a.starts_at >= now()
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
   WHERE a.shop_id = _shop_id AND a.acuity_id IS NULL AND a.status NOT IN ('cancelled', 'no_show') AND a.starts_at >= now();

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
