
-- 1. Tighten barbers table SELECT policy: remove broad "all authenticated" access
--    that exposed ssn_last4, acuity_calendar_key, salary, commission_rate, etc.
--    Clients should use the public-safe view `barbers_public` instead.
DROP POLICY IF EXISTS "Authenticated read active barbers (public fields)" ON public.barbers;

-- Staff (barbers + owners) can still read active barbers directly.
-- (Barber-specific and owner-specific policies already exist; this consolidates the staff read path.)
CREATE POLICY "Staff read active barbers"
ON public.barbers
FOR SELECT
TO authenticated
USING ((is_barber() OR is_owner()) AND is_active = true);

-- 2. Allow clients to delete their own avatars from the private bucket.
CREATE POLICY "Clients delete own avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
