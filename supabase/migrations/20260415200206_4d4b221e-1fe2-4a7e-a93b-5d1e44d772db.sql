
-- =============================================
-- 1. loyalty_points
-- =============================================
CREATE TABLE public.loyalty_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'bronze',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id)
);

ALTER TABLE public.loyalty_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access loyalty_points"
  ON public.loyalty_points FOR ALL
  TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "Client read own loyalty_points"
  ON public.loyalty_points FOR SELECT
  TO authenticated
  USING (
    public.is_client() AND client_id = public.get_my_client_id()
  );

-- =============================================
-- 2. loyalty_transactions
-- =============================================
CREATE TABLE public.loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  points integer NOT NULL,
  reason text NOT NULL,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access loyalty_transactions"
  ON public.loyalty_transactions FOR ALL
  TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "Client read own loyalty_transactions"
  ON public.loyalty_transactions FOR SELECT
  TO authenticated
  USING (
    public.is_client() AND client_id = public.get_my_client_id()
  );

-- Auto-update loyalty_points.updated_at
CREATE TRIGGER update_loyalty_points_updated_at
  BEFORE UPDATE ON public.loyalty_points
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_loyalty_transactions_client ON public.loyalty_transactions (client_id);
