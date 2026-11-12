
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS refund_status text,
  ADD COLUMN IF NOT EXISTS dispute_id text,
  ADD COLUMN IF NOT EXISTS refund_initiated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_transactions_dispute_id ON public.transactions(dispute_id) WHERE dispute_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_refund_reference ON public.transactions(refund_reference) WHERE refund_reference IS NOT NULL;

INSERT INTO public.admin_notification_rules (event_key, category, title_es, title_en, body_es, body_en, description_es, description_en, url_path, is_enabled)
VALUES (
  'admin_refund_requested',
  'pagos',
  'Reembolso solicitado ({{source}})',
  'Refund requested ({{source}})',
  '{{client}}: ${{amount}} ({{reason}}). Contactar antes de que se complete.',
  '{{client}}: ${{amount}} ({{reason}}). Contact before it completes.',
  'Avisa cuando un cliente inicia un reembolso o disputa en Stripe.',
  'Fires when a client initiates a Stripe refund or chargeback.',
  '/admin/sales?status=pending_review',
  true
)
ON CONFLICT (event_key) DO NOTHING;
