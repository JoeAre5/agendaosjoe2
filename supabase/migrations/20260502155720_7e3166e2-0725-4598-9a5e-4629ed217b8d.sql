-- Phase 0 v2: bilingual-required, icon-on-color covers, AI snapshot

-- 1. blog_posts new columns
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS slug_en text,
  ADD COLUMN IF NOT EXISTS subtitle_es text,
  ADD COLUMN IF NOT EXISTS subtitle_en text,
  ADD COLUMN IF NOT EXISTS author_role_es text DEFAULT 'Owner & Master Barber',
  ADD COLUMN IF NOT EXISTS author_role_en text DEFAULT 'Owner & Master Barber',
  ADD COLUMN IF NOT EXISTS seo_title_es text,
  ADD COLUMN IF NOT EXISTS seo_title_en text,
  ADD COLUMN IF NOT EXISTS seo_description_es text,
  ADD COLUMN IF NOT EXISTS seo_description_en text,
  ADD COLUMN IF NOT EXISTS body_blocks_es jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS body_blocks_en jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_icon text,
  ADD COLUMN IF NOT EXISTS cover_bg_preset text,
  ADD COLUMN IF NOT EXISTS cover_icon_auto_suggested boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS snapshot_es jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_en jsonb DEFAULT '[]'::jsonb;

-- Backfill subtitle_es from legacy subtitle if present
UPDATE public.blog_posts SET subtitle_es = subtitle WHERE subtitle_es IS NULL AND subtitle IS NOT NULL;

-- Backfill seo from legacy
UPDATE public.blog_posts SET seo_title_es = seo_title WHERE seo_title_es IS NULL AND seo_title IS NOT NULL;
UPDATE public.blog_posts SET seo_description_es = seo_description WHERE seo_description_es IS NULL AND seo_description IS NOT NULL;

-- Unique index for English slug (when present)
CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_en_key ON public.blog_posts(slug_en) WHERE slug_en IS NOT NULL;

-- 2. blog_categories: add default icon + bg
ALTER TABLE public.blog_categories
  ADD COLUMN IF NOT EXISTS default_icon text DEFAULT 'newspaper',
  ADD COLUMN IF NOT EXISTS default_bg_preset text DEFAULT 'primary-gradient';

-- Seed defaults per category
UPDATE public.blog_categories SET default_icon = 'sparkles', default_bg_preset = 'primary-gradient' WHERE slug = 'la-cultura';
UPDATE public.blog_categories SET default_icon = 'scissors', default_bg_preset = 'dark-gradient' WHERE slug = 'detras-de-la-silla';
UPDATE public.blog_categories SET default_icon = 'beard', default_bg_preset = 'warm-gradient' WHERE slug = 'barba-perfecta';

-- 3. Rebuild validation trigger: require ES+EN at publish, auto-suggest cover from category
CREATE OR REPLACE FUNCTION public.validate_blog_post_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cat_icon text;
  cat_bg text;
BEGIN
  -- Auto-suggest cover icon/bg from category when not set or still flagged auto
  IF NEW.cover_icon IS NULL OR NEW.cover_icon_auto_suggested = true THEN
    SELECT default_icon, default_bg_preset INTO cat_icon, cat_bg
    FROM public.blog_categories WHERE slug = NEW.category;
    IF cat_icon IS NOT NULL AND NEW.cover_icon IS NULL THEN
      NEW.cover_icon := cat_icon;
    END IF;
    IF cat_bg IS NOT NULL AND NEW.cover_bg_preset IS NULL THEN
      NEW.cover_bg_preset := cat_bg;
    END IF;
  END IF;

  -- Keep legacy is_published in sync with status
  IF NEW.status = 'published' THEN
    NEW.is_published := true;
    IF NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
  ELSE
    NEW.is_published := false;
  END IF;

  -- Require bilingual fields at publish
  IF NEW.status = 'published' THEN
    IF coalesce(trim(NEW.title), '') = '' OR coalesce(trim(NEW.title_en), '') = '' THEN
      RAISE EXCEPTION 'Cannot publish: title (ES and EN) are required';
    END IF;
    IF coalesce(trim(NEW.body), '') = '' OR coalesce(trim(NEW.body_en), '') = '' THEN
      RAISE EXCEPTION 'Cannot publish: body (ES and EN) are required';
    END IF;
    IF coalesce(trim(NEW.slug), '') = '' OR coalesce(trim(NEW.slug_en), '') = '' THEN
      RAISE EXCEPTION 'Cannot publish: slug (ES and EN) are required';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists from v1; CREATE OR REPLACE FUNCTION updates the body in place.
