INSERT INTO public.referral_payments
  (client_id, appointment_id, transaction_id, referral_owner_id, amount_cents, payment_type, is_tip, source, paid_at)
SELECT t.client_id, t.appointment_id, t.id, cra.current_referral_owner_id,
       COALESCE(t.subtotal_cents, 0),
       CASE WHEN t.type='product' THEN 'product' ELSE 'partial' END,
       false, t.source, COALESCE(t.approved_at, t.created_at)
FROM public.transactions t
JOIN public.client_referral_attributions cra ON cra.client_id = t.client_id
WHERE t.status = 'completed'
ON CONFLICT DO NOTHING;

UPDATE public.client_referral_attributions cra
SET last_payment_at = sub.max_paid
FROM (
  SELECT client_id, MAX(paid_at) AS max_paid
  FROM public.referral_payments
  GROUP BY client_id
) sub
WHERE cra.client_id = sub.client_id
  AND (cra.last_payment_at IS NULL OR cra.last_payment_at < sub.max_paid);