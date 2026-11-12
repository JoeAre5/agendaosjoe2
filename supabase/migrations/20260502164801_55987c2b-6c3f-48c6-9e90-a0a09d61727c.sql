-- Add auto-translation tracking flags
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS title_es_is_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS title_en_is_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS body_es_is_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS body_en_is_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excerpt_es_is_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excerpt_en_is_auto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS authoring_language text NOT NULL DEFAULT 'es' CHECK (authoring_language IN ('es','en'));

-- Replace the strict bilingual validation with the new "either-or + translation" rule
CREATE OR REPLACE FUNCTION public.validate_blog_post_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  es_complete boolean;
  en_complete boolean;
  es_present  boolean;
  en_present  boolean;
BEGIN
  -- Auto-suggest cover icon/bg from category if missing
  IF NEW.cover_icon IS NULL OR NEW.cover_bg_preset IS NULL THEN
    SELECT
      COALESCE(NEW.cover_icon, default_icon),
      COALESCE(NEW.cover_bg_preset, default_bg_preset)
    INTO NEW.cover_icon, NEW.cover_bg_preset
    FROM public.blog_categories
    WHERE slug = NEW.category;
  END IF;

  IF NEW.status = 'published' OR NEW.is_published = true THEN
    es_complete := COALESCE(length(trim(NEW.title)), 0)   > 0
                AND COALESCE(length(trim(NEW.body)), 0)    > 0
                AND COALESCE(length(trim(NEW.slug)), 0)    > 0;
    en_complete := COALESCE(length(trim(NEW.title_en)), 0) > 0
                AND COALESCE(length(trim(NEW.body_en)), 0)  > 0
                AND COALESCE(length(trim(NEW.slug_en)), 0)  > 0;

    es_present  := COALESCE(length(trim(NEW.title)), 0)    > 0
                AND COALESCE(length(trim(NEW.body)), 0)    > 0;
    en_present  := COALESCE(length(trim(NEW.title_en)), 0) > 0
                AND COALESCE(length(trim(NEW.body_en)), 0) > 0;

    -- Rule: at least one language fully complete (title + body + slug),
    -- and the other language has at least title + body (auto-translated counts).
    IF NOT (
      (es_complete AND en_present) OR
      (en_complete AND es_present)
    ) THEN
      RAISE EXCEPTION 'Para publicar necesitas el idioma principal completo (título, cuerpo y slug) y el otro idioma con título y cuerpo (puede ser auto-traducido).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;