
-- Referral attribution system
-- Table 1: short codes per barber/client
CREATE TABLE public.referral_codes (
  code text PRIMARY KEY,
  owner_type text NOT NULL CHECK (owner_type IN ('barber', 'client')),
  owner_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id)
);

CREATE INDEX idx_referral_codes_owner ON public.referral_codes(owner_type, owner_id);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Public can read active codes (needed to resolve /r/:code)
CREATE POLICY "Public read active referral_codes"
  ON public.referral_codes FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Owner full access referral_codes"
  ON public.referral_codes FOR ALL
  TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "Service role full access referral_codes"
  ON public.referral_codes FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Table 2: append-only conversion log
CREATE TABLE public.referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text REFERENCES public.referral_codes(code) ON DELETE SET NULL,
  referrer_type text NOT NULL CHECK (referrer_type IN ('barber', 'client')),
  referrer_id uuid NOT NULL,
  referred_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  conversion_type text NOT NULL CHECK (conversion_type IN ('signup','waitlist','first_booking','pwa_install','push_enabled')),
  landing_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  user_agent text,
  ip_hash text,
  converted_at timestamp with time zone NOT NULL DEFAULT now(),
  -- prevent double-count of same conversion type per client per code
  UNIQUE (code, referred_client_id, conversion_type)
);

CREATE INDEX idx_ref_attr_referrer ON public.referral_attributions(referrer_type, referrer_id, converted_at DESC);
CREATE INDEX idx_ref_attr_client ON public.referral_attributions(referred_client_id);
CREATE INDEX idx_ref_attr_converted ON public.referral_attributions(converted_at DESC);

ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner read all referral_attributions"
  ON public.referral_attributions FOR SELECT
  TO authenticated
  USING (public.is_owner());

CREATE POLICY "Barber read own referral_attributions"
  ON public.referral_attributions FOR SELECT
  TO authenticated
  USING (
    public.is_barber()
    AND referrer_type = 'barber'
    AND referrer_id = (SELECT barber_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Client read own referral_attributions as referrer"
  ON public.referral_attributions FOR SELECT
  TO authenticated
  USING (
    public.is_client()
    AND referrer_type = 'client'
    AND referrer_id = public.get_my_client_id()
  );

CREATE POLICY "Service role full access referral_attributions"
  ON public.referral_attributions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- PWA install tracking (lightweight, public insert allowed)
CREATE TABLE public.pwa_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  session_id text,
  platform text,        -- 'ios' | 'android' | 'desktop' | 'unknown'
  display_mode text,    -- 'standalone' | 'browser'
  user_agent text,
  installed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_id, platform)
);

CREATE INDEX idx_pwa_installs_installed_at ON public.pwa_installs(installed_at DESC);

ALTER TABLE public.pwa_installs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert pwa_installs"
  ON public.pwa_installs FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Owner read pwa_installs"
  ON public.pwa_installs FOR SELECT
  TO authenticated
  USING (public.is_owner());

CREATE POLICY "Client read own pwa_installs"
  ON public.pwa_installs FOR SELECT
  TO authenticated
  USING (is_client() AND client_id = get_my_client_id());

-- RPC: record a conversion (called from client with auth context)
CREATE OR REPLACE FUNCTION public.record_referral_conversion(
  _code text,
  _conversion_type text,
  _client_id uuid DEFAULT NULL,
  _landing_url text DEFAULT NULL,
  _utm_source text DEFAULT NULL,
  _utm_medium text DEFAULT NULL,
  _utm_campaign text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rc record;
  _client_to_use uuid;
  _attr_id uuid;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO _rc FROM public.referral_codes
  WHERE lower(code) = lower(trim(_code)) AND is_active = true
  LIMIT 1;

  IF _rc IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve client: explicit param wins, fallback to current authed client
  _client_to_use := COALESCE(_client_id, public.get_my_client_id());

  IF _client_to_use IS NULL AND _conversion_type <> 'pwa_install' THEN
    -- Most conversions need a client to be meaningful
    RETURN NULL;
  END IF;

  -- Don't self-attribute (client referring themselves)
  IF _rc.owner_type = 'client' AND _rc.owner_id = _client_to_use THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.referral_attributions (
    code, referrer_type, referrer_id, referred_client_id, conversion_type,
    landing_url, utm_source, utm_medium, utm_campaign
  ) VALUES (
    _rc.code, _rc.owner_type, _rc.owner_id, _client_to_use, _conversion_type,
    _landing_url, _utm_source, _utm_medium, _utm_campaign
  )
  ON CONFLICT (code, referred_client_id, conversion_type) DO NOTHING
  RETURNING id INTO _attr_id;

  RETURN _attr_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_referral_conversion(text, text, uuid, text, text, text, text) TO anon, authenticated;

-- Seed: one code per active barber, slug = lowercased first name
INSERT INTO public.referral_codes (code, owner_type, owner_id)
SELECT
  lower(split_part(name, ' ', 1)) AS code,
  'barber'::text,
  id
FROM public.barbers
WHERE is_active = true
ON CONFLICT (owner_type, owner_id) DO NOTHING;

-- Aggregated view for the admin dashboard
CREATE OR REPLACE VIEW public.referral_leaderboard AS
SELECT
  rc.code,
  rc.owner_type,
  rc.owner_id,
  COUNT(*) FILTER (WHERE ra.conversion_type = 'signup') AS signups,
  COUNT(*) FILTER (WHERE ra.conversion_type = 'waitlist') AS waitlist_joins,
  COUNT(*) FILTER (WHERE ra.conversion_type = 'first_booking') AS first_bookings,
  COUNT(*) FILTER (WHERE ra.conversion_type = 'pwa_install') AS pwa_installs,
  COUNT(*) FILTER (WHERE ra.conversion_type = 'push_enabled') AS push_enabled,
  COUNT(DISTINCT ra.referred_client_id) AS unique_clients,
  COUNT(*) AS total_conversions,
  MAX(ra.converted_at) AS last_conversion_at
FROM public.referral_codes rc
LEFT JOIN public.referral_attributions ra ON ra.code = rc.code
GROUP BY rc.code, rc.owner_type, rc.owner_id;
