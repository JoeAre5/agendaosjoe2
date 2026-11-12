-- ─── waitlist_members ────────────────────────────────────────────────
CREATE TABLE public.waitlist_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  member_number integer NOT NULL,
  code text NOT NULL DEFAULT 'BIENVENIDO20',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  pwa_install_confirmed_at timestamptz,
  push_confirmed_at timestamptz,
  code_redeemed_at timestamptz,
  CONSTRAINT waitlist_members_client_id_unique UNIQUE (client_id),
  CONSTRAINT waitlist_members_member_number_unique UNIQUE (member_number)
);

CREATE INDEX waitlist_members_client_id_idx ON public.waitlist_members(client_id);
CREATE INDEX waitlist_members_enrolled_at_idx ON public.waitlist_members(enrolled_at);

-- ─── Auto-assign member_number in enrollment order ────────────────────
CREATE OR REPLACE FUNCTION public.assign_waitlist_member_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.member_number IS NULL OR NEW.member_number = 0 THEN
    SELECT COALESCE(MAX(member_number), 0) + 1
      INTO NEW.member_number
      FROM public.waitlist_members;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER waitlist_members_assign_number
  BEFORE INSERT ON public.waitlist_members
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_waitlist_member_number();

-- ─── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.waitlist_members ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or authenticated) can insert themselves
CREATE POLICY "Public insert waitlist_members"
  ON public.waitlist_members
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Client reads only their own row
CREATE POLICY "Client read own waitlist_members"
  ON public.waitlist_members
  FOR SELECT
  TO authenticated
  USING (is_client() AND client_id = get_my_client_id());

-- Client updates only their own row (install/push confirmations)
CREATE POLICY "Client update own waitlist_members"
  ON public.waitlist_members
  FOR UPDATE
  TO authenticated
  USING (is_client() AND client_id = get_my_client_id())
  WITH CHECK (is_client() AND client_id = get_my_client_id());

-- Owner full access
CREATE POLICY "Owner full access waitlist_members"
  ON public.waitlist_members
  FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- Service role full access (edge functions / collision retries)
CREATE POLICY "Service role full access waitlist_members"
  ON public.waitlist_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);