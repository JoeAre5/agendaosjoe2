CREATE TABLE public.review_prompt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES public.shops(id),
  appointment_id uuid NOT NULL,
  client_id uuid,
  guest_identifier text,
  event_type text NOT NULL CHECK (event_type IN ('review_prompt_shown','review_prompt_dismissed','review_link_clicked')),
  channel text NOT NULL DEFAULT 'web_booking',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_prompt_events_client_idx ON public.review_prompt_events (client_id, event_type, created_at DESC);
CREATE INDEX review_prompt_events_guest_idx ON public.review_prompt_events (guest_identifier, event_type, created_at DESC);
CREATE UNIQUE INDEX review_prompt_events_once_idx ON public.review_prompt_events (appointment_id, event_type);
GRANT SELECT ON public.review_prompt_events TO authenticated;
GRANT ALL ON public.review_prompt_events TO service_role;
ALTER TABLE public.review_prompt_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read review prompt events" ON public.review_prompt_events FOR SELECT TO authenticated
  USING (public.is_owner() OR public.is_super_admin());
CREATE POLICY "Clients read own review prompt events" ON public.review_prompt_events FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND client_id = public.get_my_client_id());

CREATE TABLE public.client_review_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid REFERENCES public.shops(id),
  client_id uuid NOT NULL,
  appointment_id uuid,
  google_review_id text NOT NULL,
  author_display_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','unlinked')),
  verified_by uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  unlinked_by uuid,
  unlinked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_review_verifications_client_idx ON public.client_review_verifications (client_id, status);
GRANT SELECT, INSERT, UPDATE ON public.client_review_verifications TO authenticated;
GRANT ALL ON public.client_review_verifications TO service_role;
ALTER TABLE public.client_review_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage review verifications" ON public.client_review_verifications FOR ALL TO authenticated
  USING (public.is_owner() OR public.is_super_admin())
  WITH CHECK ((public.is_owner() OR public.is_super_admin()) AND verified_by = auth.uid());