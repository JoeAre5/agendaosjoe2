
-- Helper function: check if current user is a client
CREATE OR REPLACE FUNCTION public.is_client()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid()) AND role = 'client'
  )
$$;

-- Helper function: get client_id for the current auth user
CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- Barber read all clients
CREATE POLICY "Barber read clients"
ON public.clients FOR SELECT TO authenticated
USING (is_barber());

-- Client read own row
CREATE POLICY "Client read own profile"
ON public.clients FOR SELECT TO authenticated
USING (is_client() AND auth_user_id = auth.uid());

-- Client update own row
CREATE POLICY "Client update own profile"
ON public.clients FOR UPDATE TO authenticated
USING (is_client() AND auth_user_id = auth.uid())
WITH CHECK (is_client() AND auth_user_id = auth.uid());

-- Client read own appointments
CREATE POLICY "Client read own appointments"
ON public.appointments FOR SELECT TO authenticated
USING (is_client() AND client_id = get_my_client_id());

-- Client read active services
CREATE POLICY "Client read active services"
ON public.services FOR SELECT TO authenticated
USING (is_client() AND is_active = true);

-- Client read active barbers
CREATE POLICY "Client read active barbers"
ON public.barbers FOR SELECT TO authenticated
USING (is_client() AND is_active = true);
