-- Create booking_drafts table to hold pre-payment booking intent.
-- Lifecycle: client creates draft → pays → server verifies payment, creates Acuity appointment, marks draft 'committed'.
-- If payment never happens, the draft is left as 'pending' and can be cleaned up by a cron later.

CREATE TABLE public.booking_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending', -- pending | committed | failed | refunded
  source text NOT NULL,                    -- 'public_site' | 'client_app'
  -- Booking selection (raw, server re-validates before sending to Acuity)
  appointment_type_id integer NOT NULL,
  calendar_id integer NOT NULL,
  barber_id uuid,                          -- resolved server-side; nullable until commit
  datetime text NOT NULL,                  -- ISO string from Acuity slot picker
  addon_ids integer[] DEFAULT '{}'::integer[],
  notes text,
  -- Client info (guest-friendly; client_id resolved server-side)
  client_id uuid,                          -- if logged-in client
  first_name text NOT NULL,
  last_name text,
  phone text NOT NULL,
  email text,
  -- Pricing (snapshot at draft time; server can override on commit)
  total_cents integer NOT NULL,
  tip_cents integer NOT NULL DEFAULT 0,
  -- Created appointment (set on successful commit)
  appointment_id uuid,
  acuity_id integer,
  -- Auth context
  created_by_user_id uuid,
  -- Timestamps & expiry
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes'),
  failure_reason text
);

CREATE INDEX idx_booking_drafts_status ON public.booking_drafts(status);
CREATE INDEX idx_booking_drafts_expires_at ON public.booking_drafts(expires_at);
CREATE INDEX idx_booking_drafts_client_id ON public.booking_drafts(client_id) WHERE client_id IS NOT NULL;

ALTER TABLE public.booking_drafts ENABLE ROW LEVEL SECURITY;

-- Only service role writes drafts (edge functions). Clients/barbers cannot read other users' drafts.
CREATE POLICY "Service role full access booking_drafts"
ON public.booking_drafts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Logged-in clients can read their own drafts (for receipt / debugging UI later)
CREATE POLICY "Client read own drafts"
ON public.booking_drafts
FOR SELECT
TO authenticated
USING (is_client() AND client_id = get_my_client_id());

-- Owners can read all drafts for support
CREATE POLICY "Owner read all drafts"
ON public.booking_drafts
FOR SELECT
TO authenticated
USING (is_owner());