-- ============================================================
-- RLS HARDENING PASS (2026-05-19)
-- ============================================================

-- A. products / services: anon → authenticated only
DROP POLICY IF EXISTS "Barber read active products" ON public.products;
CREATE POLICY "Staff read active products"
  ON public.products FOR SELECT TO authenticated
  USING (public.is_barber() AND is_active = true);

DROP POLICY IF EXISTS "Barber read active services" ON public.services;
CREATE POLICY "Staff read active services"
  ON public.services FOR SELECT TO authenticated
  USING ((public.is_barber() OR public.is_owner()) AND is_active = true);

-- B. REVOKE EXECUTE from anon on staff/admin/internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.owner_purge_all_cancelled_unpaid()                              FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_hard_delete_appointment(uuid, text)                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_hard_delete_appointments_bulk(uuid[], text)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.staff_purge_cancelled_appointments(boolean)                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_client_safely(uuid)                                      FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_clients(uuid, uuid)                                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.relink_appointment(uuid, uuid)                                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.deactivate_referral_owner(uuid)                                 FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_barbers_payroll()                                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_shop_financial_config()                                     FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_referral_production(text, timestamptz, timestamptz)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_referral_performance()                                      FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_next_check_number()                                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_referral_code_owner(text)                                   FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_barbers_safe()                                              FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clients_barber_safe()                                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_barber_appointments_safe()                               FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_client_groups()                                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_client_referral_network(uuid)                               FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_push_subscribers()                                          FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_pending_badge_counts()                                      FROM anon;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)                                      FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer)                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)                          FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)                                      FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_stale_booking_drafts()                                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_challenges()                                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_referral_resets()                                         FROM anon;

-- C. Drop cosmetic service_role USING(true) policies (no-ops, service_role bypasses RLS)
DROP POLICY IF EXISTS "Service role full access admin_notification_prefs"   ON public.admin_notification_prefs;
DROP POLICY IF EXISTS "Service role full access admin_notification_rules"   ON public.admin_notification_rules;
DROP POLICY IF EXISTS "Service role full access blog analytics"             ON public.blog_analytics_events;
DROP POLICY IF EXISTS "Service role full access booking_drafts"             ON public.booking_drafts;
DROP POLICY IF EXISTS "Service role full access rules"                      ON public.booking_rules;
DROP POLICY IF EXISTS "Service role full access broadcast_receipts"         ON public.broadcast_receipts;
DROP POLICY IF EXISTS "Service role full access broadcasts"                 ON public.broadcasts;
DROP POLICY IF EXISTS "cra service"                                         ON public.client_referral_attributions;
DROP POLICY IF EXISTS "Service role full access contact_submissions"        ON public.contact_submissions;
DROP POLICY IF EXISTS "Service role full access debug_logs"                 ON public.debug_logs;
DROP POLICY IF EXISTS "Service role full access filho_conversations"       ON public.filho_conversations;
DROP POLICY IF EXISTS "Service role full access filho_identity_attempts"   ON public.filho_identity_attempts;
DROP POLICY IF EXISTS "Service role full access filho_messages"            ON public.filho_messages;
DROP POLICY IF EXISTS "Service role manage launch_checklist"               ON public.launch_checklist;
DROP POLICY IF EXISTS "Service role full access dispatch_log"              ON public.notification_dispatch_log;
DROP POLICY IF EXISTS "Service role full access template history"          ON public.notification_template_history;
DROP POLICY IF EXISTS "Service role full access templates"                 ON public.notification_templates;
DROP POLICY IF EXISTS "Service role full access pending_recurring_pushes"  ON public.pending_recurring_pushes;
DROP POLICY IF EXISTS "Service role full access push_subscriptions"        ON public.push_subscriptions;
DROP POLICY IF EXISTS "Service role full access recruitment_submissions"   ON public.recruitment_submissions;
DROP POLICY IF EXISTS "ref_log service"                                    ON public.referral_activity_log;
DROP POLICY IF EXISTS "Service role full access referral_attributions"     ON public.referral_attributions;
DROP POLICY IF EXISTS "Service role full access referral_codes"            ON public.referral_codes;
DROP POLICY IF EXISTS "ref_links service"                                  ON public.referral_links;
DROP POLICY IF EXISTS "ref_owners service"                                 ON public.referral_owners;
DROP POLICY IF EXISTS "ref_pay service"                                    ON public.referral_payments;
DROP POLICY IF EXISTS "ref_ranks service"                                  ON public.referral_ranks;
DROP POLICY IF EXISTS "rp service"                                         ON public.referral_reallocation_progress;
DROP POLICY IF EXISTS "ref_systems service"                                ON public.referral_systems;
DROP POLICY IF EXISTS "Service role full access addons"                    ON public.service_addons;
DROP POLICY IF EXISTS "Service role full access services"                  ON public.services;
DROP POLICY IF EXISTS "Service role full access waitlist_members"          ON public.waitlist_members;