-- Make client-avatars bucket private
UPDATE storage.buckets SET public = false WHERE id = 'client-avatars';

-- Drop the over-permissive public SELECT policy
DROP POLICY IF EXISTS "Public read client avatars" ON storage.objects;

-- Client can read their own avatar (folder = their auth.uid())
CREATE POLICY "Clients read own avatar"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Staff (barbers + owner) can read any client avatar (needed for admin/staff views)
CREATE POLICY "Staff read client avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-avatars'
  AND (public.is_owner() OR public.is_barber())
);