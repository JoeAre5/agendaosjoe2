-- 1. ATH wallet fields on clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ath_phone text,
  ADD COLUMN IF NOT EXISTS ath_phone_last4 text;

-- 2. Payment reference id on appointments (unified ref for support)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_reference_id text;

-- 3. Idempotency: prevent duplicate ATH webhook records
CREATE UNIQUE INDEX IF NOT EXISTS transactions_athmovil_unique
  ON public.transactions (athmovil_transaction_id)
  WHERE athmovil_transaction_id IS NOT NULL;

-- 4. Refund tracking
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_amount_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_reference text;

-- 5. Track who triggered cancellation (auto-refund only for client-driven)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancelled_by_role text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_status text; -- 'pending_undo' | 'refunded' | 'manual' | 'none'

-- 6. Index for refund queue lookup
CREATE INDEX IF NOT EXISTS appointments_refund_status_idx
  ON public.appointments (refund_status, cancelled_at)
  WHERE refund_status = 'pending_undo';