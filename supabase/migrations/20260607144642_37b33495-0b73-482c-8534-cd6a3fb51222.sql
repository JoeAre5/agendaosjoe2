CREATE OR REPLACE FUNCTION public.website_draft_assets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT
    id,
    header_logo_url,
    draft_header_logo_url,
    sidebar_logo_url,
    draft_sidebar_logo_url,
    hero_image_url,
    draft_hero_image_url,
    home_grid_photos,
    draft_home_grid_photos,
    site_content,
    draft_site_content
  INTO s
  FROM public.shop_settings
  LIMIT 1;

  RETURN jsonb_build_object(
    'id', s.id,
    'header_logo_url', s.header_logo_url,
    'draft_header_logo_url', s.draft_header_logo_url,
    'sidebar_logo_url', s.sidebar_logo_url,
    'draft_sidebar_logo_url', s.draft_sidebar_logo_url,
    'hero_image_url', s.hero_image_url,
    'draft_hero_image_url', s.draft_hero_image_url,
    'home_grid_photos', COALESCE(to_jsonb(s.home_grid_photos), 'null'::jsonb),
    'draft_home_grid_photos', COALESCE(to_jsonb(s.draft_home_grid_photos), 'null'::jsonb),
    'site_content', COALESCE(s.site_content, '{}'::jsonb),
    'draft_site_content', COALESCE(to_jsonb(s.draft_site_content), 'null'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.website_draft_assets() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.website_draft_assets() FROM anon;