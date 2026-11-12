-- ============================================================
-- Birthday gift system
-- One free haircut per client per year, on their birthday.
-- Lifecycle: granted -> claimed (by client via slide) -> redeemed (by barber at checkout)
-- Expires 30 days after the birthday.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_birthday_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  gift_year INT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  redeemed_appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  redeemed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, gift_year)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_birthday_gifts TO authenticated;
GRANT ALL ON public.client_birthday_gifts TO service_role;

ALTER TABLE public.client_birthday_gifts ENABLE ROW LEVEL SECURITY;

-- Clients can read their own gifts
CREATE POLICY "Clients can read their own birthday gifts"
ON public.client_birthday_gifts FOR SELECT
TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'barber')
);

-- No direct writes from clients/barbers — use RPCs
CREATE POLICY "Owners can manage birthday gifts"
ON public.client_birthday_gifts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'owner'))
WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE INDEX IF NOT EXISTS idx_birthday_gifts_client ON public.client_birthday_gifts(client_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_birthday_gifts_active ON public.client_birthday_gifts(client_id) WHERE redeemed_at IS NULL;

-- updated_at trigger
CREATE TRIGGER trg_birthday_gifts_updated_at
BEFORE UPDATE ON public.client_birthday_gifts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RPC: get active birthday gift for a client (server view)
-- Returns NULL if none active. "Active" = not redeemed AND not expired.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_birthday_gift(_client_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  gift_year INT,
  granted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
BEGIN
  -- Resolve target client: param wins; otherwise current auth user's own client row.
  IF _client_id IS NOT NULL THEN
    v_client_id := _client_id;
    -- Only owner/barber may query someone else
    IF NOT (
      public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'barber')
      OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.auth_user_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  ELSE
    SELECT c.id INTO v_client_id FROM public.clients c WHERE c.auth_user_id = auth.uid() LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT g.id, g.gift_year, g.granted_at, g.expires_at, g.claimed_at, g.redeemed_at
  FROM public.client_birthday_gifts g
  WHERE g.client_id = v_client_id
    AND g.redeemed_at IS NULL
    AND g.expires_at > now()
  ORDER BY g.granted_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_birthday_gift(UUID) TO authenticated;

-- ============================================================
-- RPC: claim_birthday_gift — client swipes to unlock
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_birthday_gift()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id UUID;
  v_gift_id UUID;
BEGIN
  SELECT c.id INTO v_client_id FROM public.clients c WHERE c.auth_user_id = auth.uid() LIMIT 1;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'No client profile'; END IF;

  UPDATE public.client_birthday_gifts
  SET claimed_at = COALESCE(claimed_at, now())
  WHERE client_id = v_client_id
    AND redeemed_at IS NULL
    AND expires_at > now()
  RETURNING id INTO v_gift_id;

  RETURN v_gift_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_birthday_gift() TO authenticated;

-- ============================================================
-- RPC: redeem_birthday_gift — barber applies gift at checkout
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_birthday_gift(_client_id UUID, _appointment_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gift_id UUID;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'barber')) THEN
    RAISE EXCEPTION 'Only owner/barber can redeem';
  END IF;

  UPDATE public.client_birthday_gifts
  SET redeemed_at = now(),
      redeemed_appointment_id = _appointment_id,
      redeemed_by = auth.uid()
  WHERE client_id = _client_id
    AND redeemed_at IS NULL
    AND expires_at > now()
    AND id = (
      SELECT id FROM public.client_birthday_gifts
      WHERE client_id = _client_id AND redeemed_at IS NULL AND expires_at > now()
      ORDER BY granted_at DESC LIMIT 1
    )
  RETURNING id INTO v_gift_id;

  IF v_gift_id IS NULL THEN
    RAISE EXCEPTION 'No active birthday gift to redeem for client %', _client_id;
  END IF;

  RETURN v_gift_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.redeem_birthday_gift(UUID, UUID) TO authenticated;

-- ============================================================
-- grant_birthday_gifts_today — idempotent daily insert
-- Runs in PR timezone. Returns array of newly-granted gift rows
-- (client_id, gift_id, first_name) so the caller can fire pushes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_birthday_gifts_today()
RETURNS TABLE (
  gift_id UUID,
  client_id UUID,
  first_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'America/Puerto_Rico')::date;
  v_year INT := EXTRACT(YEAR FROM v_today)::int;
BEGIN
  RETURN QUERY
  WITH ins AS (
    INSERT INTO public.client_birthday_gifts (client_id, gift_year, expires_at)
    SELECT c.id, v_year, ((v_today + INTERVAL '30 days')::date)::timestamptz
    FROM public.clients c
    WHERE c.date_of_birth IS NOT NULL
      AND EXTRACT(MONTH FROM c.date_of_birth) = EXTRACT(MONTH FROM v_today)
      AND EXTRACT(DAY   FROM c.date_of_birth) = EXTRACT(DAY   FROM v_today)
      AND c.deleted_at IS NULL
    ON CONFLICT (client_id, gift_year) DO NOTHING
    RETURNING id, client_id
  )
  SELECT i.id AS gift_id, i.client_id, c.first_name
  FROM ins i
  JOIN public.clients c ON c.id = i.client_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_birthday_gifts_today() TO service_role;