ALTER VIEW public.blog_publication_settings_public SET (security_invoker = on);

-- Allow the view to read past RLS by granting itself nothing extra; instead add a public-read
-- policy on the base table restricted to the safe columns is not possible, so re-add a row
-- read policy that the view will use under invoker rights.
CREATE POLICY "Public read publication settings via view"
  ON public.blog_publication_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);