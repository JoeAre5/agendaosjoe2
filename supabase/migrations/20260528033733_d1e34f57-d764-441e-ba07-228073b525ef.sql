-- Restrict anonymous SELECT on referral_codes.owner_id (column-level lockdown).
-- Public read policy still returns rows where is_active=true, but PostgREST
-- will refuse SELECTs that include owner_id from the anon role.
-- Authenticated keeps full access (RPC get_referral_code_owner is the
-- canonical way to resolve owner_id for both anon and authenticated).
REVOKE SELECT ON public.referral_codes FROM anon;
GRANT SELECT (code, owner_type, is_active, created_at) ON public.referral_codes TO anon;