-- 1. Tabla de matches pendientes
CREATE TABLE public.referral_pending_matches (
  id uuid primary key default gen_random_uuid(),
  referrer_client_id uuid not null references public.clients(id) on delete cascade,
  referred_client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','granted','void')),
  points_amount integer,
  appointment_id uuid references public.appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  granted_at timestamptz,
  CONSTRAINT no_self_referral CHECK (referrer_client_id <> referred_client_id),
  CONSTRAINT one_match_per_referred UNIQUE (referred_client_id)
);

CREATE INDEX idx_rpm_referrer ON public.referral_pending_matches(referrer_client_id);
CREATE INDEX idx_rpm_status ON public.referral_pending_matches(status) WHERE status = 'pending';

GRANT SELECT ON public.referral_pending_matches TO authenticated;
GRANT ALL ON public.referral_pending_matches TO service_role;

ALTER TABLE public.referral_pending_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rpm owner full" ON public.referral_pending_matches
  FOR ALL TO authenticated
  USING (is_owner()) WITH CHECK (is_owner());

CREATE POLICY "rpm clients read involved" ON public.referral_pending_matches
  FOR SELECT TO authenticated
  USING (
    referrer_client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid())
    OR referred_client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid())
  );

-- 2. RPC: crear match desde el onboarding (definer)
CREATE OR REPLACE FUNCTION public.create_referral_pending_match(
  _referred_client_id uuid,
  _ref_slug text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _referrer_client_id uuid;
  _pm_id uuid;
  _referred_phone text;
  _referred_email text;
  _referrer_phone text;
  _referrer_email text;
BEGIN
  IF _referred_client_id IS NULL OR _ref_slug IS NULL OR length(trim(_ref_slug)) = 0 THEN
    RETURN NULL;
  END IF;

  -- Referidor por slug en clients (programa de referidos es entre clientes)
  SELECT id, normalize_phone(phone), normalize_email(email)
    INTO _referrer_client_id, _referrer_phone, _referrer_email
  FROM public.clients
  WHERE referral_slug = lower(trim(_ref_slug))
  LIMIT 1;

  IF _referrer_client_id IS NULL THEN
    RETURN NULL; -- slug de shop/barber/representative: no aplica matching points
  END IF;

  IF _referrer_client_id = _referred_client_id THEN
    RETURN NULL;
  END IF;

  -- Self-referral por overlap de email/teléfono
  SELECT normalize_phone(phone), normalize_email(email)
    INTO _referred_phone, _referred_email
  FROM public.clients
  WHERE id = _referred_client_id;

  IF _referrer_phone IS NOT NULL AND _referrer_phone = _referred_phone THEN
    RETURN NULL;
  END IF;
  IF _referrer_email IS NOT NULL AND _referrer_email = _referred_email THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.referral_pending_matches (referrer_client_id, referred_client_id)
  VALUES (_referrer_client_id, _referred_client_id)
  ON CONFLICT (referred_client_id) DO NOTHING
  RETURNING id INTO _pm_id;

  RETURN _pm_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_referral_pending_match(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_referral_pending_match(uuid, text) TO authenticated;

-- 3. Trigger: otorgar matching points en la PRIMERA cita completada del referido
CREATE OR REPLACE FUNCTION public.grant_referral_matching_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pm record;
  _is_first boolean;
  _points integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _pm
  FROM public.referral_pending_matches
  WHERE referred_client_id = NEW.client_id AND status = 'pending'
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE client_id = NEW.client_id AND status = 'completed' AND id <> NEW.id
  ) INTO _is_first;
  IF NOT _is_first THEN RETURN NEW; END IF;

  _points := GREATEST(0, COALESCE(NEW.price_cents, 0) - COALESCE(NEW.tip_cents, 0)) / 100;

  IF _points <= 0 THEN
    UPDATE public.referral_pending_matches
      SET status = 'void', granted_at = now(), appointment_id = NEW.id
      WHERE id = _pm.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.client_rewards_ledger
    (client_id, points, source_type, source_appointment_id, source_referral_client_id, description_es, description_en)
  VALUES
    (_pm.referred_client_id, _points, 'matching_bonus', NEW.id, _pm.referrer_client_id,
      'Bono por tu primera visita (programa de referidos)',
      'First-visit referral bonus'),
    (_pm.referrer_client_id, _points, 'matching_bonus', NEW.id, _pm.referred_client_id,
      'Bono por la primera visita de tu referido',
      'Matching bonus from your referral''s first visit');

  UPDATE public.referral_pending_matches
    SET status = 'granted', granted_at = now(), points_amount = _points, appointment_id = NEW.id
    WHERE id = _pm.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_referral_matching_points ON public.appointments;
CREATE TRIGGER trg_grant_referral_matching_points
AFTER INSERT OR UPDATE OF status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.grant_referral_matching_points();