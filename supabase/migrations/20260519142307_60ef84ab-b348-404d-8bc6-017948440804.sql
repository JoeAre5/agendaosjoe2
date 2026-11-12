DELETE FROM public.push_subscriptions p
USING public.push_subscriptions q
WHERE p.client_id = q.client_id
  AND COALESCE(p.user_agent,'') = COALESCE(q.user_agent,'')
  AND p.created_at < q.created_at
  AND p.id <> q.id;