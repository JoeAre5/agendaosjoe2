
-- ─── Phase 0: Blog v2 schema ──────────────────────────────────────────────

-- 1. Extend blog_posts
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS excerpt_en text,
  ADD COLUMN IF NOT EXISTS body_en text,
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS author_avatar_url text,
  ADD COLUMN IF NOT EXISTS author_role text DEFAULT 'Owner & Master Barber',
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seo_title text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS og_image_url text,
  ADD COLUMN IF NOT EXISTS body_blocks jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS word_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reading_time_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_generated boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_prompt text,
  ADD COLUMN IF NOT EXISTS ai_model text;

-- Backfill status from is_published
UPDATE public.blog_posts SET status = 'published' WHERE is_published = true AND status = 'draft';

-- Status validation trigger (avoiding immutable CHECK)
CREATE OR REPLACE FUNCTION public.validate_blog_post_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('draft','scheduled','published','archived') THEN
    RAISE EXCEPTION 'Invalid blog status: %', NEW.status;
  END IF;
  -- Keep is_published in sync for back-compat with public read policy
  NEW.is_published := (NEW.status = 'published');
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_blog_post_status_trg ON public.blog_posts;
CREATE TRIGGER validate_blog_post_status_trg
  BEFORE INSERT OR UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.validate_blog_post_status();

-- Reading time + word count auto-compute
CREATE OR REPLACE FUNCTION public.compute_blog_reading_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  plain text;
  wc integer;
BEGIN
  plain := COALESCE(NEW.body, '');
  -- Strip HTML tags (rough)
  plain := regexp_replace(plain, '<[^>]+>', ' ', 'g');
  plain := regexp_replace(plain, '\s+', ' ', 'g');
  wc := COALESCE(array_length(regexp_split_to_array(trim(plain), '\s+'), 1), 0);
  NEW.word_count := wc;
  IF NOT COALESCE(NEW.reading_time_override, false) THEN
    NEW.reading_time_minutes := GREATEST(1, CEIL(wc::numeric / 200));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS compute_blog_reading_time_trg ON public.blog_posts;
CREATE TRIGGER compute_blog_reading_time_trg
  BEFORE INSERT OR UPDATE OF body, body_blocks, reading_time_override ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.compute_blog_reading_time();

-- 2. blog_categories table
CREATE TABLE IF NOT EXISTS public.blog_categories (
  slug text PRIMARY KEY,
  label_es text NOT NULL,
  label_en text NOT NULL,
  accent_color text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active categories" ON public.blog_categories;
CREATE POLICY "Public read active categories" ON public.blog_categories
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Owner full access categories" ON public.blog_categories;
CREATE POLICY "Owner full access categories" ON public.blog_categories
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

DROP TRIGGER IF EXISTS update_blog_categories_updated_at ON public.blog_categories;
CREATE TRIGGER update_blog_categories_updated_at
  BEFORE UPDATE ON public.blog_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default categories
INSERT INTO public.blog_categories (slug, label_es, label_en, sort_order)
VALUES
  ('la-cultura', 'La Cultura', 'The Culture', 10),
  ('detras-de-la-silla', 'Detrás de la Silla', 'Behind the Chair', 20),
  ('barba-perfecta', 'Barba Perfecta', 'Perfect Beard', 30)
ON CONFLICT (slug) DO NOTHING;

-- 3. Storage bucket for blog covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-covers', 'blog-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Public read on blog-covers
DROP POLICY IF EXISTS "Public read blog-covers" ON storage.objects;
CREATE POLICY "Public read blog-covers" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'blog-covers');

DROP POLICY IF EXISTS "Owner write blog-covers" ON storage.objects;
CREATE POLICY "Owner write blog-covers" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'blog-covers' AND public.is_owner())
  WITH CHECK (bucket_id = 'blog-covers' AND public.is_owner());

-- Helpful indexes
CREATE INDEX IF NOT EXISTS blog_posts_status_published_idx
  ON public.blog_posts (status, published_at DESC);
CREATE INDEX IF NOT EXISTS blog_posts_category_idx
  ON public.blog_posts (category);
