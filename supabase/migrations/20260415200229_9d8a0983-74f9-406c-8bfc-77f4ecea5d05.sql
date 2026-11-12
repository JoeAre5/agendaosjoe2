
-- =============================================
-- 1. referrals
-- =============================================
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  referred_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  referred_phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reward_granted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access referrals"
  ON public.referrals FOR ALL
  TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "Client read own referrals"
  ON public.referrals FOR SELECT
  TO authenticated
  USING (
    public.is_client() AND referrer_client_id = public.get_my_client_id()
  );

CREATE POLICY "Client insert own referrals"
  ON public.referrals FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_client() AND referrer_client_id = public.get_my_client_id()
  );

-- =============================================
-- 2. reviews
-- =============================================
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  barber_id uuid NOT NULL REFERENCES public.barbers(id) ON DELETE CASCADE,
  rating smallint NOT NULL,
  comment text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access reviews"
  ON public.reviews FOR ALL
  TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "Client insert own reviews"
  ON public.reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_client() AND client_id = public.get_my_client_id()
  );

CREATE POLICY "Client read own reviews"
  ON public.reviews FOR SELECT
  TO authenticated
  USING (
    public.is_client() AND client_id = public.get_my_client_id()
  );

CREATE POLICY "Anon read published reviews"
  ON public.reviews FOR SELECT
  TO anon
  USING (is_published = true);

CREATE POLICY "Authenticated read published reviews"
  ON public.reviews FOR SELECT
  TO authenticated
  USING (is_published = true);

-- Rating validation trigger (1-5)
CREATE OR REPLACE FUNCTION public.validate_review_rating()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = 'public'
AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5, got %', NEW.rating;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_review_rating_trigger
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_review_rating();

CREATE INDEX idx_referrals_referrer ON public.referrals (referrer_client_id);
CREATE INDEX idx_reviews_barber ON public.reviews (barber_id);
CREATE INDEX idx_reviews_published ON public.reviews (is_published) WHERE is_published = true;
