CREATE OR REPLACE FUNCTION public.get_internal_network_kpis()
RETURNS TABLE(
  total_production_cents bigint,
  attributed_clients_count bigint,
  active_links_count bigint,
  near_reset_count bigint,
  pending_validation_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_owner() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(p.amount_cents)::bigint
      FROM public.referral_payments p
      JOIN public.referral_owners o ON o.id = p.referral_owner_id
      WHERE NOT p.is_tip
        AND NOT p.is_refund
        AND o.owner_type IN ('barber','shop')
    ), 0) AS total_production_cents,

    COALESCE((
      SELECT COUNT(*)::bigint
      FROM public.client_referral_attributions a
      JOIN public.referral_owners o ON o.id = a.current_referral_owner_id
      WHERE a.attribution_status = 'active'
        AND o.owner_type IN ('barber','shop')
    ), 0) AS attributed_clients_count,

    COALESCE((
      SELECT COUNT(*)::bigint
      FROM public.referral_links l
      JOIN public.referral_owners o ON o.id = l.referral_owner_id
      WHERE l.status = 'active'
        AND o.owner_type IN ('barber','shop')
    ), 0) AS active_links_count,

    COALESCE((
      SELECT COUNT(*)::bigint
      FROM public.client_referral_attributions a
      JOIN public.referral_owners o ON o.id = a.current_referral_owner_id
      WHERE a.attribution_status = 'active'
        AND o.owner_type IN ('barber','shop')
        AND a.last_payment_at IS NOT NULL
        AND (now() - a.last_payment_at) >= interval '75 days'
        AND (now() - a.last_payment_at) <  interval '90 days'
    ), 0) AS near_reset_count,

    COALESCE((
      SELECT COUNT(*)::bigint
      FROM public.client_referral_attributions a
      JOIN public.referral_owners o ON o.id = a.current_referral_owner_id
      WHERE a.attribution_status = 'active'
        AND o.owner_type IN ('barber','shop')
        AND a.last_payment_at IS NULL
    ), 0) AS pending_validation_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_internal_network_kpis() TO authenticated;