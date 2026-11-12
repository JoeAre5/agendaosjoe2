-- Nuke leftover test signup that left an orphan client row + auth user
-- Email: prueba@email.com
DO $$
DECLARE
  _client_id uuid := '177f20f1-d768-477c-b4b0-1c4fef15ad18';
  _auth_id uuid := '70c5d561-f909-4c0d-923c-7a0820aef5b8';
BEGIN
  DELETE FROM public.waitlist_members WHERE client_id = _client_id;
  DELETE FROM public.user_roles WHERE user_id = _auth_id;
  DELETE FROM public.clients WHERE id = _client_id;
  DELETE FROM auth.users WHERE id = _auth_id;
END $$;