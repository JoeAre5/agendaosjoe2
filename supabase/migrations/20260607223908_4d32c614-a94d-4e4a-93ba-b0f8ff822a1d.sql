DROP FUNCTION IF EXISTS public.grant_birthday_gifts_today();

CREATE FUNCTION public.grant_birthday_gifts_today()
RETURNS TABLE (
  gift_id UUID,
  out_client_id UUID,
  first_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'America/Puerto_Rico')::date;
  v_year INT := EXTRACT(YEAR FROM v_today)::int;
BEGIN
  RETURN QUERY
  WITH ins AS (
    INSERT INTO public.client_birthday_gifts (client_id, gift_year, expires_at)
    SELECT c.id, v_year, ((v_today + INTERVAL '30 days')::date)::timestamptz
    FROM public.clients c
    WHERE c.date_of_birth IS NOT NULL
      AND EXTRACT(MONTH FROM c.date_of_birth) = EXTRACT(MONTH FROM v_today)
      AND EXTRACT(DAY   FROM c.date_of_birth) = EXTRACT(DAY   FROM v_today)
    ON CONFLICT (client_id, gift_year) DO NOTHING
    RETURNING client_birthday_gifts.id AS new_id, client_birthday_gifts.client_id AS new_client_id
  )
  SELECT i.new_id, i.new_client_id, c.first_name
  FROM ins i
  JOIN public.clients c ON c.id = i.new_client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_birthday_gifts_today() TO service_role;