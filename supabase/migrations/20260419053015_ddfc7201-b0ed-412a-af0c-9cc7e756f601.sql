-- SECURITY FIX: Restrict barber SELECT on barbers table to own row only.
-- Other barbers' non-sensitive fields are exposed via the barbers_public view.

DROP POLICY IF EXISTS "Barber read active barbers" ON public.barbers;

-- The "Barber read own record" policy already exists and covers the own-row case.
-- Verify it remains; if missing, recreate.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='barbers' AND policyname='Barber read own record'
  ) THEN
    CREATE POLICY "Barber read own record" ON public.barbers
      FOR SELECT TO authenticated
      USING (
        is_barber() AND id = (
          SELECT profiles.barber_id FROM profiles WHERE profiles.id = auth.uid()
        )
      );
  END IF;
END$$;

-- Convert barbers_public view to security_definer mode so it bypasses base-table RLS
-- and exposes ONLY the safe (non-sensitive) columns to all readers.
ALTER VIEW public.barbers_public SET (security_invoker = false);

-- Grant SELECT on the view to authenticated and anon (it already excludes sensitive fields).
GRANT SELECT ON public.barbers_public TO authenticated, anon;