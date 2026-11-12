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
    draft_home_grid_photos
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
    'draft_home_grid_photos', COALESCE(to_jsonb(s.draft_home_grid_photos), 'null'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.website_draft_assets() TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_website_draft()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'not authorized'; END IF;

  UPDATE public.shop_settings SET
    header_logo_url        = COALESCE(NULLIF(draft_header_logo_url,''),  CASE WHEN draft_header_logo_url  IS NULL THEN header_logo_url  ELSE NULL END),
    sidebar_logo_url       = COALESCE(NULLIF(draft_sidebar_logo_url,''), CASE WHEN draft_sidebar_logo_url IS NULL THEN sidebar_logo_url ELSE NULL END),
    hero_image_url         = COALESCE(NULLIF(draft_hero_image_url,''),   CASE WHEN draft_hero_image_url   IS NULL THEN hero_image_url   ELSE NULL END),
    home_grid_photos       = COALESCE(draft_home_grid_photos, home_grid_photos),
    site_content           = COALESCE(draft_site_content, site_content),
    draft_header_logo_url  = NULL,
    draft_sidebar_logo_url = NULL,
    draft_hero_image_url   = NULL,
    draft_home_grid_photos = NULL,
    draft_site_content     = NULL,
    updated_at             = now()
  WHERE draft_header_logo_url IS NOT NULL
     OR draft_sidebar_logo_url IS NOT NULL
     OR draft_hero_image_url IS NOT NULL
     OR draft_home_grid_photos IS NOT NULL
     OR draft_site_content IS NOT NULL;

  UPDATE public.barbers SET
    avatar_url        = COALESCE(NULLIF(draft_avatar_url,''), CASE WHEN draft_avatar_url IS NULL THEN avatar_url ELSE NULL END),
    ig_photos         = COALESCE(draft_ig_photos, ig_photos),
    draft_avatar_url  = NULL,
    draft_ig_photos   = NULL
  WHERE draft_avatar_url IS NOT NULL OR draft_ig_photos IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_website_draft() TO authenticated;

CREATE OR REPLACE FUNCTION public.discard_website_draft()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN RAISE EXCEPTION 'not authorized'; END IF;

  UPDATE public.shop_settings SET
    draft_header_logo_url  = NULL,
    draft_sidebar_logo_url = NULL,
    draft_hero_image_url   = NULL,
    draft_home_grid_photos = NULL,
    draft_site_content     = NULL,
    updated_at             = now()
  WHERE draft_header_logo_url IS NOT NULL
     OR draft_sidebar_logo_url IS NOT NULL
     OR draft_hero_image_url IS NOT NULL
     OR draft_home_grid_photos IS NOT NULL
     OR draft_site_content IS NOT NULL;

  UPDATE public.barbers SET
    draft_avatar_url = NULL,
    draft_ig_photos  = NULL
  WHERE draft_avatar_url IS NOT NULL OR draft_ig_photos IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discard_website_draft() TO authenticated;