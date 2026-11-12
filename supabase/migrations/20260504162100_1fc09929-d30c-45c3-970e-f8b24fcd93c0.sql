
-- ========================================
-- LAUNCH SPRINT: Native inbox + checklist
-- ========================================

-- 1) Submission status enum (shared)
DO $$ BEGIN
  CREATE TYPE public.submission_status AS ENUM ('new', 'read', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Contact form submissions
CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  language TEXT NOT NULL DEFAULT 'es',
  matched_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  is_existing_client BOOLEAN NOT NULL DEFAULT false,
  status submission_status NOT NULL DEFAULT 'new',
  ghl_forwarded BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'website_contact',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON public.contact_submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_email ON public.contact_submissions(email);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner full access contact_submissions" ON public.contact_submissions;
CREATE POLICY "Owner full access contact_submissions"
  ON public.contact_submissions FOR ALL TO authenticated
  USING (is_owner()) WITH CHECK (is_owner());

DROP POLICY IF EXISTS "Service role full access contact_submissions" ON public.contact_submissions;
CREATE POLICY "Service role full access contact_submissions"
  ON public.contact_submissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) Recruitment / Join Team submissions
CREATE TABLE IF NOT EXISTS public.recruitment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workplace TEXT,
  social TEXT,
  experience TEXT,
  passion TEXT,
  message TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_name TEXT,
  language TEXT NOT NULL DEFAULT 'es',
  matched_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  is_existing_client BOOLEAN NOT NULL DEFAULT false,
  status submission_status NOT NULL DEFAULT 'new',
  ghl_forwarded BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'website_recruitment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recruitment_submissions_status ON public.recruitment_submissions(status, created_at DESC);

ALTER TABLE public.recruitment_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner full access recruitment_submissions" ON public.recruitment_submissions;
CREATE POLICY "Owner full access recruitment_submissions"
  ON public.recruitment_submissions FOR ALL TO authenticated
  USING (is_owner()) WITH CHECK (is_owner());

DROP POLICY IF EXISTS "Service role full access recruitment_submissions" ON public.recruitment_submissions;
CREATE POLICY "Service role full access recruitment_submissions"
  ON public.recruitment_submissions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) Launch checklist
DO $$ BEGIN
  CREATE TYPE public.checklist_status AS ENUM ('pending', 'in_review', 'done', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.launch_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status checklist_status NOT NULL DEFAULT 'pending',
  weight INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMPTZ,
  confirmed_by_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_launch_checklist_order ON public.launch_checklist(category, sort_order);

ALTER TABLE public.launch_checklist ENABLE ROW LEVEL SECURITY;

-- Owner can READ but cannot UPDATE/INSERT/DELETE from UI.
-- Only service_role (via Lovable migrations / agent) can mutate.
DROP POLICY IF EXISTS "Owner read launch_checklist" ON public.launch_checklist;
CREATE POLICY "Owner read launch_checklist"
  ON public.launch_checklist FOR SELECT TO authenticated
  USING (is_owner());

DROP POLICY IF EXISTS "Service role manage launch_checklist" ON public.launch_checklist;
CREATE POLICY "Service role manage launch_checklist"
  ON public.launch_checklist FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5) Realtime for inbox + checklist
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recruitment_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.launch_checklist;
