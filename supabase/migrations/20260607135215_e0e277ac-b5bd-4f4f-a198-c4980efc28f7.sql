
-- 1) Draft columns
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS draft_header_logo_url  text,
  ADD COLUMN IF NOT EXISTS draft_sidebar_logo_url text,
  ADD COLUMN IF NOT EXISTS draft_hero_image_url   text,
  ADD COLUMN IF NOT EXISTS draft_home_grid_photos text[];

ALTER TABLE public.barbers
  ADD COLUMN IF NOT EXISTS draft_avatar_url text,
  ADD COLUMN IF NOT EXISTS draft_ig_photos  text[];

-- 2) Publish: copy drafts -> live, clear drafts
CREATE OR REPLACE FUNCTION public.publish_website_draft()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_shop_updated int := 0;
  v_barbers_updated int := 0;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.shop_settings
  SET
    header_logo_url  = COALESCE(draft_header_logo_url,  header_logo_url),
    sidebar_logo_url = COALESCE(draft_sidebar_logo_url, sidebar_logo_url),
    hero_image_url   = COALESCE(draft_hero_image_url,   hero_image_url),
    home_grid_photos = COALESCE(draft_home_grid_photos, home_grid_photos),
    draft_header_logo_url  = NULL,
    draft_sidebar_logo_url = NULL,
    draft_hero_image_url   = NULL,
    draft_home_grid_photos = NULL
  WHERE
    draft_header_logo_url IS NOT NULL
    OR draft_sidebar_logo_url IS NOT NULL
    OR draft_hero_image_url IS NOT NULL
    OR draft_home_grid_photos IS NOT NULL;
  GET DIAGNOSTICS v_shop_updated = ROW_COUNT;

  UPDATE public.barbers
  SET
    avatar_url = COALESCE(draft_avatar_url, avatar_url),
    ig_photos  = COALESCE(draft_ig_photos,  ig_photos),
    draft_avatar_url = NULL,
    draft_ig_photos  = NULL
  WHERE
    draft_avatar_url IS NOT NULL
    OR draft_ig_photos IS NOT NULL;
  GET DIAGNOSTICS v_barbers_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'shop_updated', v_shop_updated,
    'barbers_updated', v_barbers_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_website_draft() TO authenticated;

-- 3) Discard
CREATE OR REPLACE FUNCTION public.discard_website_draft()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.shop_settings SET
    draft_header_logo_url  = NULL,
    draft_sidebar_logo_url = NULL,
    draft_hero_image_url   = NULL,
    draft_home_grid_photos = NULL
  WHERE draft_header_logo_url IS NOT NULL
     OR draft_sidebar_logo_url IS NOT NULL
     OR draft_hero_image_url IS NOT NULL
     OR draft_home_grid_photos IS NOT NULL;

  UPDATE public.barbers SET
    draft_avatar_url = NULL,
    draft_ig_photos  = NULL
  WHERE draft_avatar_url IS NOT NULL
     OR draft_ig_photos IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.discard_website_draft() TO authenticated;

-- 4) Status helper: pending counts by section
CREATE OR REPLACE FUNCTION public.website_draft_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_header int := 0;
  v_sidebar int := 0;
  v_hero int := 0;
  v_home_grid int := 0;
  v_barber_profiles int := 0;
  v_barber_galleries int := 0;
BEGIN
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT
    (CASE WHEN draft_header_logo_url  IS NOT NULL THEN 1 ELSE 0 END),
    (CASE WHEN draft_sidebar_logo_url IS NOT NULL THEN 1 ELSE 0 END),
    (CASE WHEN draft_hero_image_url   IS NOT NULL THEN 1 ELSE 0 END),
    (CASE WHEN draft_home_grid_photos IS NOT NULL THEN 1 ELSE 0 END)
  INTO v_header, v_sidebar, v_hero, v_home_grid
  FROM public.shop_settings
  LIMIT 1;

  SELECT
    COUNT(*) FILTER (WHERE draft_avatar_url IS NOT NULL),
    COUNT(*) FILTER (WHERE draft_ig_photos  IS NOT NULL)
  INTO v_barber_profiles, v_barber_galleries
  FROM public.barbers;

  v := jsonb_build_object(
    'header_logo',      v_header,
    'sidebar_logo',     v_sidebar,
    'hero',             v_hero,
    'home_grid',        v_home_grid,
    'barber_profiles',  v_barber_profiles,
    'barber_galleries', v_barber_galleries,
    'total', v_header + v_sidebar + v_hero + v_home_grid + v_barber_profiles + v_barber_galleries
  );
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.website_draft_status() TO authenticated;
