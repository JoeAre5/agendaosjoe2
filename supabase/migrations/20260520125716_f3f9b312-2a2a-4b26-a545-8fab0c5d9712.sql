
-- 1. CLIENT REWARDS LEDGER
CREATE TABLE public.client_rewards_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  points integer NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'spending','matching_bonus','manual_adjust',
    'refund_reversal','cancellation_reversal','redemption'
  )),
  source_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  source_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  source_referral_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  description_es text,
  description_en text,
  created_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rewards_ledger_client ON public.client_rewards_ledger(client_id, created_at DESC);
CREATE INDEX idx_rewards_ledger_tx ON public.client_rewards_ledger(source_transaction_id) WHERE source_transaction_id IS NOT NULL;
CREATE INDEX idx_rewards_ledger_source_type ON public.client_rewards_ledger(source_type);

ALTER TABLE public.client_rewards_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rewards client read self" ON public.client_rewards_ledger FOR SELECT TO authenticated
  USING (is_client() AND client_id = get_my_client_id());
CREATE POLICY "rewards owner full" ON public.client_rewards_ledger FOR ALL TO authenticated
  USING (is_owner()) WITH CHECK (is_owner());

-- 2. REWARDS BENEFITS CATALOG
CREATE TABLE public.rewards_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_es text NOT NULL,
  title_en text NOT NULL,
  description_es text,
  description_en text,
  required_points integer NOT NULL CHECK (required_points > 0),
  icon text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rewards_benefits_active ON public.rewards_benefits(is_active, sort_order);

ALTER TABLE public.rewards_benefits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "benefits public read" ON public.rewards_benefits FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "benefits owner full" ON public.rewards_benefits FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

CREATE TRIGGER trg_rewards_benefits_updated BEFORE UPDATE ON public.rewards_benefits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. REFERRAL SLUG HISTORY
CREATE TABLE public.referral_slug_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('client','barber','shop','professional','representative')),
  owner_id uuid NOT NULL,
  old_slug text,
  new_slug text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);
CREATE INDEX idx_slug_history_owner ON public.referral_slug_history(owner_type, owner_id, changed_at DESC);

ALTER TABLE public.referral_slug_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slug history owner read" ON public.referral_slug_history FOR SELECT TO authenticated USING (is_owner());
CREATE POLICY "slug history client read self" ON public.referral_slug_history FOR SELECT TO authenticated
  USING (is_client() AND owner_type = 'client' AND owner_id = get_my_client_id());

-- 4. REFERRAL NETWORK EDGES
CREATE TABLE public.referral_network_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upline_owner_id uuid NOT NULL REFERENCES public.referral_owners(id) ON DELETE CASCADE,
  downline_owner_id uuid NOT NULL REFERENCES public.referral_owners(id) ON DELETE CASCADE,
  direct_referrer_owner_id uuid REFERENCES public.referral_owners(id) ON DELETE SET NULL,
  depth integer NOT NULL DEFAULT 1,
  branch_root_owner_id uuid REFERENCES public.referral_owners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(upline_owner_id, downline_owner_id)
);
CREATE INDEX idx_network_upline ON public.referral_network_edges(upline_owner_id, depth);
CREATE INDEX idx_network_downline ON public.referral_network_edges(downline_owner_id);
CREATE INDEX idx_network_branch ON public.referral_network_edges(branch_root_owner_id);

ALTER TABLE public.referral_network_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "network edges owner full" ON public.referral_network_edges FOR ALL TO authenticated USING (is_owner()) WITH CHECK (is_owner());

-- 5. CLIENTS columns
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS referral_slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_slug_updated_at timestamptz;

-- 6. HELPERS
CREATE OR REPLACE FUNCTION public.is_slug_reserved(_slug text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(_slug) = ANY (ARRAY[
    'admin','api','app','auth','login','signup','register','logout',
    'shop','r','ref','referral','referidos','beneficios','rewards',
    'puntos','points','dashboard','settings','profile','help','support',
    'home','index','booking','citas','www','staff','owner','barber','barbero'
  ])
$$;

CREATE OR REPLACE FUNCTION public.is_valid_slug_format(_slug text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _slug IS NOT NULL
    AND length(_slug) BETWEEN 3 AND 32
    AND _slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
$$;

CREATE OR REPLACE FUNCTION public.check_referral_slug_available(_slug text, _exclude_client_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _norm text := lower(trim(_slug));
BEGIN
  IF NOT public.is_valid_slug_format(_norm) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'invalid_format');
  END IF;
  IF public.is_slug_reserved(_norm) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'reserved');
  END IF;
  IF EXISTS (SELECT 1 FROM public.referral_owners WHERE lower(slug) = _norm) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'taken');
  END IF;
  IF EXISTS (SELECT 1 FROM public.referral_links WHERE lower(slug) = _norm) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'taken');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE lower(referral_slug) = _norm
      AND (_exclude_client_id IS NULL OR id <> _exclude_client_id)
  ) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'taken');
  END IF;
  RETURN jsonb_build_object('available', true);
END $$;

CREATE OR REPLACE FUNCTION public.generate_client_referral_slug(_first_name text, _client_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _base text;
  _candidate text;
  _hash text;
  _i int := 0;
BEGIN
  _base := lower(regexp_replace(coalesce(_first_name, 'cliente'), '[^a-zA-Z0-9]', '', 'g'));
  IF length(_base) < 3 THEN _base := _base || 'rev'; END IF;
  IF length(_base) > 16 THEN _base := substring(_base, 1, 16); END IF;

  LOOP
    _hash := substring(replace(_client_id::text, '-', '') from (1 + _i * 4) for 4);
    IF _hash IS NULL OR length(_hash) < 4 THEN
      _hash := substring(md5(random()::text), 1, 4);
    END IF;
    _candidate := _base || '-' || _hash;
    EXIT WHEN (public.check_referral_slug_available(_candidate) ->> 'available')::boolean;
    _i := _i + 1;
    IF _i > 8 THEN _candidate := _base || '-' || substring(md5(random()::text), 1, 6); EXIT; END IF;
  END LOOP;
  RETURN _candidate;
END $$;

CREATE OR REPLACE FUNCTION public.tg_client_autoslug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.referral_slug IS NULL THEN
    NEW.referral_slug := public.generate_client_referral_slug(NEW.first_name, NEW.id);
    NEW.referral_slug_updated_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_clients_autoslug BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_client_autoslug();

-- Backfill existing clients without slug
DO $$
DECLARE _c record;
BEGIN
  FOR _c IN SELECT id, first_name FROM public.clients WHERE referral_slug IS NULL LOOP
    UPDATE public.clients
      SET referral_slug = public.generate_client_referral_slug(_c.first_name, _c.id),
          referral_slug_updated_at = now()
      WHERE id = _c.id;
  END LOOP;
END $$;

ALTER TABLE public.clients ALTER COLUMN referral_slug SET NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_client_referral_owner(_client_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _owner_id uuid;
  _client record;
BEGIN
  SELECT id INTO _owner_id FROM public.referral_owners
    WHERE owner_type = 'client' AND owner_profile_id = _client_id LIMIT 1;
  IF _owner_id IS NOT NULL THEN RETURN _owner_id; END IF;

  SELECT id, first_name, last_name, referral_slug INTO _client FROM public.clients WHERE id = _client_id;
  IF _client IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.referral_owners (owner_type, owner_profile_id, display_name, slug, active)
  VALUES (
    'client', _client_id,
    trim(coalesce(_client.first_name, '') || ' ' || coalesce(_client.last_name, '')),
    _client.referral_slug, true
  )
  RETURNING id INTO _owner_id;
  RETURN _owner_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_client_referral_slug(_new_slug text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client_id uuid := public.get_my_client_id();
  _current record;
  _check jsonb;
  _owner_id uuid;
  _norm text := lower(trim(_new_slug));
BEGIN
  IF _client_id IS NULL THEN RAISE EXCEPTION 'not a client' USING ERRCODE = '42501'; END IF;
  SELECT id, referral_slug, referral_slug_updated_at INTO _current FROM public.clients WHERE id = _client_id;

  IF _current.referral_slug_updated_at IS NOT NULL
     AND _current.referral_slug_updated_at > (now() - interval '30 days')
     AND _current.referral_slug IS DISTINCT FROM _norm THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cooldown',
      'next_allowed_at', _current.referral_slug_updated_at + interval '30 days');
  END IF;

  IF _current.referral_slug = _norm THEN
    RETURN jsonb_build_object('success', true, 'slug', _norm, 'unchanged', true);
  END IF;

  _check := public.check_referral_slug_available(_norm, _client_id);
  IF NOT (_check ->> 'available')::boolean THEN
    RETURN jsonb_build_object('success', false, 'reason', _check ->> 'reason');
  END IF;

  INSERT INTO public.referral_slug_history (owner_type, owner_id, old_slug, new_slug, changed_by)
  VALUES ('client', _client_id, _current.referral_slug, _norm, auth.uid());

  UPDATE public.clients SET referral_slug = _norm, referral_slug_updated_at = now() WHERE id = _client_id;
  _owner_id := public.ensure_client_referral_owner(_client_id);
  UPDATE public.referral_owners SET slug = _norm WHERE id = _owner_id;
  RETURN jsonb_build_object('success', true, 'slug', _norm);
END $$;

-- 7. POINTS CALC
CREATE OR REPLACE FUNCTION public.calc_reward_points(_cents integer)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT GREATEST(0,
    CASE WHEN (_cents % 100) > 50 THEN (_cents / 100) + 1 ELSE (_cents / 100) END
  )
$$;

-- 8. REWARDS TRIGGER
CREATE OR REPLACE FUNCTION public.record_client_rewards_from_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _client_id uuid := NEW.client_id;
  _points int;
  _is_first_paid boolean;
  _cra record;
  _owner record;
  _referrer_client_id uuid;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF _client_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.client_rewards_ledger
             WHERE source_transaction_id = NEW.id AND source_type = 'spending') THEN
    RETURN NEW;
  END IF;

  _points := public.calc_reward_points(COALESCE(NEW.subtotal_cents, 0));
  IF _points > 0 THEN
    INSERT INTO public.client_rewards_ledger
      (client_id, points, source_type, source_transaction_id, source_appointment_id, description_es, description_en, metadata)
    VALUES (_client_id, _points, 'spending', NEW.id, NEW.appointment_id,
      'Puntos por compra', 'Points earned', jsonb_build_object('subtotal_cents', NEW.subtotal_cents));
  END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.transactions
    WHERE client_id = _client_id AND status = 'completed' AND id <> NEW.id
  ) INTO _is_first_paid;
  IF NOT _is_first_paid THEN RETURN NEW; END IF;

  SELECT * INTO _cra FROM public.client_referral_attributions WHERE client_id = _client_id;
  IF _cra IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _owner FROM public.referral_owners WHERE id = _cra.current_referral_owner_id;
  IF _owner IS NULL OR _owner.owner_type <> 'client' OR _owner.owner_profile_id IS NULL THEN RETURN NEW; END IF;

  _referrer_client_id := _owner.owner_profile_id;
  IF _referrer_client_id = _client_id THEN RETURN NEW; END IF;

  IF _points > 0 THEN
    INSERT INTO public.client_rewards_ledger
      (client_id, points, source_type, source_transaction_id, source_appointment_id, source_referral_client_id,
       description_es, description_en, metadata)
    VALUES (_referrer_client_id, _points, 'matching_bonus', NEW.id, NEW.appointment_id, _client_id,
      'Bono por Referir', 'Matching Bonus',
      jsonb_build_object('referred_client_id', _client_id, 'subtotal_cents', NEW.subtotal_cents));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_record_client_rewards
  AFTER INSERT OR UPDATE OF status ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.record_client_rewards_from_tx();

-- 9. REVERSAL TRIGGER (tx)
CREATE OR REPLACE FUNCTION public.reverse_client_rewards_from_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _should_reverse boolean := false;
  _reversal_type text := 'refund_reversal';
  _existing record;
BEGIN
  IF OLD.status = 'completed' AND NEW.status IN ('refunded','failed') THEN
    _should_reverse := true;
    _reversal_type := CASE WHEN NEW.status = 'refunded' THEN 'refund_reversal' ELSE 'cancellation_reversal' END;
  ELSIF OLD.refunded_at IS NULL AND NEW.refunded_at IS NOT NULL THEN
    _should_reverse := true; _reversal_type := 'refund_reversal';
  END IF;
  IF NOT _should_reverse THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM public.client_rewards_ledger
             WHERE source_transaction_id = NEW.id AND source_type IN ('refund_reversal','cancellation_reversal')) THEN
    RETURN NEW;
  END IF;

  FOR _existing IN
    SELECT client_id, points, source_referral_client_id FROM public.client_rewards_ledger
    WHERE source_transaction_id = NEW.id AND source_type IN ('spending','matching_bonus')
  LOOP
    INSERT INTO public.client_rewards_ledger
      (client_id, points, source_type, source_transaction_id, source_referral_client_id,
       description_es, description_en, metadata)
    VALUES (_existing.client_id, -_existing.points, _reversal_type, NEW.id, _existing.source_referral_client_id,
      CASE _reversal_type WHEN 'refund_reversal' THEN 'Reversión por reembolso' ELSE 'Reversión por cancelación' END,
      CASE _reversal_type WHEN 'refund_reversal' THEN 'Refund reversal' ELSE 'Cancellation reversal' END,
      jsonb_build_object('original_points', _existing.points));
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_reverse_client_rewards
  AFTER UPDATE OF status, refunded_at ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.reverse_client_rewards_from_tx();

-- 10. REVERSE on appointment cancel
CREATE OR REPLACE FUNCTION public.reverse_client_rewards_on_appt_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _tx record; _existing record;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN RETURN NEW; END IF;
  FOR _tx IN SELECT id FROM public.transactions WHERE appointment_id = NEW.id AND status = 'completed' LOOP
    IF EXISTS (SELECT 1 FROM public.client_rewards_ledger
               WHERE source_transaction_id = _tx.id AND source_type = 'cancellation_reversal') THEN CONTINUE; END IF;
    FOR _existing IN
      SELECT client_id, points, source_referral_client_id FROM public.client_rewards_ledger
      WHERE source_transaction_id = _tx.id AND source_type IN ('spending','matching_bonus')
    LOOP
      INSERT INTO public.client_rewards_ledger
        (client_id, points, source_type, source_transaction_id, source_appointment_id, source_referral_client_id,
         description_es, description_en, metadata)
      VALUES (_existing.client_id, -_existing.points, 'cancellation_reversal', _tx.id, NEW.id,
        _existing.source_referral_client_id, 'Reversión por cancelación de cita', 'Reversal: appointment cancelled',
        jsonb_build_object('original_points', _existing.points));
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_reverse_rewards_appt_cancel
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.reverse_client_rewards_on_appt_cancel();

-- 11. ADMIN ADJUST
CREATE OR REPLACE FUNCTION public.admin_adjust_client_rewards(_client_id uuid, _points integer, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501'; END IF;
  IF _points = 0 THEN RAISE EXCEPTION 'points must be non-zero'; END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'reason required (min 3 chars)'; END IF;

  INSERT INTO public.client_rewards_ledger
    (client_id, points, source_type, description_es, description_en, created_by, metadata)
  VALUES (_client_id, _points, 'manual_adjust',
    'Ajuste manual: ' || _reason, 'Manual adjustment: ' || _reason,
    auth.uid(), jsonb_build_object('reason', _reason))
  RETURNING id INTO _id;

  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'admin_adjust_client_rewards', 'client', _client_id,
    jsonb_build_object('points', _points, 'reason', _reason, 'ledger_id', _id));
  RETURN _id;
END $$;

-- 12. SUMMARY
CREATE OR REPLACE FUNCTION public.get_client_rewards_summary(_client_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _target uuid; _balance int; _spending int; _bonus int; _adjustments int;
  _referrals_count int; _next_benefit record; _benefits jsonb; _history jsonb; _client record;
BEGIN
  _target := COALESCE(_client_id, public.get_my_client_id());
  IF _target IS NULL THEN RAISE EXCEPTION 'no target client'; END IF;
  IF NOT (public.is_owner() OR _target = public.get_my_client_id()) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT id, first_name, last_name, referral_slug, referral_slug_updated_at
    INTO _client FROM public.clients WHERE id = _target;

  SELECT COALESCE(SUM(points), 0)::int,
         COALESCE(SUM(points) FILTER (WHERE source_type IN ('spending','refund_reversal','cancellation_reversal')), 0)::int,
         COALESCE(SUM(points) FILTER (WHERE source_type = 'matching_bonus'), 0)::int,
         COALESCE(SUM(points) FILTER (WHERE source_type IN ('manual_adjust','redemption')), 0)::int
  INTO _balance, _spending, _bonus, _adjustments
  FROM public.client_rewards_ledger WHERE client_id = _target;

  SELECT count(*)::int INTO _referrals_count
  FROM public.client_referral_attributions cra
  JOIN public.referral_owners ro ON ro.id = cra.current_referral_owner_id
  WHERE ro.owner_type = 'client' AND ro.owner_profile_id = _target;

  SELECT id, title_es, title_en, required_points, icon INTO _next_benefit
  FROM public.rewards_benefits
  WHERE is_active = true AND required_points > _balance
  ORDER BY required_points ASC LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_to_json(b) ORDER BY (b.required_points)), '[]'::jsonb) INTO _benefits
  FROM (
    SELECT id, title_es, title_en, description_es, description_en, required_points, icon, sort_order,
           _balance >= required_points AS unlocked,
           LEAST(100, GREATEST(0, (_balance::numeric / NULLIF(required_points,0) * 100)))::int AS progress_pct
    FROM public.rewards_benefits WHERE is_active = true
    ORDER BY sort_order, required_points
  ) b;

  SELECT COALESCE(jsonb_agg(row_to_json(h) ORDER BY (h.created_at) DESC), '[]'::jsonb) INTO _history
  FROM (
    SELECT id, points, source_type, description_es, description_en, created_at
    FROM public.client_rewards_ledger WHERE client_id = _target
    ORDER BY created_at DESC LIMIT 10
  ) h;

  RETURN jsonb_build_object(
    'client_id', _target,
    'first_name', _client.first_name,
    'referral_slug', _client.referral_slug,
    'referral_slug_updated_at', _client.referral_slug_updated_at,
    'balance', _balance,
    'breakdown', jsonb_build_object('spending', _spending, 'matching_bonus', _bonus, 'adjustments', _adjustments),
    'referrals_count', _referrals_count,
    'next_benefit', CASE WHEN _next_benefit IS NULL THEN NULL ELSE
      jsonb_build_object(
        'id', _next_benefit.id,
        'title_es', _next_benefit.title_es,
        'title_en', _next_benefit.title_en,
        'required_points', _next_benefit.required_points,
        'icon', _next_benefit.icon,
        'progress_pct', LEAST(100, (_balance::numeric / _next_benefit.required_points * 100))::int,
        'points_remaining', GREATEST(0, _next_benefit.required_points - _balance)
      ) END,
    'benefits', _benefits,
    'history', _history
  );
END $$;

-- 13. BACKFILL (inline, no permission gate)
DO $$
DECLARE
  _row record; _owner_id uuid; _client record;
BEGIN
  -- Ensure referral_owners exist for clients that already appear as referrers
  FOR _row IN SELECT DISTINCT referrer_id FROM public.referral_attributions
              WHERE referrer_type = 'client' AND referrer_id IS NOT NULL
  LOOP
    SELECT id INTO _owner_id FROM public.referral_owners
      WHERE owner_type = 'client' AND owner_profile_id = _row.referrer_id LIMIT 1;
    IF _owner_id IS NULL THEN
      SELECT id, first_name, last_name, referral_slug INTO _client FROM public.clients WHERE id = _row.referrer_id;
      IF _client IS NOT NULL THEN
        INSERT INTO public.referral_owners (owner_type, owner_profile_id, display_name, slug, active)
        VALUES ('client', _row.referrer_id,
          trim(coalesce(_client.first_name,'') || ' ' || coalesce(_client.last_name,'')),
          _client.referral_slug, true);
      END IF;
    END IF;
  END LOOP;

  -- Migrate historical attributions
  FOR _row IN
    SELECT DISTINCT ON (referred_client_id)
      referred_client_id, referrer_type, referrer_id, converted_at
    FROM public.referral_attributions
    WHERE referred_client_id IS NOT NULL
    ORDER BY referred_client_id, converted_at ASC
  LOOP
    IF EXISTS (SELECT 1 FROM public.client_referral_attributions WHERE client_id = _row.referred_client_id) THEN
      CONTINUE;
    END IF;
    SELECT id INTO _owner_id FROM public.referral_owners
      WHERE owner_type = _row.referrer_type AND owner_profile_id = _row.referrer_id LIMIT 1;
    IF _owner_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.client_referral_attributions
      (client_id, current_referral_owner_id, original_referral_owner_id, attribution_status, created_at)
    VALUES (_row.referred_client_id, _owner_id, _owner_id, 'active', _row.converted_at)
    ON CONFLICT (client_id) DO NOTHING;
  END LOOP;
END $$;

-- 14. SEED rewards_benefits
INSERT INTO public.rewards_benefits (title_es, title_en, description_es, description_en, required_points, icon, sort_order) VALUES
  ('Recorte clásico gratis', 'Free classic cut', 'Canjea tus puntos por un recorte clásico completo.', 'Redeem your points for a complete classic cut.', 150, 'scissors', 10),
  ('20% en productos', '20% off products', 'Descuento en cualquier producto de la tienda.', 'Discount on any shop product.', 75, 'shopping-bag', 20),
  ('Diseño de barba gratis', 'Free beard design', 'Diseño profesional de barba sin costo.', 'Professional beard design free of charge.', 100, 'user', 30),
  ('Recorte premium', 'Premium cut', 'Recorte premium con todos los extras incluidos.', 'Premium cut with all extras included.', 250, 'crown', 40),
  ('Producto premium gratis', 'Free premium product', 'Llévate un producto premium de cortesía.', 'Take a premium product on the house.', 200, 'gift', 50),
  ('Experiencia VIP completa', 'Full VIP experience', 'Experiencia completa con servicios premium.', 'Full experience with premium services.', 500, 'star', 60);
