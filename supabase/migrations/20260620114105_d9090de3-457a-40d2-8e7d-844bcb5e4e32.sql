REVOKE EXECUTE ON FUNCTION public.enqueue_ghl_event(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.appointments_ghl_sync_trigger() FROM PUBLIC, anon, authenticated;