-- Re-grant SELECT to authenticated; RLS still gates rows per policy.
-- anon remains revoked, so anonymous users see zero rows from barbers.
GRANT SELECT ON public.barbers TO authenticated;