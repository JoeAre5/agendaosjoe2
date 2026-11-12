
-- 1 & 2: Drop sensitive tables from realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='clients') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.clients';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='contact_submissions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.contact_submissions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='recruitment_submissions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.recruitment_submissions';
  END IF;
END $$;

-- 3: Hide owner_id from public referral_codes reads via column-level grants.
REVOKE SELECT ON public.referral_codes FROM anon, authenticated;
GRANT SELECT (code, owner_type, is_active, created_at) ON public.referral_codes TO anon, authenticated;
-- Owner still needs full access; owner role uses authenticated grants + RLS, so re-grant full select for the owner policy to work
-- Owner policy uses is_owner(); but column grants apply per-role. Owner is also `authenticated`. To not break owner reads of owner_id,
-- create a SECURITY DEFINER helper view for owners, OR keep an owner-only column-bypassing path. Simplest: re-grant owner_id only via a function.
-- We'll expose owner_id to owners through a SECURITY DEFINER function:
CREATE OR REPLACE FUNCTION public.get_referral_code_owner(_code text)
RETURNS TABLE(code text, owner_type text, owner_id uuid, is_active boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT rc.code, rc.owner_type, rc.owner_id, rc.is_active, rc.created_at
  FROM public.referral_codes rc
  WHERE rc.code = _code
    AND (public.is_owner() OR public.is_super_admin());
$fn$;

-- 4: Tighten notification_templates SELECT policy
DO $$
DECLARE _pol record;
BEGIN
  FOR _pol IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.notification_templates'::regclass
      AND polcmd = 'r'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.notification_templates', _pol.polname);
  END LOOP;
END $$;

CREATE POLICY "Staff can view notification templates"
  ON public.notification_templates
  FOR SELECT
  TO authenticated
  USING (public.is_owner() OR public.is_barber() OR public.is_super_admin());
