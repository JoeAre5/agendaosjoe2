-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can update barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete barber avatars" ON storage.objects;

-- Only owner can update barber avatars
CREATE POLICY "Owner can update barber avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'barber-avatars' AND public.is_owner())
WITH CHECK (bucket_id = 'barber-avatars' AND public.is_owner());

-- Only owner can delete barber avatars
CREATE POLICY "Owner can delete barber avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'barber-avatars' AND public.is_owner());