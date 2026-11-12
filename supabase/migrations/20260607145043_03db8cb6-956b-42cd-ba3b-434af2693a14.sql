REVOKE EXECUTE ON FUNCTION public.website_draft_assets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.website_draft_assets() TO authenticated;