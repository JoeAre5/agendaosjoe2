DROP POLICY IF EXISTS "Public insert waitlist_members" ON public.waitlist_members;

CREATE POLICY "Clients insert own waitlist row"
ON public.waitlist_members
FOR INSERT
TO authenticated
WITH CHECK (client_id = public.get_my_client_id());