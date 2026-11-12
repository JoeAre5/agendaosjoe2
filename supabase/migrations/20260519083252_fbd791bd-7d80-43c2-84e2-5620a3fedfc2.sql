
CREATE OR REPLACE FUNCTION public.get_push_subscribers()
RETURNS TABLE (
  subscription_id uuid,
  client_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  avatar_url text,
  endpoint text,
  user_agent text,
  language text,
  created_at timestamptz,
  last_used_at timestamptz,
  failure_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ps.id,
    c.id,
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    c.avatar_url,
    ps.endpoint,
    ps.user_agent,
    ps.language,
    ps.created_at,
    ps.last_used_at,
    ps.failure_count
  FROM public.push_subscriptions ps
  JOIN public.clients c ON c.id = ps.client_id
  WHERE public.is_owner() OR public.is_super_admin()
  ORDER BY ps.last_used_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_push_subscribers() TO authenticated;
