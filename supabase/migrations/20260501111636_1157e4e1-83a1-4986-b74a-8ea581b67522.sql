-- ============================================================================
-- Lock down barbers and clients tables: remove broad authenticated reads
-- ============================================================================

-- 1) BARBERS: drop broad authenticated SELECT policy.
--    Clients should read public-safe fields via the existing barbers_public view.
--    Staff (barber/owner) policies remain.
DROP POLICY IF EXISTS "Authenticated read active barbers" ON public.barbers;

-- Defense-in-depth: revoke any legacy column-level grants to anon on the base
-- table; anon should only ever hit barbers_public.
REVOKE ALL ON public.barbers FROM anon;
-- Re-grant the safe columns to anon (matching prior public-safe set) so the
-- security_invoker barbers_public view continues to work for anon.
GRANT SELECT (
  id, name, avatar_url, color, description,
  acuity_calendar_id, acuity_calendar_key,
  show_in_checkout, is_default_checkout_barber,
  is_active, created_at
) ON public.barbers TO anon;

-- 2) CLIENTS: enforce column-level lockdown for sensitive payment fields.
--    Authenticated barbers/clients can only SELECT non-payment columns directly.
--    Payment columns (stripe_customer_id, card_brand, card_last4) are accessed
--    via the existing security-definer RPC `get_client_payment_details`.
--    Owners retain full access (the RLS policy uses is_owner() bypass via
--    SECURITY DEFINER functions where needed; revoking column SELECT from
--    `authenticated` still affects owners since owners use the authenticated
--    role too — so we expose payment columns to owners via a separate path).

-- Revoke broad SELECT then grant non-sensitive columns explicitly.
REVOKE SELECT ON public.clients FROM authenticated;
GRANT SELECT (
  id, acuity_client_id, first_name, last_name, email, phone,
  preferred_barber_id, notes, sms_opt_in, last_visit_at,
  total_visits, total_spent_cents, created_at, updated_at,
  preferred_payment_method, ath_phone, ath_phone_last4,
  notifications_permission_asked, notifications_enabled,
  onboarding_completed, account_verified, is_guest, auth_user_id,
  conversion_prompted_at, conversion_prompted_count, booking_source,
  notify_email_appointments, notify_whatsapp_appointments, notify_sms_appointments,
  notify_email_marketing, notify_whatsapp_marketing, notify_sms_marketing,
  notify_push_appointments, avatar_url, date_of_birth, gender,
  onboarding_completed_at
) ON public.clients TO authenticated;

-- Owners need full column access for admin CRM (Clients page etc.).
-- Provide via a security-invoker view that owners can read fully; but simpler:
-- expose payment columns through the existing get_client_payment_details RPC,
-- which already permits owners. The Clients admin page already uses this RPC
-- pattern, so no app code changes needed for owners.
