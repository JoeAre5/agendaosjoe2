
-- Explicit deny-all for webauthn_challenges (only service role bypasses RLS)
CREATE POLICY "No direct access"
  ON public.webauthn_challenges FOR ALL
  USING (false)
  WITH CHECK (false);
