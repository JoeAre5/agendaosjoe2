-- =========================================================================
-- 1. user_roles: explicit deny for non-owner authenticated writes
-- =========================================================================
-- Existing "Owners can insert/update/delete roles" policies remain (permissive OR).
-- Add an explicit restrictive policy so any non-owner authenticated user is denied.

DROP POLICY IF EXISTS "Deny non-owner role writes" ON public.user_roles;

CREATE POLICY "Deny non-owner role writes"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());

-- =========================================================================
-- 2. realtime.messages: require authentication for channel subscriptions
-- =========================================================================
-- Row-level visibility on appointments/transactions/waitlist is still enforced
-- by table RLS via postgres_changes. This blocks anonymous subscriptions.

DROP POLICY IF EXISTS "Authenticated users can receive realtime" ON realtime.messages;

CREATE POLICY "Authenticated users can receive realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

-- =========================================================================
-- 3. storage.objects: restrict barber-avatars writes to owners/barbers
-- =========================================================================
-- Drop any existing permissive INSERT/UPDATE/DELETE policies for this bucket,
-- then recreate with role-gated access. Public SELECT remains unchanged.

DROP POLICY IF EXISTS "Authenticated users can upload barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Owners and barbers can upload barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Owners and barbers can update barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Owners and barbers can delete barber avatars" ON storage.objects;

CREATE POLICY "Owners and barbers can upload barber avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'barber-avatars'
  AND (public.is_owner() OR public.is_barber())
);

CREATE POLICY "Owners and barbers can update barber avatars"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'barber-avatars'
  AND (public.is_owner() OR public.is_barber())
)
WITH CHECK (
  bucket_id = 'barber-avatars'
  AND (public.is_owner() OR public.is_barber())
);

CREATE POLICY "Owners and barbers can delete barber avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'barber-avatars'
  AND (public.is_owner() OR public.is_barber())
);