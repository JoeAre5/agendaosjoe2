BEGIN;

-- ============================================================
-- 1. STUCK TRANSACTIONS CLEANUP
-- ============================================================
UPDATE public.transactions
SET status = 'failed',
    notes = COALESCE(notes || ' | ', '') || 'Retroactive cleanup: abandoned ATH SDK test transaction'
WHERE id IN (
  'f6cc59b0-0000-0000-0000-000000000000'::uuid, -- placeholder, real IDs below
  '00000000-0000-0000-0000-000000000000'::uuid
);

-- Real cleanup using prefix match (safer than relying on truncated IDs above)
UPDATE public.transactions
SET status = 'failed',
    notes = COALESCE(notes, '') || ' | Retroactive cleanup: abandoned ATH SDK test transaction'
WHERE status = 'pending'
  AND payment_method = 'ath_movil'
  AND (id::text LIKE 'f6cc59b0%'
    OR id::text LIKE 'f285008b%'
    OR id::text LIKE '8e770bde%'
    OR id::text LIKE '0fff2404%');

-- ============================================================
-- 2. CATEGORY NORMALIZATION
-- ============================================================
UPDATE public.products
SET category = 'Peinados'
WHERE category = 'Peinado';

-- ============================================================
-- 3.1 CREATE pos_payment_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pos_payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  barber_id uuid REFERENCES public.barbers(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by_user_id uuid,
  payment_method text NOT NULL,
  subtotal_cents integer NOT NULL,
  tip_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL,
  ath_ecommerce_id text,
  ath_reference_number text,
  status text NOT NULL DEFAULT 'pending',
  failure_reason text,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
  committed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_status ON public.pos_payment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_appointment ON public.pos_payment_sessions(appointment_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_ath_ecommerce ON public.pos_payment_sessions(ath_ecommerce_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_created_at ON public.pos_payment_sessions(created_at DESC);

ALTER TABLE public.pos_payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access pos_sessions"
  ON public.pos_payment_sessions
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "Barber read own pos_sessions"
  ON public.pos_payment_sessions
  FOR SELECT TO authenticated
  USING (
    public.is_barber()
    AND (
      barber_id = (SELECT profiles.barber_id FROM public.profiles WHERE profiles.id = auth.uid())
      OR created_by_user_id = auth.uid()
    )
  );

CREATE POLICY "Barber insert pos_sessions"
  ON public.pos_payment_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_barber() AND created_by_user_id = auth.uid());

CREATE POLICY "Barber update own pos_sessions"
  ON public.pos_payment_sessions
  FOR UPDATE TO authenticated
  USING (public.is_barber() AND created_by_user_id = auth.uid())
  WITH CHECK (public.is_barber());

CREATE POLICY "Service role full access pos_sessions"
  ON public.pos_payment_sessions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3.2 transactions.barber_id → nullable
-- ============================================================
ALTER TABLE public.transactions
  ALTER COLUMN barber_id DROP NOT NULL;

-- ============================================================
-- 3.3 commission_barber_id on transactions
-- ============================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS commission_barber_id uuid REFERENCES public.barbers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_commission_barber ON public.transactions(commission_barber_id);

COMMENT ON COLUMN public.transactions.commission_barber_id IS
  'Barber earning the commission for this sale. May differ from barber_id (who rang the sale). NULL = no commission attribution.';

-- Backfill: existing transactions earn commission for the same barber that rang them
UPDATE public.transactions
SET commission_barber_id = barber_id
WHERE commission_barber_id IS NULL AND barber_id IS NOT NULL;

-- ============================================================
-- 3.4 product_commission_rate on barbers
-- ============================================================
ALTER TABLE public.barbers
  ADD COLUMN IF NOT EXISTS product_commission_rate numeric(5,4);

COMMENT ON COLUMN public.barbers.product_commission_rate IS
  'Commission rate (0.0–1.0) earned on product sales. NULL = falls back to product.commission_rate.';

-- ============================================================
-- 3.5 ath_reference_number + is_manual_entry on transactions
-- ============================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS ath_reference_number text,
  ADD COLUMN IF NOT EXISTS is_manual_entry boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_ath_reference ON public.transactions(ath_reference_number)
  WHERE ath_reference_number IS NOT NULL;

COMMENT ON COLUMN public.transactions.ath_reference_number IS
  'Customer-visible ATH Móvil reference number (from REST API or manual entry).';
COMMENT ON COLUMN public.transactions.is_manual_entry IS
  'True when an admin manually recorded a payment (e.g. typed in an ATH receipt) instead of it flowing through a payment gateway.';

-- ============================================================
-- 3.6 is_sellable generated column on products
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_sellable boolean
  GENERATED ALWAYS AS (is_active AND show_in_checkout AND stock_count > 0) STORED;

CREATE INDEX IF NOT EXISTS idx_products_is_sellable ON public.products(is_sellable)
  WHERE is_sellable = true;

COMMENT ON COLUMN public.products.is_sellable IS
  'Computed: true when product is active, visible in checkout, and has stock. Use this to filter the POS product picker.';

COMMIT;