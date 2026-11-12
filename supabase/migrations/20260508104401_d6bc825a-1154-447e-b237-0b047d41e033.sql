-- Blog analytics events table for Titulares dashboard
CREATE TABLE public.blog_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid,
  event_type text NOT NULL,
  source text,
  session_id text NOT NULL,
  language text,
  scroll_depth integer,
  time_on_page_ms integer,
  referrer text,
  path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_analytics_post_created ON public.blog_analytics_events(post_id, created_at DESC);
CREATE INDEX idx_blog_analytics_type_created ON public.blog_analytics_events(event_type, created_at DESC);
CREATE INDEX idx_blog_analytics_source_created ON public.blog_analytics_events(source, created_at DESC);
CREATE INDEX idx_blog_analytics_session ON public.blog_analytics_events(session_id);
CREATE INDEX idx_blog_analytics_created ON public.blog_analytics_events(created_at DESC);

ALTER TABLE public.blog_analytics_events ENABLE ROW LEVEL SECURITY;

-- Validate event_type via trigger (CHECK constraints would be too rigid)
CREATE OR REPLACE FUNCTION public.validate_blog_analytics_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.event_type NOT IN (
    'view','scroll_25','scroll_50','scroll_75','read_complete',
    'prev_click','next_click','related_click','share','snapshot_click',
    'cta_click','subscribe_from_post','toc_click','listen_play','exit'
  ) THEN
    RAISE EXCEPTION 'Invalid blog analytics event_type: %', NEW.event_type;
  END IF;
  IF NEW.scroll_depth IS NOT NULL AND (NEW.scroll_depth < 0 OR NEW.scroll_depth > 100) THEN
    RAISE EXCEPTION 'scroll_depth must be 0..100';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_blog_analytics_event
BEFORE INSERT ON public.blog_analytics_events
FOR EACH ROW EXECUTE FUNCTION public.validate_blog_analytics_event();

-- Anyone (anon + auth) can insert events — needed for public site tracking
CREATE POLICY "Public insert blog analytics"
ON public.blog_analytics_events FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Owner reads aggregates
CREATE POLICY "Owner read blog analytics"
ON public.blog_analytics_events FOR SELECT
TO authenticated
USING (is_owner());

CREATE POLICY "Service role full access blog analytics"
ON public.blog_analytics_events FOR ALL
TO service_role
USING (true) WITH CHECK (true);