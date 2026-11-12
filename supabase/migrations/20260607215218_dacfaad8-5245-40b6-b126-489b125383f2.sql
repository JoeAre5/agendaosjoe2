-- Tighten rewards eligibility: only PWA (client portal) bookings earn points.
CREATE OR REPLACE FUNCTION public.compute_rewards_eligibility(
  _booking_source text,
  _client_id uuid
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  _eligible boolean := false;
  _reason   text := 'unknown_source';
BEGIN
  IF _client_id IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'reason', 'no_client_attached');
  END IF;

  CASE _booking_source
    WHEN 'pwa'               THEN _eligible := true;  _reason := 'pwa_client_booking';
    WHEN 'public_referral'   THEN _eligible := false; _reason := 'public_referral_not_eligible';
    WHEN 'public_site'       THEN _eligible := false; _reason := 'public_site_not_eligible';
    WHEN 'post_booking_link' THEN _eligible := false; _reason := 'post_booking_link_not_eligible';
    WHEN 'walk_in'           THEN _eligible := false; _reason := 'walk_in_not_eligible';
    WHEN 'phone'             THEN _eligible := false; _reason := 'phone_booking_not_eligible';
    WHEN 'admin_manual'      THEN _eligible := false; _reason := 'admin_manual_not_eligible';
    WHEN 'barber_manual'     THEN _eligible := false; _reason := 'barber_manual_not_eligible';
    WHEN 'acuity_sync'       THEN _eligible := false; _reason := 'acuity_sync_not_eligible';
    ELSE _eligible := false; _reason := 'unknown_source';
  END CASE;

  RETURN jsonb_build_object('eligible', _eligible, 'reason', _reason);
END $$;

-- Re-stamp every appointment so is_rewards_eligible reflects the new rule.
UPDATE public.appointments
SET booking_source = booking_source
WHERE booking_source IS NOT NULL;