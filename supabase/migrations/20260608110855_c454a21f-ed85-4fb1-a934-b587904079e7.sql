
-- 1. Column on booking_drafts to carry the voucher through to commit
ALTER TABLE public.booking_drafts
  ADD COLUMN IF NOT EXISTS applied_benefit_redemption_id uuid
    REFERENCES public.client_benefit_redemptions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_drafts_benefit_redemption
  ON public.booking_drafts (applied_benefit_redemption_id)
  WHERE applied_benefit_redemption_id IS NOT NULL;

-- 2. RPC: apply a benefit code to a pending draft (client portal flow)
CREATE OR REPLACE FUNCTION public.apply_benefit_code_to_draft(_code text, _draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _voucher record;
  _draft record;
  _caller_client_id uuid;
BEGIN
  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;
  _code := upper(trim(_code));

  SELECT * INTO _voucher FROM public.client_benefit_redemptions WHERE code = _code;
  IF _voucher.id IS NULL THEN RAISE EXCEPTION 'code_not_found'; END IF;
  IF _voucher.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'code_already_redeemed'; END IF;
  IF _voucher.void_reason IS NOT NULL OR _voucher.expires_at <= now() THEN
    RAISE EXCEPTION 'code_expired';
  END IF;

  SELECT id, client_id, status INTO _draft
  FROM public.booking_drafts WHERE id = _draft_id;
  IF _draft.id IS NULL THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  IF _draft.status <> 'pending' THEN RAISE EXCEPTION 'draft_not_pending'; END IF;
  IF _draft.client_id IS NULL OR _draft.client_id IS DISTINCT FROM _voucher.client_id THEN
    RAISE EXCEPTION 'code_belongs_to_other_client';
  END IF;

  -- Permission: owner, any barber, or the voucher's own client
  _caller_client_id := public.get_my_client_id();
  IF NOT (
    public.is_owner()
    OR public.has_role(auth.uid(), 'barber'::app_role)
    OR _caller_client_id = _voucher.client_id
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.booking_drafts
     SET applied_benefit_redemption_id = _voucher.id
   WHERE id = _draft.id;

  RETURN jsonb_build_object(
    'redemption_id', _voucher.id,
    'benefit_id', _voucher.benefit_id,
    'code', _voucher.code,
    'expires_at', _voucher.expires_at
  );
END $$;

GRANT EXECUTE ON FUNCTION public.apply_benefit_code_to_draft(text, uuid) TO authenticated, service_role;

-- 3. RPC: remove a benefit code from a pending draft
CREATE OR REPLACE FUNCTION public.remove_benefit_code_from_draft(_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _draft record;
  _caller_client_id uuid;
BEGIN
  SELECT id, client_id, status INTO _draft
  FROM public.booking_drafts WHERE id = _draft_id;
  IF _draft.id IS NULL THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  IF _draft.status <> 'pending' THEN RAISE EXCEPTION 'draft_not_pending'; END IF;

  _caller_client_id := public.get_my_client_id();
  IF NOT (
    public.is_owner()
    OR public.has_role(auth.uid(), 'barber'::app_role)
    OR (_caller_client_id IS NOT NULL AND _caller_client_id = _draft.client_id)
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.booking_drafts
     SET applied_benefit_redemption_id = NULL
   WHERE id = _draft.id;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.remove_benefit_code_from_draft(uuid) TO authenticated, service_role;
