CREATE OR REPLACE FUNCTION public.find_duplicate_client_groups()
RETURNS TABLE(group_key text, match_type text, client_ids uuid[], client_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_owner() OR public.is_super_admin()) THEN
    RAISE EXCEPTION 'permission denied: owner required';
  END IF;

  RETURN QUERY
  WITH email_groups AS (
    SELECT public.normalize_email(email) AS k, 'email'::text AS mt, array_agg(id ORDER BY total_visits DESC NULLS LAST, created_at ASC) AS ids, count(*)::int AS n
    FROM public.clients
    WHERE public.normalize_email(email) IS NOT NULL
    GROUP BY public.normalize_email(email)
    HAVING count(*) >= 2
  ),
  phone_groups AS (
    SELECT public.normalize_phone(phone) AS k, 'phone'::text AS mt, array_agg(id ORDER BY total_visits DESC NULLS LAST, created_at ASC) AS ids, count(*)::int AS n
    FROM public.clients
    WHERE public.normalize_phone(phone) IS NOT NULL
    GROUP BY public.normalize_phone(phone)
    HAVING count(*) >= 2
  ),
  name_groups AS (
    SELECT lower(regexp_replace(trim(first_name || ' ' || coalesce(nullif(trim(last_name), '.'), '')), '\s+', ' ', 'g')) AS k,
           'name'::text AS mt,
           array_agg(id ORDER BY (public.normalize_phone(phone) IS NOT NULL) DESC, total_visits DESC NULLS LAST, created_at ASC) AS ids,
           count(*)::int AS n
    FROM public.clients
    WHERE coalesce(trim(first_name), '') <> ''
      AND coalesce(nullif(trim(last_name), '.'), '') <> ''
    GROUP BY 1
    HAVING count(*) >= 2
  )
  SELECT k, mt, ids, n FROM email_groups
  UNION ALL
  SELECT k, mt, ids, n FROM phone_groups
  UNION ALL
  SELECT k, mt, ids, n FROM name_groups
  ORDER BY 2, 4 DESC;
END;
$$;