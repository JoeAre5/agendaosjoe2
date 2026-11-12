ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'pos';
CREATE INDEX IF NOT EXISTS idx_transactions_source ON public.transactions(source);