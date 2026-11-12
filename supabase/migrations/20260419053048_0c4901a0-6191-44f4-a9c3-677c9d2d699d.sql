-- Step 1: Revert view to security_invoker (removes the DEFINER warning)
ALTER VIEW public.barbers_public SET (security_invoker = true);

-- Step 2: Restore broad read policy on barbers, but ONLY for non-sensitive columns
-- via column-level GRANT/REVOKE on the authenticated role.
CREATE POLICY "Barber read active barbers" ON public.barbers
  FOR SELECT TO authenticated
  USING (is_barber() AND is_active = true);

-- Step 3: Revoke SELECT on sensitive columns from authenticated role.
-- This means even if RLS lets a barber see a row, Postgres column ACLs block these fields.
REVOKE SELECT (ssn_last4, weekly_salary, commission_rate, retention_rate, bonus_threshold_cents, employee_id)
  ON public.barbers FROM authenticated;

-- Step 4: Owners need to read these columns for payroll/reports. Provide a SECURITY DEFINER
-- function that returns the full barber payroll dataset only for owners.
CREATE OR REPLACE FUNCTION public.get_barbers_payroll()
RETURNS TABLE (
  id uuid,
  name text,
  color text,
  employment_type public.employment_type,
  commission_rate numeric,
  retention_rate numeric,
  weekly_salary integer,
  bonus_threshold_cents integer,
  employee_id text,
  ssn_last4 text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.color, b.employment_type, b.commission_rate, b.retention_rate,
         b.weekly_salary, b.bonus_threshold_cents, b.employee_id, b.ssn_last4, b.is_active
  FROM public.barbers b
  WHERE b.is_active = true
    AND (
      public.is_owner()
      -- Barbers may also call this but receive only their own row
      OR (public.is_barber() AND b.id = (SELECT profiles.barber_id FROM public.profiles WHERE profiles.id = auth.uid()))
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_barbers_payroll() TO authenticated;