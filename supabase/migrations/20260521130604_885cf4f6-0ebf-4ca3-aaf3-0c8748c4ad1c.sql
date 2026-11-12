REVOKE EXECUTE ON FUNCTION public.update_client_referral_slug(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_rewards_summary(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_referral_slug_available(text, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_client_referral_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_rewards_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_referral_slug_available(text, uuid) TO authenticated;