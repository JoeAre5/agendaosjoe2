CREATE OR REPLACE FUNCTION public.set_client_birthday(_client_id uuid, _date_of_birth date, _appointment_id uuid DEFAULT NULL)
RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shop uuid; v_result date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'permission denied' USING ERRCODE='42501'; END IF;
  SELECT shop_id INTO v_shop FROM public.clients WHERE id=_client_id;
  IF v_shop IS NULL OR NOT (public.has_shop_role(v_shop,'owner') OR public.has_shop_role(v_shop,'super_owner') OR (public.has_shop_role(v_shop,'barber') AND EXISTS (SELECT 1 FROM public.appointments a WHERE a.id=_appointment_id AND a.client_id=_client_id AND a.shop_id=v_shop))) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE='42501';
  END IF;
  IF _date_of_birth > (now() AT TIME ZONE 'America/Puerto_Rico')::date THEN RAISE EXCEPTION 'invalid birthday'; END IF;
  UPDATE public.clients SET date_of_birth=_date_of_birth WHERE id=_client_id RETURNING date_of_birth INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.set_client_birthday(uuid,date,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_client_birthday(uuid,date,uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.grant_birthday_gifts_today()
RETURNS TABLE(redemption_id uuid,out_client_id uuid,first_name text,code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN; END $$;
COMMENT ON FUNCTION public.grant_birthday_gifts_today() IS 'Retired: birthdays are visual reminders only. No automatic grants or pushes.';
REVOKE ALL ON FUNCTION public.grant_birthday_gifts_today() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_birthday_gifts_today() TO service_role;
CREATE OR REPLACE FUNCTION public.get_active_benefit_voucher(_client_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _target uuid; _row jsonb;
BEGIN
 _target := COALESCE(_client_id,public.get_my_client_id());
 IF _target IS NULL THEN RETURN NULL; END IF;
 IF NOT (public.is_owner() OR _target=public.get_my_client_id()) THEN RAISE EXCEPTION 'permission denied' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(v) INTO _row FROM (
 SELECT r.id,r.code,r.points_cost,r.claimed_at,r.expires_at,r.benefit_id,b.title_es,b.title_en,b.icon
 FROM public.client_benefit_redemptions r JOIN public.rewards_benefits b ON b.id=r.benefit_id
 WHERE r.client_id=_target AND b.kind <> 'birthday' AND r.redeemed_at IS NULL AND r.void_reason IS NULL AND r.expires_at>now()
 ORDER BY r.claimed_at DESC LIMIT 1) v;
 RETURN _row;
END $$;