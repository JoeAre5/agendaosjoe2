-- Admin duplicate review, isolated from appointment/payment mutation paths.
CREATE TABLE public.client_duplicate_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id),
  fingerprint text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('preserve', 'postpone')),
  client_ids uuid[] NOT NULL,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (shop_id, fingerprint)
);
GRANT SELECT ON public.client_duplicate_decisions TO authenticated;
GRANT ALL ON public.client_duplicate_decisions TO service_role;
ALTER TABLE public.client_duplicate_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY duplicate_decisions_admin_read ON public.client_duplicate_decisions
FOR SELECT TO authenticated USING (
  auth.uid() IS NOT NULL AND (public.is_super_admin() OR
    (public.is_owner() AND public.has_shop_role(shop_id, 'owner')))
);

CREATE FUNCTION public.assert_duplicate_review_admin(_shop uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR _shop IS NULL OR NOT
    (public.is_super_admin() OR (public.is_owner() AND public.has_shop_role(_shop, 'owner'))) THEN
    RAISE EXCEPTION 'permission denied: shop owner required' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE FUNCTION public.duplicate_review_fingerprint(_ids uuid[]) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT md5(coalesce(jsonb_agg(jsonb_build_array(id, first_name, last_name, email, phone)
    ORDER BY id)::text, '[]')) FROM public.clients WHERE id = ANY(_ids)
$$;

CREATE OR REPLACE FUNCTION public.find_duplicate_client_groups()
RETURNS TABLE(group_key text, match_type text, client_ids uuid[], client_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _shop uuid := public.current_shop_id();
BEGIN
  PERFORM public.assert_duplicate_review_admin(_shop);
  RETURN QUERY
  WITH scoped AS (SELECT * FROM public.clients WHERE shop_id = _shop),
  email_groups AS (
    SELECT public.normalize_email(email) AS k, 'email'::text AS mt,
      array_agg(id ORDER BY total_visits DESC NULLS LAST, created_at ASC) AS ids, count(*)::int AS n
    FROM scoped WHERE public.normalize_email(email) IS NOT NULL
    GROUP BY public.normalize_email(email) HAVING count(*) >= 2
  ), phone_groups AS (
    SELECT public.normalize_phone(phone) AS k, 'phone'::text AS mt,
      array_agg(id ORDER BY total_visits DESC NULLS LAST, created_at ASC) AS ids, count(*)::int AS n
    FROM scoped WHERE public.normalize_phone(phone) IS NOT NULL
    GROUP BY public.normalize_phone(phone) HAVING count(*) >= 2
  ), name_groups AS (
    SELECT lower(regexp_replace(trim(first_name || ' ' || coalesce(nullif(trim(last_name), '.'), '')), '\s+', ' ', 'g')) AS k,
      'name'::text AS mt,
      array_agg(id ORDER BY (public.normalize_phone(phone) IS NOT NULL) DESC, total_visits DESC NULLS LAST, created_at ASC) AS ids,
      count(*)::int AS n
    FROM scoped WHERE coalesce(trim(first_name), '') <> '' AND coalesce(nullif(trim(last_name), '.'), '') <> ''
    GROUP BY 1 HAVING count(*) >= 2
  ), candidates AS (
    SELECT * FROM email_groups UNION ALL SELECT * FROM phone_groups UNION ALL SELECT * FROM name_groups
  )
  SELECT g.k, g.mt, g.ids, g.n FROM candidates g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.client_duplicate_decisions d
    WHERE d.shop_id = _shop AND d.fingerprint = public.duplicate_review_fingerprint(g.ids)
      AND (d.decision = 'preserve' OR d.expires_at > now())
  ) ORDER BY g.mt, g.n DESC;
END $$;

CREATE FUNCTION public.record_duplicate_review_decision(_ids uuid[], _decision text, _fingerprint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _shop uuid := public.current_shop_id(); _current text;
BEGIN
  PERFORM public.assert_duplicate_review_admin(_shop);
  IF _decision NOT IN ('preserve', 'postpone') OR _decision IS NULL OR cardinality(_ids) < 2 THEN
    RAISE EXCEPTION 'invalid duplicate decision';
  END IF;
  PERFORM id FROM public.clients WHERE id = ANY(_ids) AND shop_id = _shop ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.clients WHERE id = ANY(_ids) AND shop_id = _shop) <> cardinality(_ids) THEN
    RAISE EXCEPTION 'invalid client group';
  END IF;
  _current := public.duplicate_review_fingerprint(_ids);
  IF _current IS DISTINCT FROM _fingerprint THEN RAISE EXCEPTION 'profiles changed: refresh first'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.find_duplicate_client_groups() g
    WHERE g.client_ids @> _ids AND g.client_ids <@ _ids) THEN
    RAISE EXCEPTION 'duplicate group changed: refresh first';
  END IF;
  INSERT INTO public.client_duplicate_decisions(shop_id, fingerprint, decision, client_ids, decided_by, expires_at)
  VALUES (_shop, _current, _decision, _ids, auth.uid(),
    CASE WHEN _decision = 'postpone' THEN now() + interval '30 days' ELSE NULL END)
  ON CONFLICT (shop_id, fingerprint) DO UPDATE SET decision = EXCLUDED.decision,
    decided_by = auth.uid(), decided_at = now(), expires_at = EXCLUDED.expires_at;
END $$;

-- Conservatively treat every client-linked historical record as non-empty.
-- Catalog enumeration includes FK columns and known UUID references lacking FKs.
CREATE FUNCTION public.duplicate_client_dependencies(_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _found boolean; _reasons text[] := '{}'; _c public.clients%ROWTYPE;
BEGIN
  SELECT * INTO _c FROM public.clients WHERE id = _id;
  IF _c.auth_user_id IS NOT NULL OR _c.account_verified OR EXISTS (
    SELECT 1 FROM auth.users u WHERE public.normalize_email(u.email) = public.normalize_email(_c.email)
      AND u.email_confirmed_at IS NOT NULL
  ) THEN _reasons := array_append(_reasons, 'account'); END IF;
  FOR r IN
    SELECT DISTINCT n.nspname AS ns, t.relname AS tbl, a.attname AS col
    FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND t.relkind IN ('r','p') AND a.atttypid = 'uuid'::regtype
      AND (a.attname IN ('client_id','booked_for_member_id','referrer_client_id','referred_client_id',
        'source_referral_client_id','matched_client_id','original_client_id','restored_to_client_id')
        OR (t.relname = 'referral_owners' AND a.attname = 'owner_profile_id')
        OR EXISTS (SELECT 1 FROM pg_constraint f WHERE f.contype = 'f' AND f.conrelid = t.oid
          AND f.confrelid = 'public.clients'::regclass AND a.attnum = ANY(f.conkey)))
    ORDER BY 1,2,3
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)', r.ns,r.tbl,r.col)
      INTO _found USING _id;
    IF _found THEN _reasons := array_append(_reasons, r.tbl); END IF;
  END LOOP;
  RETURN _reasons;
END $$;

CREATE FUNCTION public.get_duplicate_review_profiles(_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _shop uuid := public.current_shop_id(); _result jsonb;
BEGIN
  PERFORM public.assert_duplicate_review_admin(_shop);
  IF cardinality(_ids) > 1000 THEN RAISE EXCEPTION 'too many profiles'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'first_name', c.first_name, 'last_name', c.last_name, 'email', c.email, 'phone', c.phone,
    'created_at', c.created_at, 'auth_user_id', c.auth_user_id, 'acuity_client_id', c.acuity_client_id,
    'dependencies', public.duplicate_client_dependencies(c.id))), '[]'::jsonb)
  INTO _result FROM public.clients c WHERE c.shop_id = _shop AND c.id = ANY(_ids);
  RETURN _result;
END $$;

CREATE FUNCTION public.get_duplicate_review_fingerprint(_ids uuid[]) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _shop uuid := public.current_shop_id();
BEGIN
  PERFORM public.assert_duplicate_review_admin(_shop);
  IF (SELECT count(*) FROM public.clients WHERE id = ANY(_ids) AND shop_id = _shop) <> cardinality(_ids)
    THEN RAISE EXCEPTION 'invalid client group'; END IF;
  RETURN public.duplicate_review_fingerprint(_ids);
END $$;

CREATE FUNCTION public.edit_duplicate_review_profile(_id uuid, _first text, _last text, _phone text, _email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _shop uuid; _email_clean text := public.normalize_email(_email);
BEGIN
  SELECT shop_id INTO _shop FROM public.clients WHERE id = _id FOR UPDATE;
  PERFORM public.assert_duplicate_review_admin(_shop);
  IF coalesce(trim(_first), '') = '' THEN RAISE EXCEPTION 'first name required'; END IF;
  IF _email_clean ~ '@placeholders?\.local$' THEN _email_clean := NULL; END IF;
  IF _email_clean IS NOT NULL AND _email_clean !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid email';
  END IF;
  UPDATE public.clients SET first_name = trim(_first), last_name = nullif(trim(_last), ''),
    phone = nullif(trim(_phone), ''), email = _email_clean WHERE id = _id;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'duplicate_profile_edit', 'client', _id, jsonb_build_object('shop_id',_shop));
END $$;

CREATE FUNCTION public.delete_empty_duplicate_profile(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _shop uuid; _reasons text[]; r record;
BEGIN
  SELECT shop_id INTO _shop FROM public.clients WHERE id = _id FOR UPDATE;
  PERFORM public.assert_duplicate_review_admin(_shop);
  -- FK writers wait on the locked client. Unconstrained reference writers need a
  -- brief shared table lock so a record cannot appear between the check/delete.
  FOR r IN
    SELECT DISTINCT n.nspname AS ns, t.relname AS tbl FROM pg_class t
    JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='public' AND t.relkind IN ('r','p') AND a.atttypid='uuid'::regtype
      AND (a.attname IN ('client_id','booked_for_member_id','referrer_client_id','referred_client_id',
        'source_referral_client_id','matched_client_id','original_client_id','restored_to_client_id')
        OR (t.relname='referral_owners' AND a.attname='owner_profile_id'))
      AND NOT EXISTS (SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=t.oid
        AND f.confrelid='public.clients'::regclass AND a.attnum=ANY(f.conkey))
    ORDER BY 1,2
  LOOP
    EXECUTE format('LOCK TABLE %I.%I IN SHARE MODE NOWAIT',r.ns,r.tbl);
  END LOOP;
  _reasons := public.duplicate_client_dependencies(_id);
  IF cardinality(_reasons) > 0 THEN RAISE EXCEPTION 'profile is not empty: edit or merge instead'; END IF;
  INSERT INTO public.audit_log(user_id, action, entity_type, entity_id, metadata)
    VALUES(auth.uid(), 'delete_empty_duplicate_profile', 'client', _id, jsonb_build_object('shop_id',_shop));
  DELETE FROM public.clients WHERE id = _id;
END $$;

CREATE FUNCTION public.merge_duplicate_review_pair(_keep_id uuid, _discard_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _shop uuid; _other_shop uuid; _keep_auth uuid; _discard_auth uuid;
BEGIN
  PERFORM id FROM public.clients WHERE id IN (_keep_id,_discard_id) ORDER BY id FOR UPDATE;
  SELECT shop_id, auth_user_id INTO _shop,_keep_auth FROM public.clients WHERE id=_keep_id;
  SELECT shop_id, auth_user_id INTO _other_shop,_discard_auth FROM public.clients WHERE id=_discard_id;
  PERFORM public.assert_duplicate_review_admin(_shop);
  IF _other_shop IS DISTINCT FROM _shop THEN RAISE EXCEPTION 'invalid shop for merge'; END IF;
  IF _keep_auth IS NOT NULL AND _discard_auth IS NOT NULL AND _keep_auth <> _discard_auth THEN
    RAISE EXCEPTION 'different app accounts: preserve both';
  END IF;
  RETURN public.merge_clients(_keep_id, _discard_id);
END $$;

REVOKE ALL ON FUNCTION public.assert_duplicate_review_admin(uuid), public.duplicate_review_fingerprint(uuid[]),
  public.duplicate_client_dependencies(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_duplicate_client_groups(),
  public.record_duplicate_review_decision(uuid[],text,text), public.get_duplicate_review_profiles(uuid[]),
  public.get_duplicate_review_fingerprint(uuid[]), public.edit_duplicate_review_profile(uuid,text,text,text,text),
  public.delete_empty_duplicate_profile(uuid), public.merge_duplicate_review_pair(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_duplicate_client_groups(),
  public.record_duplicate_review_decision(uuid[],text,text), public.get_duplicate_review_profiles(uuid[]),
  public.get_duplicate_review_fingerprint(uuid[]), public.edit_duplicate_review_profile(uuid,text,text,text,text),
  public.delete_empty_duplicate_profile(uuid), public.merge_duplicate_review_pair(uuid,uuid) TO authenticated;
