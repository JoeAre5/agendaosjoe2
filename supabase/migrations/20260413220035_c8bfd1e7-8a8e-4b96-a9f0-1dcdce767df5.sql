CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  excerpt text,
  body text NOT NULL,
  category text DEFAULT 'la-cultura',
  cover_image_url text,
  author text DEFAULT 'Charlie Corchado',
  read_time_minutes integer DEFAULT 5,
  is_published boolean DEFAULT false,
  published_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published" ON public.blog_posts
  FOR SELECT TO anon, authenticated USING (is_published = true);

CREATE POLICY "Owner full access" ON public.blog_posts
  FOR ALL TO authenticated USING (is_owner());

CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();