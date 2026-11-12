
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS sent_to_subscribers_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_subscribers_count integer NOT NULL DEFAULT 0;
