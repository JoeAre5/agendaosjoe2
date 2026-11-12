-- ============================================================
-- FIX 1: user_roles — prevent privilege escalation
-- ============================================================
-- Only owners can insert/update/delete roles via SQL.
-- The provision-oauth-client edge function uses service_role, which bypasses RLS.

CREATE POLICY "Owners can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_owner());

CREATE POLICY "Owners can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_owner())
WITH CHECK (public.is_owner());

CREATE POLICY "Owners can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.is_owner());

-- ============================================================
-- FIX 2: Realtime — restrict channel subscriptions
-- ============================================================
-- Only staff (owners + barbers) can subscribe to realtime channels.
-- Clients use REST queries gated by table-level RLS instead.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can subscribe to realtime" ON realtime.messages;

CREATE POLICY "Staff can subscribe to realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.is_owner() OR public.is_barber());

-- ============================================================
-- FIX 3: barber-avatars bucket — restrict writes to staff
-- ============================================================
-- Public read remains (avatars display on public site).
-- Only owners and barbers can upload/update/delete.

DROP POLICY IF EXISTS "Authenticated users can upload barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete barber avatars" ON storage.objects;

CREATE POLICY "Staff can upload barber avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'barber-avatars'
  AND (public.is_owner() OR public.is_barber())
);

CREATE POLICY "Staff can update barber avatars"
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

CREATE POLICY "Staff can delete barber avatars"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'barber-avatars'
  AND (public.is_owner() OR public.is_barber())
);