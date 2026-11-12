
-- 1) Catalog columns
ALTER TABLE public.rewards_benefits
  ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'service_full'
    CHECK (discount_type IN ('service_full','service_cap')),
  ADD COLUMN IF NOT EXISTS discount_value_cents integer,
  ADD COLUMN IF NOT EXISTS service_name_match text;

-- 2) Draft + appointment tracking columns
ALTER TABLE public.booking_drafts
  ADD COLUMN IF NOT EXISTS benefit_discount_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS benefit_discount_cents integer NOT NULL DEFAULT 0;

-- 3) Seed active benefits
UPDATE public.rewards_benefits
   SET discount_type = 'service_cap',
       discount_value_cents = 4000,
       service_name_match = NULL
 WHERE title_es ILIKE 'Recorte Gratis' OR kind = 'birthday';

UPDATE public.rewards_benefits
   SET discount_type = 'service_full',
       discount_value_cents = NULL,
       service_name_match = 'LA EXPERIENCIA'
 WHERE title_es ILIKE '%Experiencia VIP%';

-- 4) Rewrite apply_benefit_code_to_draft (eligibility + discount math)
CREATE OR REPLACE FUNCTION public.apply_benefit_code_to_draft(_code text, _draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _voucher record;
  _draft record;
  _benefit record;
  _caller_client_id uuid;
  _service_name text;
  _service_price_cents int;
  _discount_cents int;
  _new_total_cents int;
  _existing_discount int;
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

  SELECT id, client_id, status, total_cents, tip_cents,
         appointment_type_id, benefit_discount_cents,
         applied_benefit_redemption_id
    INTO _draft
  FROM public.booking_drafts WHERE id = _draft_id;
  IF _draft.id IS NULL THEN RAISE EXCEPTION 'draft_not_found'; END IF;
  IF _draft.status <> 'pending' THEN RAISE EXCEPTION 'draft_not_pending'; END IF;
  IF _draft.client_id IS NULL OR _draft.client_id IS DISTINCT FROM _voucher.client_id THEN
    RAISE EXCEPTION 'code_belongs_to_other_client';
  END IF;

  _caller_client_id := public.get_my_client_id();
  IF NOT (
    public.is_owner()
    OR public.has_role(auth.uid(), 'barber'::app_role)
    OR _caller_client_id = _voucher.client_id
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  -- Load benefit rules
  SELECT id, title_es, title_en, kind, discount_type, discount_value_cents,
         service_name_match
    INTO _benefit
  FROM public.rewards_benefits
  WHERE id = _voucher.benefit_id;
  IF _benefit.id IS NULL THEN RAISE EXCEPTION 'benefit_not_found'; END IF;

  -- Resolve main service from Acuity appointment type
  SELECT name, price_cents
    INTO _service_name, _service_price_cents
  FROM public.services
  WHERE acuity_type_id = _draft.appointment_type_id
  LIMIT 1;
  IF _service_name IS NULL THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;

  -- Eligibility: service name match
  IF _benefit.service_name_match IS NOT NULL
     AND _service_name NOT ILIKE '%' || _benefit.service_name_match || '%' THEN
    RAISE EXCEPTION 'benefit_not_eligible_for_service';
  END IF;

  -- Compute discount on the main service price
  IF _benefit.discount_type = 'service_full' THEN
    _discount_cents := COALESCE(_service_price_cents, 0);
  ELSIF _benefit.discount_type = 'service_cap' THEN
    _discount_cents := LEAST(
      COALESCE(_service_price_cents, 0),
      COALESCE(_benefit.discount_value_cents, 0)
    );
  ELSE
    _discount_cents := 0;
  END IF;

  -- Reverse any prior benefit discount on this draft, then apply the new one
  _existing_discount := COALESCE(_draft.benefit_discount_cents, 0);
  _new_total_cents := GREATEST(
    0,
    COALESCE(_draft.total_cents, 0) + _existing_discount - _discount_cents
  );

  UPDATE public.booking_drafts
     SET applied_benefit_redemption_id = _voucher.id,
         benefit_discount_cents = _discount_cents,
         total_cents = _new_total_cents
   WHERE id = _draft.id;

  RETURN jsonb_build_object(
    'redemption_id', _voucher.id,
    'benefit_id', _voucher.benefit_id,
    'benefit_title_es', _benefit.title_es,
    'benefit_title_en', _benefit.title_en,
    'code', _voucher.code,
    'expires_at', _voucher.expires_at,
    'discount_cents', _discount_cents,
    'new_total_cents', _new_total_cents,
    'service_name', _service_name,
    'service_price_cents', _service_price_cents
  );
END $function$;

-- 5) remove_benefit_code_from_draft: also reverse discount on total
CREATE OR REPLACE FUNCTION public.remove_benefit_code_from_draft(_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _draft record;
  _caller_client_id uuid;
  _restored_total int;
BEGIN
  SELECT id, client_id, status, total_cents, benefit_discount_cents
    INTO _draft
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

  _restored_total := COALESCE(_draft.total_cents, 0) + COALESCE(_draft.benefit_discount_cents, 0);

  UPDATE public.booking_drafts
     SET applied_benefit_redemption_id = NULL,
         benefit_discount_cents = 0,
         total_cents = _restored_total
   WHERE id = _draft.id;

  RETURN jsonb_build_object('ok', true, 'new_total_cents', _restored_total);
END $function$;

-- 6) Rewrite apply_benefit_code (appointment-level, used by barber CheckoutTab)
CREATE OR REPLACE FUNCTION public.apply_benefit_code(_code text, _appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _voucher record;
  _appt record;
  _benefit record;
  _caller_client_id uuid;
  _discount_cents int;
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

  SELECT id, client_id, service_name, price_cents
    INTO _appt
  FROM public.appointments WHERE id = _appointment_id;
  IF _appt.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF _appt.client_id IS DISTINCT FROM _voucher.client_id THEN
    RAISE EXCEPTION 'code_belongs_to_other_client';
  END IF;

  _caller_client_id := public.get_my_client_id();
  IF NOT (
    public.is_owner()
    OR public.has_role(auth.uid(), 'barber'::app_role)
    OR _caller_client_id = _voucher.client_id
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT id, title_es, title_en, discount_type, discount_value_cents, service_name_match
    INTO _benefit
  FROM public.rewards_benefits WHERE id = _voucher.benefit_id;
  IF _benefit.id IS NULL THEN RAISE EXCEPTION 'benefit_not_found'; END IF;

  IF _benefit.service_name_match IS NOT NULL
     AND COALESCE(_appt.service_name, '') NOT ILIKE '%' || _benefit.service_name_match || '%' THEN
    RAISE EXCEPTION 'benefit_not_eligible_for_service';
  END IF;

  IF _benefit.discount_type = 'service_full' THEN
    _discount_cents := COALESCE(_appt.price_cents, 0);
  ELSIF _benefit.discount_type = 'service_cap' THEN
    _discount_cents := LEAST(
      COALESCE(_appt.price_cents, 0),
      COALESCE(_benefit.discount_value_cents, 0)
    );
  ELSE
    _discount_cents := 0;
  END IF;

  UPDATE public.appointments
     SET applied_benefit_redemption_id = _voucher.id,
         benefit_discount_cents = _discount_cents
   WHERE id = _appt.id;

  RETURN jsonb_build_object(
    'redemption_id', _voucher.id,
    'benefit_id', _voucher.benefit_id,
    'benefit_title_es', _benefit.title_es,
    'benefit_title_en', _benefit.title_en,
    'discount_cents', _discount_cents,
    'expires_at', _voucher.expires_at
  );
END $function$;
