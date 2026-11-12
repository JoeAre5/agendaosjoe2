
REVOKE EXECUTE ON FUNCTION public.claim_benefit(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_active_benefit_voucher(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_benefit_code(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.redeem_benefit_code(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.expire_pending_benefit_redemptions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._gen_benefit_code() FROM PUBLIC, anon, authenticated;
