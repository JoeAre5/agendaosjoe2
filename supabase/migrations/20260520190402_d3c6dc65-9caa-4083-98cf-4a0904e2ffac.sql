DELETE FROM public.client_rewards_ledger l
USING public.transactions t
LEFT JOIN public.appointments a ON a.id = t.appointment_id
WHERE l.source_transaction_id = t.id
  AND (a.created_by_role IS DISTINCT FROM 'client_app');

DELETE FROM public.client_rewards_ledger l
USING public.appointments a
WHERE l.source_appointment_id = a.id
  AND l.source_transaction_id IS NULL
  AND (a.created_by_role IS DISTINCT FROM 'client_app');