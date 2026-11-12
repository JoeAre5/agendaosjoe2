-- Backfill clients rows for owner auth users so notifyOwners can target them.
INSERT INTO public.clients (auth_user_id, first_name, last_name, email, is_guest, account_verified, booking_source)
SELECT u.id,
       COALESCE(NULLIF(split_part(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'first_name', 'Admin'), ' ', 1), ''), 'Admin'),
       NULLIF(u.raw_user_meta_data->>'last_name', ''),
       u.email,
       false,
       true,
       'admin'
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'owner'
LEFT JOIN public.clients c ON c.auth_user_id = u.id
WHERE c.id IS NULL;