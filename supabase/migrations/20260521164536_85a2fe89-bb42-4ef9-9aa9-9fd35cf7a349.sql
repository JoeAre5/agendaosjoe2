CREATE OR REPLACE FUNCTION public.get_client_network_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  -- Owner-only (accept either is_owner() or admin role)
  IF NOT (public.is_owner() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH client_owners AS (
    SELECT ro.id AS owner_id, ro.slug, ro.owner_profile_id AS client_id, ro.created_at,
           c.first_name, c.last_name, c.email, c.phone
    FROM referral_owners ro
    JOIN clients c ON c.id = ro.owner_profile_id
    WHERE ro.owner_type = 'client' AND ro.active = true
  ),
  downline_stats AS (
    SELECT co.owner_id,
           COUNT(cra.id)::int AS referrals_count,
           COALESCE(SUM(CASE WHEN cra.attribution_status = 'active' THEN 1 ELSE 0 END), 0)::int AS active_referrals,
           MAX(cra.last_payment_at) AS last_payment_at
    FROM client_owners co
    LEFT JOIN client_referral_attributions cra ON cra.original_referral_owner_id = co.owner_id
    GROUP BY co.owner_id
  ),
  downline_spend AS (
    SELECT co.owner_id,
           COALESCE(SUM(t.amount_cents), 0)::bigint AS downline_spend_cents
    FROM client_owners co
    LEFT JOIN client_referral_attributions cra ON cra.original_referral_owner_id = co.owner_id
    LEFT JOIN transactions t ON t.client_id = cra.client_id AND t.status = 'completed'
    GROUP BY co.owner_id
  ),
  points_stats AS (
    SELECT co.client_id, COALESCE(SUM(crl.points), 0)::int AS balance
    FROM client_owners co
    LEFT JOIN client_rewards_ledger crl ON crl.client_id = co.client_id
    GROUP BY co.client_id
  )
  SELECT jsonb_build_object(
    'total_referrers', (SELECT COUNT(*) FROM client_owners),
    'total_referrals', COALESCE((SELECT SUM(referrals_count) FROM downline_stats), 0),
    'total_points', COALESCE((SELECT SUM(balance) FROM points_stats), 0),
    'referrers', COALESCE(jsonb_agg(jsonb_build_object(
      'client_id', co.client_id,
      'owner_id', co.owner_id,
      'slug', co.slug,
      'name', TRIM(COALESCE(co.first_name,'') || ' ' || COALESCE(co.last_name,'')),
      'email', co.email,
      'phone', co.phone,
      'created_at', co.created_at,
      'referrals_count', COALESCE(ds.referrals_count, 0),
      'active_referrals', COALESCE(ds.active_referrals, 0),
      'last_payment_at', ds.last_payment_at,
      'downline_spend_cents', COALESCE(dsp.downline_spend_cents, 0),
      'points_balance', COALESCE(ps.balance, 0)
    ) ORDER BY COALESCE(ds.referrals_count, 0) DESC, COALESCE(ps.balance, 0) DESC), '[]'::jsonb)
  )
  INTO _result
  FROM client_owners co
  LEFT JOIN downline_stats ds ON ds.owner_id = co.owner_id
  LEFT JOIN downline_spend dsp ON dsp.owner_id = co.owner_id
  LEFT JOIN points_stats ps ON ps.client_id = co.client_id;

  RETURN COALESCE(_result, jsonb_build_object('total_referrers',0,'total_referrals',0,'total_points',0,'referrers','[]'::jsonb));
END;
$function$;