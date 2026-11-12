CREATE OR REPLACE FUNCTION public.outreach_can_access_client(p_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(public.is_owner(), false) OR coalesce(
    public.is_barber() AND public.get_my_barber_id() IS NOT NULL
    AND public.outreach_affinity_barber(p_client_id) = public.get_my_barber_id(), false)
$$;