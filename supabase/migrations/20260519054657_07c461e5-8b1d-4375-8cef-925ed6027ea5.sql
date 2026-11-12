
-- ============================================================
-- SISTEMAS DE REFERIDOS — Schema
-- ============================================================

-- 1. referral_systems
CREATE TABLE public.referral_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_es text NOT NULL,
  name_en text NOT NULL,
  description_es text,
  description_en text,
  status text NOT NULL DEFAULT 'coming_soon' CHECK (status IN ('active','coming_soon','disabled')),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. referral_owners
CREATE TABLE public.referral_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('shop','barber','client','representative')),
  owner_profile_id uuid,  -- references barbers.id / clients.id (no FK to allow soft delete)
  display_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  reroute_to_owner_id uuid REFERENCES public.referral_owners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ref_owners_profile ON public.referral_owners(owner_type, owner_profile_id);
CREATE INDEX idx_ref_owners_active ON public.referral_owners(active) WHERE active = true;

-- 3. referral_links
CREATE TABLE public.referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_owner_id uuid NOT NULL REFERENCES public.referral_owners(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  full_url text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ref_links_owner ON public.referral_links(referral_owner_id);

-- 4. client_referral_attributions
CREATE TABLE public.client_referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  current_referral_owner_id uuid NOT NULL REFERENCES public.referral_owners(id) ON DELETE RESTRICT,
  original_referral_owner_id uuid NOT NULL REFERENCES public.referral_owners(id) ON DELETE RESTRICT,
  original_referral_link_id uuid REFERENCES public.referral_links(id) ON DELETE SET NULL,
  attribution_status text NOT NULL DEFAULT 'active'
    CHECK (attribution_status IN ('active','reset_available','reallocated','shop_fallback')),
  last_payment_at timestamptz,
  reset_available_at timestamptz,
  reallocated_at timestamptz,
  reallocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);
CREATE INDEX idx_cra_current_owner ON public.client_referral_attributions(current_referral_owner_id);
CREATE INDEX idx_cra_status ON public.client_referral_attributions(attribution_status);
CREATE INDEX idx_cra_last_payment ON public.client_referral_attributions(last_payment_at);

-- 5. referral_payments
CREATE TABLE public.referral_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  referral_owner_id uuid NOT NULL REFERENCES public.referral_owners(id) ON DELETE RESTRICT,
  amount_cents int NOT NULL,           -- negative for refunds
  payment_type text NOT NULL CHECK (payment_type IN ('deposit','partial','full_balance','product','refund')),
  is_tip boolean NOT NULL DEFAULT false,
  is_refund boolean NOT NULL DEFAULT false,
  source text,                         -- 'pos' | 'online' | etc
  paid_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ref_pay_owner_paid ON public.referral_payments(referral_owner_id, paid_at DESC);
CREATE INDEX idx_ref_pay_client ON public.referral_payments(client_id);
CREATE INDEX idx_ref_pay_tx ON public.referral_payments(transaction_id);

-- 6. referral_ranks
CREATE TABLE public.referral_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order int NOT NULL,
  name_es text NOT NULL,
  name_en text NOT NULL,
  min_production_cents int NOT NULL,
  max_production_cents int,  -- NULL = no cap
  benefits_es text,
  benefits_en text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. referral_activity_log
CREATE TABLE public.referral_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  referral_owner_id uuid REFERENCES public.referral_owners(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ref_log_owner ON public.referral_activity_log(referral_owner_id, created_at DESC);
CREATE INDEX idx_ref_log_client ON public.referral_activity_log(client_id, created_at DESC);

-- 8. referral_reallocation_progress (tracks consecutive paid bookings with another barber)
CREATE TABLE public.referral_reallocation_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  consecutive_count int NOT NULL DEFAULT 0,
  last_paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)  -- one active "streak" per client
);

-- ============================================================
-- shop_settings flag
-- ============================================================
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS barber_leaderboard_enabled boolean NOT NULL DEFAULT false;

-- ============================================================
-- Updated-at triggers
-- ============================================================
CREATE TRIGGER trg_referral_systems_updated BEFORE UPDATE ON public.referral_systems
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_referral_owners_updated BEFORE UPDATE ON public.referral_owners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_referral_links_updated BEFORE UPDATE ON public.referral_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cra_updated BEFORE UPDATE ON public.client_referral_attributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_referral_ranks_updated BEFORE UPDATE ON public.referral_ranks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.referral_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_reallocation_progress ENABLE ROW LEVEL SECURITY;

-- referral_systems: public read, owner write
CREATE POLICY "ref_systems read all" ON public.referral_systems FOR SELECT
  TO authenticated, anon USING (true);
CREATE POLICY "ref_systems owner write" ON public.referral_systems FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY "ref_systems service" ON public.referral_systems FOR ALL TO service_role USING (true) WITH CHECK (true);

-- referral_owners: public read active, owner full
CREATE POLICY "ref_owners read active" ON public.referral_owners FOR SELECT
  TO authenticated, anon USING (active = true);
CREATE POLICY "ref_owners owner full" ON public.referral_owners FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY "ref_owners service" ON public.referral_owners FOR ALL TO service_role USING (true) WITH CHECK (true);

-- referral_links: public read active, owner full
CREATE POLICY "ref_links read active" ON public.referral_links FOR SELECT
  TO authenticated, anon USING (status = 'active');
CREATE POLICY "ref_links owner full" ON public.referral_links FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY "ref_links service" ON public.referral_links FOR ALL TO service_role USING (true) WITH CHECK (true);

-- client_referral_attributions: owner all; barber reads own; client reads self
CREATE POLICY "cra owner full" ON public.client_referral_attributions FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY "cra barber read own" ON public.client_referral_attributions FOR SELECT
  TO authenticated USING (
    public.is_barber() AND current_referral_owner_id IN (
      SELECT id FROM public.referral_owners
      WHERE owner_type = 'barber'
        AND owner_profile_id = (SELECT barber_id FROM public.profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "cra client read self" ON public.client_referral_attributions FOR SELECT
  TO authenticated USING (public.is_client() AND client_id = public.get_my_client_id());
CREATE POLICY "cra service" ON public.client_referral_attributions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- referral_payments: owner all, barber reads own
CREATE POLICY "ref_pay owner full" ON public.referral_payments FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY "ref_pay barber read own" ON public.referral_payments FOR SELECT
  TO authenticated USING (
    public.is_barber() AND referral_owner_id IN (
      SELECT id FROM public.referral_owners
      WHERE owner_type = 'barber'
        AND owner_profile_id = (SELECT barber_id FROM public.profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "ref_pay service" ON public.referral_payments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- referral_ranks: read all, owner write
CREATE POLICY "ref_ranks read all" ON public.referral_ranks FOR SELECT
  TO authenticated, anon USING (true);
CREATE POLICY "ref_ranks owner write" ON public.referral_ranks FOR ALL
  TO authenticated USING (public.is_owner()) WITH CHECK (public.is_owner());
CREATE POLICY "ref_ranks service" ON public.referral_ranks FOR ALL TO service_role USING (true) WITH CHECK (true);

-- referral_activity_log: owner read all, barber reads own
CREATE POLICY "ref_log owner read" ON public.referral_activity_log FOR SELECT
  TO authenticated USING (public.is_owner());
CREATE POLICY "ref_log barber read own" ON public.referral_activity_log FOR SELECT
  TO authenticated USING (
    public.is_barber() AND referral_owner_id IN (
      SELECT id FROM public.referral_owners
      WHERE owner_type = 'barber'
        AND owner_profile_id = (SELECT barber_id FROM public.profiles WHERE id = auth.uid())
    )
  );
CREATE POLICY "ref_log service" ON public.referral_activity_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- reallocation progress: service-managed, owner read
CREATE POLICY "rp owner read" ON public.referral_reallocation_progress FOR SELECT
  TO authenticated USING (public.is_owner());
CREATE POLICY "rp service" ON public.referral_reallocation_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Seed: systems
-- ============================================================
INSERT INTO public.referral_systems (slug, name_es, name_en, description_es, description_en, status, sort_order) VALUES
('barber_to_client', 'Barbero a Cliente', 'Barber to Client',
  'Referidos internos enviados por barberos o por la barbería hacia clientes.',
  'Internal referrals sent by barbers or the shop to clients.', 'active', 1),
('client_to_client', 'Cliente a Cliente', 'Client to Client',
  'Clientes refiriendo nuevos clientes. Esta etapa se activará más adelante.',
  'Clients referring new clients. This stage will be enabled later.', 'coming_soon', 2),
('representative_to_professional', 'Representante a Profesional', 'Representative to Professional',
  'Representantes refiriendo barberos, artistas SMP u otros profesionales.',
  'Representatives referring barbers, SMP artists or other professionals.', 'coming_soon', 3);

-- ============================================================
-- Seed: ranks
-- ============================================================
INSERT INTO public.referral_ranks (sort_order, name_es, name_en, min_production_cents, max_production_cents) VALUES
(1, 'Novato',          'Rookie',          0,        49999),
(2, 'Conector',        'Builder',         50000,    99999),
(3, 'Promotor',        'Connector',       100000,   199999),
(4, 'Productor',       'Producer',        200000,   349999),
(5, 'Embajador',       'Rainmaker',       350000,   499999),
(6, 'Referidor Élite', 'Elite Referrer',  500000,   749999),
(7, 'Aliado Legacy',   'Legacy Partner',  750000,   NULL);

-- ============================================================
-- Seed: owners (Shop, Charlie, Joseph, Héctor) + links
-- ============================================================
DO $$
DECLARE
  shop_id uuid;
  charlie_id uuid;
  joseph_id uuid;
  hector_id uuid;
  charlie_barber_id uuid;
  joseph_barber_id uuid;
  hector_barber_id uuid;
BEGIN
  SELECT id INTO charlie_barber_id FROM public.barbers WHERE lower(name) LIKE 'charlie%' LIMIT 1;
  SELECT id INTO joseph_barber_id  FROM public.barbers WHERE lower(name) LIKE 'joseph%'  LIMIT 1;
  SELECT id INTO hector_barber_id  FROM public.barbers WHERE lower(name) LIKE 'h%ctor%' OR lower(name) LIKE 'hector%' LIMIT 1;

  INSERT INTO public.referral_owners (owner_type, display_name, slug, active)
  VALUES ('shop', 'Charlie''s Barbershop', 'shop', true)
  RETURNING id INTO shop_id;

  INSERT INTO public.referral_owners (owner_type, owner_profile_id, display_name, slug, active, reroute_to_owner_id)
  VALUES ('barber', charlie_barber_id, 'Charlie', 'charlie', true, shop_id)
  RETURNING id INTO charlie_id;

  INSERT INTO public.referral_owners (owner_type, owner_profile_id, display_name, slug, active, reroute_to_owner_id)
  VALUES ('barber', joseph_barber_id, 'Joseph', 'joseph', true, shop_id)
  RETURNING id INTO joseph_id;

  INSERT INTO public.referral_owners (owner_type, owner_profile_id, display_name, slug, active, reroute_to_owner_id)
  VALUES ('barber', hector_barber_id, 'Héctor', 'hector', true, shop_id)
  RETURNING id INTO hector_id;

  INSERT INTO public.referral_links (referral_owner_id, slug, full_url) VALUES
    (shop_id,    'shop',    'https://charliesbarbershop.co/r/shop'),
    (charlie_id, 'charlie', 'https://charliesbarbershop.co/r/charlie'),
    (joseph_id,  'joseph',  'https://charliesbarbershop.co/r/joseph'),
    (hector_id,  'hector',  'https://charliesbarbershop.co/r/hector');
END $$;

-- ============================================================
-- Helper: resolve a slug to the effective owner (follows reroute)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_referral_slug(_slug text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _link_owner uuid;
  _owner record;
  _reroute uuid;
  _shop_id uuid;
  _hops int := 0;
BEGIN
  IF _slug IS NULL OR length(trim(_slug)) = 0 THEN RETURN NULL; END IF;

  SELECT referral_owner_id INTO _link_owner
  FROM public.referral_links
  WHERE lower(slug) = lower(trim(_slug)) AND status = 'active'
  LIMIT 1;

  IF _link_owner IS NULL THEN
    SELECT id INTO _shop_id FROM public.referral_owners WHERE owner_type='shop' LIMIT 1;
    RETURN _shop_id;
  END IF;

  -- Follow reroute chain (max 5 hops)
  LOOP
    SELECT * INTO _owner FROM public.referral_owners WHERE id = _link_owner;
    EXIT WHEN _owner.active = true OR _owner.reroute_to_owner_id IS NULL OR _hops >= 5;
    _link_owner := _owner.reroute_to_owner_id;
    _hops := _hops + 1;
  END LOOP;

  IF NOT _owner.active THEN
    SELECT id INTO _shop_id FROM public.referral_owners WHERE owner_type='shop' LIMIT 1;
    RETURN _shop_id;
  END IF;

  RETURN _link_owner;
END $$;

-- ============================================================
-- Trigger: when transaction reaches "completed", record referral payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_referral_payment_from_tx()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _cra record;
  _service_cents int;
  _tip_cents int;
  _gross int;
  _payment_type text;
  _paid_at timestamptz;
  _client_id uuid;
  _owner_id uuid;
  _streak record;
  _new_count int;
  _appt record;
BEGIN
  -- Only act when status transitions to completed
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' AND NEW.status = 'completed' THEN RETURN NEW; END IF;

  _client_id := NEW.client_id;
  IF _client_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _cra FROM public.client_referral_attributions WHERE client_id = _client_id;
  IF _cra IS NULL THEN RETURN NEW; END IF;
  _owner_id := _cra.current_referral_owner_id;

  _paid_at := COALESCE(NEW.approved_at, NEW.created_at);
  _service_cents := COALESCE(NEW.subtotal_cents, 0);  -- excludes tip per schema
  _tip_cents := COALESCE(NEW.tip_cents, 0);

  -- Determine payment type
  IF NEW.type = 'product' THEN
    _payment_type := 'product';
  ELSIF NEW.appointment_id IS NOT NULL THEN
    SELECT * INTO _appt FROM public.appointments WHERE id = NEW.appointment_id;
    IF _appt.deposit_amount_cents IS NOT NULL AND _service_cents = _appt.deposit_amount_cents THEN
      _payment_type := 'deposit';
    ELSIF _appt.amount_paid_cents IS NOT NULL AND _appt.price_cents IS NOT NULL
          AND (_appt.amount_paid_cents + _service_cents) >= _appt.price_cents THEN
      _payment_type := 'full_balance';
    ELSE
      _payment_type := 'partial';
    END IF;
  ELSE
    _payment_type := 'partial';
  END IF;

  -- Insert payment row (idempotent on transaction_id+payment_type)
  INSERT INTO public.referral_payments
    (client_id, appointment_id, transaction_id, referral_owner_id, amount_cents, payment_type, is_tip, source, paid_at)
  VALUES
    (_client_id, NEW.appointment_id, NEW.id, _owner_id, _service_cents, _payment_type, false, NEW.source, _paid_at)
  ON CONFLICT DO NOTHING;

  -- Activity log
  INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description, metadata)
  VALUES (_client_id, _owner_id, 'payment_recorded',
    format('%s cents recorded (%s)', _service_cents, _payment_type),
    jsonb_build_object('tx_id', NEW.id, 'amount_cents', _service_cents, 'type', _payment_type));

  -- Update last_payment_at on attribution
  UPDATE public.client_referral_attributions
    SET last_payment_at = _paid_at,
        reset_available_at = NULL,
        attribution_status = CASE WHEN attribution_status = 'reset_available' THEN 'active' ELSE attribution_status END
    WHERE client_id = _client_id;

  -- 5-consecutive-paid-booking reallocation logic (only for service payments tied to an appt)
  IF NEW.appointment_id IS NOT NULL AND NEW.barber_id IS NOT NULL AND NEW.type <> 'product' THEN
    -- Find current owner's barber profile id (if any)
    DECLARE owner_barber_id uuid;
    BEGIN
      SELECT owner_profile_id INTO owner_barber_id FROM public.referral_owners WHERE id = _owner_id AND owner_type='barber';

      IF owner_barber_id IS DISTINCT FROM NEW.barber_id THEN
        -- Different barber: bump streak (reset if last streak was with another barber)
        SELECT * INTO _streak FROM public.referral_reallocation_progress WHERE client_id = _client_id;
        IF _streak IS NULL THEN
          INSERT INTO public.referral_reallocation_progress (client_id, barber_id, consecutive_count, last_paid_at)
          VALUES (_client_id, NEW.barber_id, 1, _paid_at);
          _new_count := 1;
        ELSIF _streak.barber_id = NEW.barber_id THEN
          UPDATE public.referral_reallocation_progress
            SET consecutive_count = consecutive_count + 1, last_paid_at = _paid_at, updated_at = now()
            WHERE client_id = _client_id
            RETURNING consecutive_count INTO _new_count;
        ELSE
          UPDATE public.referral_reallocation_progress
            SET barber_id = NEW.barber_id, consecutive_count = 1, last_paid_at = _paid_at, updated_at = now()
            WHERE client_id = _client_id
            RETURNING consecutive_count INTO _new_count;
        END IF;

        IF _new_count >= 5 THEN
          -- Reallocate to the new barber's owner
          DECLARE new_owner uuid;
          BEGIN
            SELECT id INTO new_owner FROM public.referral_owners
              WHERE owner_type='barber' AND owner_profile_id = NEW.barber_id AND active = true LIMIT 1;
            IF new_owner IS NOT NULL THEN
              UPDATE public.client_referral_attributions
                SET current_referral_owner_id = new_owner,
                    attribution_status = 'reallocated',
                    reallocated_at = now(),
                    reallocation_reason = '5_paid_consecutive_bookings'
                WHERE client_id = _client_id;

              INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description, metadata)
              VALUES (_client_id, new_owner, 'reallocated_after_5_paid_bookings',
                'Atribución reasignada por 5 reservas consecutivas pagadas',
                jsonb_build_object('previous_owner_id', _owner_id, 'new_barber_id', NEW.barber_id));

              -- Reset streak
              DELETE FROM public.referral_reallocation_progress WHERE client_id = _client_id;
            END IF;
          END;
        END IF;
      ELSE
        -- Paid with the originally attributed barber → reset streak
        DELETE FROM public.referral_reallocation_progress WHERE client_id = _client_id;
      END IF;
    END;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_record_referral_payment
  AFTER INSERT OR UPDATE OF status ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.record_referral_payment_from_tx();

-- ============================================================
-- Trigger: when transaction is refunded, record negative referral_payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_referral_refund_from_tx()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _cra record;
  _refund_cents int;
  _paid_at timestamptz;
BEGIN
  IF NEW.refunded_at IS NULL OR (OLD.refunded_at IS NOT NULL AND OLD.refunded_at = NEW.refunded_at) THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _cra FROM public.client_referral_attributions WHERE client_id = NEW.client_id;
  IF _cra IS NULL THEN RETURN NEW; END IF;

  _refund_cents := COALESCE(NEW.refund_amount_cents, NEW.subtotal_cents, 0);
  _paid_at := NEW.refunded_at;

  INSERT INTO public.referral_payments
    (client_id, appointment_id, transaction_id, referral_owner_id, amount_cents, payment_type, is_refund, source, paid_at)
  VALUES
    (NEW.client_id, NEW.appointment_id, NEW.id, _cra.current_referral_owner_id, -_refund_cents, 'refund', true, NEW.source, _paid_at);

  INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description, metadata)
  VALUES (NEW.client_id, _cra.current_referral_owner_id, 'refund_applied',
    format('Refund of %s cents applied', _refund_cents),
    jsonb_build_object('tx_id', NEW.id, 'refund_cents', _refund_cents));

  RETURN NEW;
END $$;

CREATE TRIGGER trg_record_referral_refund
  AFTER UPDATE OF refunded_at ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.record_referral_refund_from_tx();

-- ============================================================
-- RPC: assign attribution to a client (used by booking flow)
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_client_referral(
  _client_id uuid,
  _slug text,
  _link_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _owner_id uuid;
  _existing record;
  _link_id_resolved uuid;
BEGIN
  IF _client_id IS NULL OR _slug IS NULL THEN RETURN NULL; END IF;
  _owner_id := public.resolve_referral_slug(_slug);
  IF _owner_id IS NULL THEN RETURN NULL; END IF;

  IF _link_id IS NULL THEN
    SELECT id INTO _link_id_resolved FROM public.referral_links WHERE lower(slug)=lower(trim(_slug)) LIMIT 1;
  ELSE
    _link_id_resolved := _link_id;
  END IF;

  SELECT * INTO _existing FROM public.client_referral_attributions WHERE client_id = _client_id;

  IF _existing IS NULL THEN
    INSERT INTO public.client_referral_attributions
      (client_id, current_referral_owner_id, original_referral_owner_id, original_referral_link_id, attribution_status)
    VALUES (_client_id, _owner_id, _owner_id, _link_id_resolved, 'active');

    INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
    VALUES (_client_id, _owner_id, 'initial_attribution', 'Initial attribution via link');
    RETURN _owner_id;
  END IF;

  -- If reset is available, allow re-attribution
  IF _existing.attribution_status = 'reset_available' THEN
    UPDATE public.client_referral_attributions
      SET current_referral_owner_id = _owner_id,
          original_referral_owner_id = _owner_id,
          original_referral_link_id = _link_id_resolved,
          attribution_status = 'active',
          reset_available_at = NULL,
          reallocated_at = NULL,
          reallocation_reason = NULL
      WHERE client_id = _client_id;

    INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
    VALUES (_client_id, _owner_id, 'reattributed_after_reset', 'Re-attribution via link after 90-day reset');
    RETURN _owner_id;
  END IF;

  -- Otherwise keep existing attribution
  RETURN _existing.current_referral_owner_id;
END $$;

-- ============================================================
-- RPC: calculate production (weekly | monthly | custom) in PR tz
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_referral_production(
  _window text DEFAULT 'monthly',          -- 'weekly' | 'monthly' | 'custom'
  _start_at timestamptz DEFAULT NULL,
  _end_at timestamptz DEFAULT NULL
) RETURNS TABLE (
  referral_owner_id uuid,
  display_name text,
  owner_type text,
  slug text,
  production_cents bigint,
  payment_count bigint,
  refund_cents bigint,
  rank_name_es text,
  rank_name_en text,
  rank_sort_order int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _s timestamptz;
  _e timestamptz;
  _now_pr timestamp;  -- naive PR-local time
BEGIN
  -- Compute window in America/Puerto_Rico
  _now_pr := (now() AT TIME ZONE 'America/Puerto_Rico');

  IF _window = 'weekly' THEN
    -- Saturday 00:00 → Friday 23:59 PR. Find most recent Saturday (Sat=6 in pg).
    DECLARE dow int := EXTRACT(DOW FROM _now_pr)::int;
    DECLARE days_back int := (dow + 1) % 7;  -- Sat→0, Sun→1, Mon→2...
    BEGIN
      _s := ((date_trunc('day', _now_pr) - (days_back || ' days')::interval) AT TIME ZONE 'America/Puerto_Rico');
      _e := _s + interval '7 days' - interval '1 microsecond';
    END;
  ELSIF _window = 'monthly' THEN
    _s := (date_trunc('month', _now_pr) AT TIME ZONE 'America/Puerto_Rico');
    _e := ((date_trunc('month', _now_pr) + interval '1 month') AT TIME ZONE 'America/Puerto_Rico') - interval '1 microsecond';
  ELSE
    _s := COALESCE(_start_at, now() - interval '30 days');
    _e := COALESCE(_end_at, now());
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT o.id AS owner_id,
           o.display_name,
           o.owner_type,
           o.slug,
           COALESCE(SUM(CASE WHEN p.is_tip THEN 0 ELSE p.amount_cents END), 0)::bigint AS production_cents,
           COUNT(p.id) FILTER (WHERE NOT p.is_refund)::bigint AS payment_count,
           COALESCE(SUM(CASE WHEN p.is_refund THEN p.amount_cents ELSE 0 END), 0)::bigint AS refund_cents
    FROM public.referral_owners o
    LEFT JOIN public.referral_payments p
      ON p.referral_owner_id = o.id
     AND p.paid_at >= _s AND p.paid_at <= _e
     AND NOT p.is_tip
    WHERE o.active = true
    GROUP BY o.id
  )
  SELECT a.owner_id, a.display_name, a.owner_type, a.slug,
         a.production_cents, a.payment_count, a.refund_cents,
         r.name_es, r.name_en, r.sort_order
  FROM agg a
  LEFT JOIN LATERAL (
    SELECT name_es, name_en, sort_order
    FROM public.referral_ranks
    WHERE min_production_cents <= GREATEST(a.production_cents, 0)
      AND (max_production_cents IS NULL OR max_production_cents >= GREATEST(a.production_cents, 0))
    ORDER BY sort_order DESC LIMIT 1
  ) r ON true
  ORDER BY a.production_cents DESC;
END $$;

-- ============================================================
-- RPC: nightly reset check (called by cron via edge fn)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_referral_resets()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _count int;
BEGIN
  WITH upd AS (
    UPDATE public.client_referral_attributions
      SET attribution_status = 'reset_available',
          reset_available_at = now()
      WHERE attribution_status = 'active'
        AND last_payment_at IS NOT NULL
        AND last_payment_at < (now() - interval '90 days')
      RETURNING client_id, current_referral_owner_id
  )
  INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
  SELECT client_id, current_referral_owner_id, 'reset_available', '90+ days without payment'
  FROM upd;

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END $$;

-- ============================================================
-- RPC: soft-delete a barber owner and roll up clients to shop
-- ============================================================
CREATE OR REPLACE FUNCTION public.deactivate_referral_owner(_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _shop_id uuid;
  _rolled int := 0;
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT id INTO _shop_id FROM public.referral_owners WHERE owner_type='shop' LIMIT 1;
  IF _shop_id IS NULL OR _owner_id = _shop_id THEN
    RAISE EXCEPTION 'cannot deactivate shop owner';
  END IF;

  UPDATE public.referral_owners
    SET active = false, deleted_at = now(), reroute_to_owner_id = _shop_id
    WHERE id = _owner_id;

  WITH r AS (
    UPDATE public.client_referral_attributions
      SET current_referral_owner_id = _shop_id,
          attribution_status = 'shop_fallback'
      WHERE current_referral_owner_id = _owner_id
      RETURNING client_id
  )
  INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
  SELECT client_id, _shop_id, 'barber_deleted_shop_fallback', 'Owner deactivated; rolled up to shop' FROM r;
  GET DIAGNOSTICS _rolled = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'clients_rolled_to_shop', _rolled);
END $$;
