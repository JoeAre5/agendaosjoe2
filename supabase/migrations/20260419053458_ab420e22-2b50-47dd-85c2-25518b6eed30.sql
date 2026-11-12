-- Lock down Realtime Broadcast/Presence channels (realtime.messages).
-- Note: postgres_changes events are still gated by RLS on the source tables
-- (appointments, transactions, waitlist) — this migration only governs
-- Broadcast and Presence (private channel) features.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any prior permissive policies (idempotent)
DROP POLICY IF EXISTS "Staff can use Broadcast and Presence" ON realtime.messages;
DROP POLICY IF EXISTS "Staff can send Broadcast and Presence" ON realtime.messages;

-- Only authenticated staff (owner or barber) may receive Broadcast/Presence messages.
CREATE POLICY "Staff can use Broadcast and Presence"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_owner() OR public.is_barber()
);

-- Only authenticated staff (owner or barber) may publish Broadcast/Presence messages.
CREATE POLICY "Staff can send Broadcast and Presence"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_owner() OR public.is_barber()
);