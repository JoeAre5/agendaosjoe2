CREATE OR REPLACE FUNCTION public.get_client_payment_details(_client_id uuid)
RETURNS TABLE(stripe_customer_id text, card_brand text, card_last4 text, preferred_payment_method text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_owner boolean := public.is_owner();
  _is_barber boolean := public.is_barber();
  _my_client_id uuid := public.get_my_client_id();
BEGIN
  IF NOT _is_owner AND NOT _is_barber AND _my_client_id IS DISTINCT FROM _client_id THEN
    RAISE EXCEPTION 'permission denied: payment details';
  END IF;

  RETURN QUERY
    SELECT c.stripe_customer_id, c.card_brand, c.card_last4, c.preferred_payment_method
    FROM public.clients c
    WHERE c.id = _client_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_payment_details(uuid) TO authenticated;