REVOKE ALL ON FUNCTION public.merge_clients(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_duplicate_client_groups() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_client_by_identity(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_client_by_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_duplicate_client_identity() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.merge_clients(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_duplicate_client_groups() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_client_by_identity(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_client_by_phone(text) TO authenticated, service_role;