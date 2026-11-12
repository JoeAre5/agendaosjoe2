-- 1) Approval tracking columns on transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS approved_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS approved_by_name text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS allocation_method text;

CREATE INDEX IF NOT EXISTS idx_transactions_status_pending_review
  ON public.transactions (status)
  WHERE status = 'pending_review';

-- 2) RLS: barbers must see ALL pending_review transactions (not just their own)
DROP POLICY IF EXISTS "Barber read pending_review transactions" ON public.transactions;
CREATE POLICY "Barber read pending_review transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (is_barber() AND status = 'pending_review');

-- 3) RLS: barbers must be able to update pending_review (allocate + reassign barber_id)
DROP POLICY IF EXISTS "Barber update pending_review transactions" ON public.transactions;
CREATE POLICY "Barber update pending_review transactions"
ON public.transactions
FOR UPDATE
TO authenticated
USING (is_barber() AND status = 'pending_review')
WITH CHECK (is_barber());

-- 4) RLS: barbers must be able to insert transaction_items when allocating
--     (existing policy already allows this — no change needed)

-- 5) Realtime: ensure transactions table emits full row payloads
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
END $$;