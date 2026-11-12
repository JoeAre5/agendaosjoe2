REVOKE EXECUTE ON FUNCTION public.get_client_payment_details(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_payment_details(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_client_payment_details(uuid) TO authenticated;