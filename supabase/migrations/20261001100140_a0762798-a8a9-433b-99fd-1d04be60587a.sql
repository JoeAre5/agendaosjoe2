DROP POLICY IF EXISTS "Public read app_flags" ON public.app_flags;
CREATE POLICY "Public read app_flags" ON public.app_flags
FOR SELECT TO anon, authenticated USING (id = true);

DROP POLICY IF EXISTS "ref_ranks read all" ON public.referral_ranks;
CREATE POLICY "ref_ranks read all" ON public.referral_ranks
FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "ref_systems read all" ON public.referral_systems;
CREATE POLICY "ref_systems read all" ON public.referral_systems
FOR SELECT TO authenticated
USING (status IN ('active','coming_soon')
       OR public.has_role(auth.uid(), 'owner'::app_role)
       OR public.has_role(auth.uid(), 'super_owner'::app_role));

DROP POLICY IF EXISTS "Public insert pwa_installs" ON public.pwa_installs;
CREATE POLICY "Public insert pwa_installs" ON public.pwa_installs
FOR INSERT TO anon, authenticated
WITH CHECK (
  (platform IS NULL OR platform IN ('ios','android','desktop','unknown'))
  AND (display_mode IS NULL OR display_mode IN ('standalone','browser'))
  AND (user_agent IS NULL OR length(user_agent) <= 1000)
  AND (session_id IS NULL OR length(session_id) <= 200)
  AND (client_id IS NULL OR client_id IN (SELECT c.id FROM public.clients c WHERE c.auth_user_id = auth.uid()))
);

DROP POLICY IF EXISTS "Public insert blog analytics" ON public.blog_analytics_events;
CREATE POLICY "Public insert blog analytics" ON public.blog_analytics_events
FOR INSERT TO anon, authenticated
WITH CHECK (
  length(event_type) BETWEEN 1 AND 64
  AND length(session_id) BETWEEN 1 AND 200
  AND (path IS NULL OR length(path) <= 500)
  AND (referrer IS NULL OR length(referrer) <= 1000)
  AND (source IS NULL OR length(source) <= 100)
  AND (language IS NULL OR length(language) <= 10)
  AND (scroll_depth IS NULL OR scroll_depth BETWEEN 0 AND 100)
  AND (time_on_page_ms IS NULL OR time_on_page_ms BETWEEN 0 AND 86400000)
  AND pg_column_size(metadata) <= 8192
);