
-- Launch flag table
CREATE TABLE IF NOT EXISTS public.app_flags (
  id boolean PRIMARY KEY DEFAULT true,
  public_site_live boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT singleton CHECK (id = true)
);

ALTER TABLE public.app_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read app_flags" ON public.app_flags;
CREATE POLICY "Public read app_flags"
ON public.app_flags FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Owner update app_flags" ON public.app_flags;
CREATE POLICY "Owner update app_flags"
ON public.app_flags FOR UPDATE
TO authenticated
USING (is_owner())
WITH CHECK (is_owner());

DROP POLICY IF EXISTS "Owner insert app_flags" ON public.app_flags;
CREATE POLICY "Owner insert app_flags"
ON public.app_flags FOR INSERT
TO authenticated
WITH CHECK (is_owner());

INSERT INTO public.app_flags (id, public_site_live)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_flags;
