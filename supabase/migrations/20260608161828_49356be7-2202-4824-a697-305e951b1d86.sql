
-- 1) Remove permissive authenticated INSERT on audit_log; only service_role writes
DROP POLICY IF EXISTS "Authenticated insert own audit_log" ON public.audit_log;

-- 2) Force security_invoker on shop_settings_public view
ALTER VIEW public.shop_settings_public SET (security_invoker = on);

-- 3) Tighten barber-avatars storage policies: barbers can only touch their own path
DROP POLICY IF EXISTS "Owners and barbers can upload barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Owners and barbers can update barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Owners and barbers can delete barber avatars" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete barber avatars" ON storage.objects;

-- Owners retain full control
CREATE POLICY "Owners manage barber avatars insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'barber-avatars' AND public.is_owner());

CREATE POLICY "Owners manage barber avatars update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'barber-avatars' AND public.is_owner())
  WITH CHECK (bucket_id = 'barber-avatars' AND public.is_owner());

CREATE POLICY "Owners manage barber avatars delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'barber-avatars' AND public.is_owner());

-- Barbers can only upload/update/delete their OWN avatar
-- Path convention: "<barber_id>.<ext>" or "<barber_id>/..."
CREATE POLICY "Barbers manage own avatar insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'barber-avatars'
    AND public.is_barber()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.barber_id IS NOT NULL
        AND split_part(split_part(storage.objects.name, '/', 1), '.', 1) = p.barber_id::text
    )
  );

CREATE POLICY "Barbers manage own avatar update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'barber-avatars'
    AND public.is_barber()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.barber_id IS NOT NULL
        AND split_part(split_part(storage.objects.name, '/', 1), '.', 1) = p.barber_id::text
    )
  )
  WITH CHECK (
    bucket_id = 'barber-avatars'
    AND public.is_barber()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.barber_id IS NOT NULL
        AND split_part(split_part(storage.objects.name, '/', 1), '.', 1) = p.barber_id::text
    )
  );

CREATE POLICY "Barbers manage own avatar delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'barber-avatars'
    AND public.is_barber()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.barber_id IS NOT NULL
        AND split_part(split_part(storage.objects.name, '/', 1), '.', 1) = p.barber_id::text
    )
  );
