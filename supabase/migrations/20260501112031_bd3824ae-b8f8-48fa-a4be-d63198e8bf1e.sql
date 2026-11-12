-- Remove broad policies that exposed full rows to staff roles
DROP POLICY IF EXISTS "Staff read active barbers" ON public.barbers;
DROP POLICY IF EXISTS "Barber read clients (column-restricted)" ON public.clients;
DROP POLICY IF EXISTS "Barber select appointments" ON public.appointments;
DROP POLICY IF EXISTS "Barber read settings (column-restricted)" ON public.shop_settings;

-- Replace the public barber view so it never exposes Acuity API/calendar keys or payroll/SSN fields
DROP VIEW IF EXISTS public.barbers_public;
CREATE VIEW public.barbers_public
WITH (security_invoker = true) AS
SELECT
  b.id,
  b.name,
  b.avatar_url,
  b.color,
  b.description,
  b.acuity_calendar_id,
  b.show_in_checkout,
  b.is_default_checkout_barber,
  b.is_active,
  b.created_at
FROM public.barbers b
WHERE b.is_active = true;

-- Safe team directory for authenticated staff, excluding payroll, SSN, and API key fields
CREATE OR REPLACE FUNCTION public.get_barbers_safe()
RETURNS TABLE(
  id uuid,
  name text,
  avatar_url text,
  color text,
  description text,
  acuity_calendar_id integer,
  show_in_checkout boolean,
  is_default_checkout_barber boolean,
  is_active boolean,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.name,
    b.avatar_url,
    b.color,
    b.description,
    b.acuity_calendar_id,
    b.show_in_checkout,
    b.is_default_checkout_barber,
    b.is_active,
    b.created_at
  FROM public.barbers b
  WHERE b.is_active = true
    AND (public.is_owner() OR public.is_barber() OR public.is_client());
$$;

-- Safe client directory for barbers: no card, Stripe, ATH, DOB, notes, or spend fields
CREATE OR REPLACE FUNCTION public.get_clients_barber_safe()
RETURNS TABLE(
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  preferred_barber_id uuid,
  sms_opt_in boolean,
  last_visit_at timestamp with time zone,
  total_visits integer,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  acuity_client_id integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.email,
    c.phone,
    c.preferred_barber_id,
    c.sms_opt_in,
    c.last_visit_at,
    c.total_visits,
    c.created_at,
    c.updated_at,
    c.acuity_client_id
  FROM public.clients c
  WHERE public.is_owner() OR public.is_barber();
$$;

-- Safe appointment feed for barbers: own calendar only and no payment/reference/form/certificate fields
CREATE OR REPLACE FUNCTION public.get_my_barber_appointments_safe()
RETURNS TABLE(
  id uuid,
  acuity_id integer,
  barber_id uuid,
  client_id uuid,
  acuity_client_id integer,
  client_name text,
  client_email text,
  client_phone text,
  service_name text,
  service_id integer,
  addons text[],
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  duration_minutes integer,
  price_cents integer,
  notes text,
  label text,
  status text,
  is_recurring boolean,
  recurring_group_id uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  created_by_role text,
  created_by_user_id uuid,
  last_pushed_at timestamp with time zone,
  cancelled_by_role text,
  cancelled_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.acuity_id,
    a.barber_id,
    a.client_id,
    a.acuity_client_id,
    a.client_name,
    a.client_email,
    a.client_phone,
    a.service_name,
    a.service_id,
    a.addons,
    a.starts_at,
    a.ends_at,
    a.duration_minutes,
    a.price_cents,
    a.notes,
    a.label,
    a.status,
    a.is_recurring,
    a.recurring_group_id,
    a.created_at,
    a.updated_at,
    a.created_by_role,
    a.created_by_user_id,
    a.last_pushed_at,
    a.cancelled_by_role,
    a.cancelled_at
  FROM public.appointments a
  WHERE public.is_owner()
     OR (
      public.is_barber()
      AND a.barber_id = (
        SELECT p.barber_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
        LIMIT 1
      )
    );
$$;

-- Safe shop settings for barbers: operational fields only, no internal financial/legal config
CREATE OR REPLACE FUNCTION public.get_shop_settings_safe()
RETURNS TABLE(
  shop_name text,
  timezone text,
  address text,
  phone text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_owner() OR public.is_barber() OR public.is_client()) THEN
    RAISE EXCEPTION 'permission denied: shop settings';
  END IF;

  RETURN QUERY
    SELECT s.shop_name, s.timezone, s.address, s.phone, s.email
    FROM public.shop_settings s
    LIMIT 1;
END;
$$;

-- Lock down API execution to signed-in users only for the safe functions
REVOKE ALL ON FUNCTION public.get_barbers_safe() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_clients_barber_safe() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_barber_appointments_safe() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shop_settings_safe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_barbers_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clients_barber_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_barber_appointments_safe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shop_settings_safe() TO authenticated;

-- Keep owner and self-only access to sensitive base rows via the remaining policies.
-- Barbers still keep their own barber row through "Barber read own record".
-- Clients still keep their own client row through "Client read own profile".
-- Owners still keep full access through owner policies.