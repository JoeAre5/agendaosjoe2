DO $$
DECLARE v_name text; v_definition text;
BEGIN
 FOREACH v_name IN ARRAY ARRAY['apply_benefit_code','apply_benefit_code_to_draft'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO v_definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_name;
  IF v_definition IS NULL OR position('IF _benefit.id IS NULL THEN RAISE EXCEPTION ''benefit_not_found''; END IF;' IN v_definition)=0 THEN RAISE EXCEPTION 'Unexpected benefit function definition: %',v_name; END IF;
  v_definition := replace(v_definition,'IF _benefit.id IS NULL THEN RAISE EXCEPTION ''benefit_not_found''; END IF;', 'IF _benefit.id IS NULL THEN RAISE EXCEPTION ''benefit_not_found''; END IF;
  IF EXISTS (SELECT 1 FROM public.rewards_benefits b WHERE b.id=_voucher.benefit_id AND b.kind=''birthday'') THEN RAISE EXCEPTION ''birthday_benefit_retired''; END IF;');
  EXECUTE v_definition;
 END LOOP;
END $$;