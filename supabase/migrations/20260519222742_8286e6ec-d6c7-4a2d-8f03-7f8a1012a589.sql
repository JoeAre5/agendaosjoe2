CREATE OR REPLACE FUNCTION public.assign_client_referral(_client_id uuid, _slug text, _link_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner_id uuid;
  _existing record;
  _link_id_resolved uuid;
  _max_paid timestamptz;
BEGIN
  IF _client_id IS NULL OR _slug IS NULL THEN RETURN NULL; END IF;
  _owner_id := public.resolve_referral_slug(_slug);
  IF _owner_id IS NULL THEN RETURN NULL; END IF;

  IF _link_id IS NULL THEN
    SELECT id INTO _link_id_resolved FROM public.referral_links WHERE lower(slug)=lower(trim(_slug)) LIMIT 1;
  ELSE
    _link_id_resolved := _link_id;
  END IF;

  SELECT * INTO _existing FROM public.client_referral_attributions WHERE client_id = _client_id;

  IF _existing IS NULL THEN
    INSERT INTO public.client_referral_attributions
      (client_id, current_referral_owner_id, original_referral_owner_id, original_referral_link_id, attribution_status)
    VALUES (_client_id, _owner_id, _owner_id, _link_id_resolved, 'active');

    INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
    VALUES (_client_id, _owner_id, 'initial_attribution', 'Initial attribution via link');

    -- Backfill prior completed transactions so production is counted
    INSERT INTO public.referral_payments
      (client_id, appointment_id, transaction_id, referral_owner_id, amount_cents, payment_type, is_tip, source, paid_at)
    SELECT t.client_id, t.appointment_id, t.id, _owner_id,
           COALESCE(t.subtotal_cents, 0),
           CASE WHEN t.type='product' THEN 'product' ELSE 'partial' END,
           false, t.source, COALESCE(t.approved_at, t.created_at)
    FROM public.transactions t
    WHERE t.client_id = _client_id
      AND t.status = 'completed'
    ON CONFLICT DO NOTHING;

    SELECT MAX(COALESCE(approved_at, created_at)) INTO _max_paid
      FROM public.transactions WHERE client_id = _client_id AND status='completed';

    IF _max_paid IS NOT NULL THEN
      UPDATE public.client_referral_attributions
        SET last_payment_at = _max_paid
        WHERE client_id = _client_id;

      INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
      VALUES (_client_id, _owner_id, 'backfill_payments', 'Backfilled prior completed transactions on attribution');
    END IF;

    RETURN _owner_id;
  END IF;

  IF _existing.attribution_status = 'reset_available' THEN
    UPDATE public.client_referral_attributions
      SET current_referral_owner_id = _owner_id,
          original_referral_owner_id = _owner_id,
          original_referral_link_id = _link_id_resolved,
          attribution_status = 'active',
          reset_available_at = NULL,
          reallocated_at = NULL,
          reallocation_reason = NULL
      WHERE client_id = _client_id;

    INSERT INTO public.referral_activity_log (client_id, referral_owner_id, event_type, description)
    VALUES (_client_id, _owner_id, 'reattributed_after_reset', 'Re-attribution via link after 90-day reset');
    RETURN _owner_id;
  END IF;

  RETURN _existing.current_referral_owner_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public.assign_client_referral(uuid, text, uuid) FROM anon;