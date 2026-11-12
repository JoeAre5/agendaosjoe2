
-- 1. Add 'client' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'client';

-- 2. Add account-linking columns to clients table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) UNIQUE,
  ADD COLUMN IF NOT EXISTS is_guest boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS conversion_prompted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_prompted_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_source text;

-- 3. Index for fast lookup by auth_user_id
CREATE INDEX IF NOT EXISTS idx_clients_auth_user_id ON public.clients(auth_user_id) WHERE auth_user_id IS NOT NULL;
