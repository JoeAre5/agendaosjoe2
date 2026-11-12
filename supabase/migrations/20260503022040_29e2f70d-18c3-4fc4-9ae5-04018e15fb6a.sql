
-- Phase 6: view counter RPC for blog posts
CREATE OR REPLACE FUNCTION public.increment_blog_view(_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.blog_posts
  SET view_count = COALESCE(view_count, 0) + 1,
      last_viewed_at = now()
  WHERE id = _post_id AND is_published = true;
$$;

GRANT EXECUTE ON FUNCTION public.increment_blog_view(uuid) TO anon, authenticated;
