-- Allow authenticated clients (and anyone authenticated) to read the
-- subset of barber data exposed by barbers_public. Without this,
-- security_invoker view returned 0 rows for clients, so:
--   - /app/cliente "MY BARBER" stat showed Undetermined
--   - Step 1 of the booking flow showed no avatars
--
-- Mirrors the existing anon read; columns are non-sensitive
-- (no SSN, salary, commission_rate, etc.).
CREATE POLICY "Authenticated read active barbers (public fields)"
ON public.barbers
FOR SELECT
TO authenticated
USING (is_active = true);

-- Reset stored theme back to "system" for the user who got stuck in dark mode.
-- The client portal will then honor the OS-level preference (light by default).
UPDATE public.user_preferences
SET theme = 'system', updated_at = now()
WHERE id = '4a9e0841-4880-4d99-b261-d1651f1ecbc0' AND theme = 'dark';