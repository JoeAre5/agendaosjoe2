
-- Block all direct inserts to booking_drafts from anon/authenticated.
-- Only service_role (edge functions) can create drafts.
DROP POLICY IF EXISTS "booking_drafts_block_client_insert" ON public.booking_drafts;
CREATE POLICY "booking_drafts_block_client_insert"
ON public.booking_drafts
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);
