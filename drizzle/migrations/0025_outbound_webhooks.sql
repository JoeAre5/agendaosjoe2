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
      ELSIF NEW.status = 'no_show' AND OLD.status IS DISTINCT FROM 'no_show' THEN
        PERFORM public.emit_outbound_event('booking.no_show', 'appointment', NEW.id, NEW.shop_id, _payload);
      ELSIF NEW.status NOT IN ('cancelled', 'no_show') THEN
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
