
ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS site_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS draft_site_content jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='shop_settings_public') THEN
    EXECUTE 'DROP VIEW public.shop_settings_public';
  END IF;
END$$;

CREATE VIEW public.shop_settings_public AS
  SELECT
    shop_name, city, owner_name, address, phone, hours, timezone,
    home_grid_photos, header_logo_url, sidebar_logo_url, whatsapp, email,
    maps_url, hero_image_url, site_content
  FROM public.shop_settings;

GRANT SELECT ON public.shop_settings_public TO anon, authenticated;

DROP FUNCTION IF EXISTS public.publish_website_draft();
DROP FUNCTION IF EXISTS public.discard_website_draft();
DROP FUNCTION IF EXISTS public.website_draft_status();

CREATE FUNCTION public.publish_website_draft()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_owner() THEN RAISE EXCEPTION 'not authorized'; END IF;

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
    updated_at             = now();

  UPDATE public.barbers SET
    avatar_url        = COALESCE(NULLIF(draft_avatar_url,''), CASE WHEN draft_avatar_url IS NULL THEN avatar_url ELSE NULL END),
    ig_photos         = COALESCE(draft_ig_photos, ig_photos),
    draft_avatar_url  = NULL,
    draft_ig_photos   = NULL
  WHERE draft_avatar_url IS NOT NULL OR draft_ig_photos IS NOT NULL;
END;
$$;

CREATE FUNCTION public.discard_website_draft()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_owner() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.shop_settings SET
    draft_header_logo_url  = NULL,
    draft_sidebar_logo_url = NULL,
    draft_hero_image_url   = NULL,
    draft_home_grid_photos = NULL,
    draft_site_content     = NULL;
  UPDATE public.barbers SET
    draft_avatar_url = NULL,
    draft_ig_photos  = NULL
  WHERE draft_avatar_url IS NOT NULL OR draft_ig_photos IS NOT NULL;
END;
$$;

CREATE FUNCTION public.website_draft_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  header_logo int := 0;
  sidebar_logo int := 0;
  hero_img int := 0;
  home_grid_img int := 0;
  content_keys int := 0;
  barber_profiles int := 0;
  barber_galleries int := 0;
  content jsonb;
BEGIN
  IF NOT is_owner() THEN RETURN '{}'::jsonb; END IF;

  SELECT * INTO s FROM public.shop_settings LIMIT 1;
  IF s.draft_header_logo_url IS NOT NULL  THEN header_logo := 1; END IF;
  IF s.draft_sidebar_logo_url IS NOT NULL THEN sidebar_logo := 1; END IF;
  IF s.draft_hero_image_url IS NOT NULL   THEN hero_img := 1; END IF;
  IF s.draft_home_grid_photos IS NOT NULL THEN home_grid_img := 1; END IF;

  content := COALESCE(s.draft_site_content, '{}'::jsonb);
  IF content <> '{}'::jsonb THEN
    content_keys := (SELECT count(*) FROM jsonb_object_keys(content));
  END IF;

  SELECT count(*) INTO barber_profiles  FROM public.barbers WHERE draft_avatar_url IS NOT NULL;
  SELECT count(*) INTO barber_galleries FROM public.barbers WHERE draft_ig_photos IS NOT NULL;

  RETURN jsonb_build_object(
    'header_logo',      header_logo      + (CASE WHEN (content ? 'header') THEN 1 ELSE 0 END),
    'sidebar_logo',     sidebar_logo,
    'hero',             hero_img         + (CASE WHEN (content ? 'hero') THEN 1 ELSE 0 END),
    'home_grid',        home_grid_img    + (CASE WHEN (content ? 'grid') THEN 1 ELSE 0 END),
    'barber_profiles',  barber_profiles,
    'barber_galleries', barber_galleries,
    'reviews',  CASE WHEN (content ? 'reviews')   THEN 1 ELSE 0 END,
    'services', CASE WHEN (content ? 'services')  THEN 1 ELSE 0 END,
    'team',     CASE WHEN (content ? 'team')      THEN 1 ELSE 0 END,
    'install',  CASE WHEN (content ? 'install')   THEN 1 ELSE 0 END,
    'blog',     CASE WHEN (content ? 'blog')      THEN 1 ELSE 0 END,
    'faq',      CASE WHEN (content ? 'faq')       THEN 1 ELSE 0 END,
    'instagram',CASE WHEN (content ? 'instagram') THEN 1 ELSE 0 END,
    'cta',      CASE WHEN (content ? 'cta')       THEN 1 ELSE 0 END,
    'footer',   CASE WHEN (content ? 'footer')    THEN 1 ELSE 0 END,
    'content_sections', content_keys,
    'total', header_logo + sidebar_logo + hero_img + home_grid_img
           + barber_profiles + barber_galleries + content_keys
  );
END;
$$;
