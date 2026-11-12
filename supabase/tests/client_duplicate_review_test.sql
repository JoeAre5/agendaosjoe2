-- Run only with client_duplicate_review_bootstrap.sql in disposable PostgreSQL.
INSERT INTO shops VALUES ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO shop_memberships VALUES
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','owner'),
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','barber');
SELECT set_config('test.user_id','20000000-0000-0000-0000-000000000001',false);
INSERT INTO clients(id,shop_id,first_name,last_name,email,phone) SELECT
  ('30000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  '10000000-0000-0000-0000-000000000001','Same','Person',NULL,NULL FROM generate_series(1,15) i;
INSERT INTO appointments VALUES ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',NULL,'cancelled',3000);
INSERT INTO appointments VALUES ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003',NULL,'scheduled',5000);
INSERT INTO transactions VALUES ('50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',2500);
INSERT INTO loyalty_points VALUES ('30000000-0000-0000-0000-000000000005',10);
INSERT INTO client_rewards_ledger VALUES ('30000000-0000-0000-0000-000000000006',20);
UPDATE clients SET auth_user_id='60000000-0000-0000-0000-000000000001' WHERE id='30000000-0000-0000-0000-000000000007';
UPDATE clients SET email='verified@example.test' WHERE id='30000000-0000-0000-0000-000000000008';
INSERT INTO auth.users VALUES ('60000000-0000-0000-0000-000000000002','verified@example.test',now());
INSERT INTO booking_drafts VALUES ('70000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009');
INSERT INTO appointments VALUES ('40000000-0000-0000-0000-000000000003',NULL,'30000000-0000-0000-0000-000000000010','scheduled',3000);
UPDATE clients SET shop_id='10000000-0000-0000-0000-000000000002' WHERE id='30000000-0000-0000-0000-000000000011';
CREATE TEMP TABLE snapshot AS SELECT jsonb_agg(to_jsonb(a)) AS data FROM appointments a;
CREATE TEMP TABLE payments_snapshot AS SELECT jsonb_agg(to_jsonb(t)) AS data FROM transactions t;
DO $$ DECLARE i int; _blocked boolean; BEGIN
  FOR i IN 2..10 LOOP
    _blocked:=false;
    BEGIN PERFORM delete_empty_duplicate_profile(('30000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid);
    EXCEPTION WHEN raise_exception THEN _blocked:=true; END;
    IF NOT _blocked THEN RAISE EXCEPTION 'protected profile % deleted',i; END IF;
  END LOOP;
  IF (SELECT count(*) FROM clients WHERE id IN (SELECT client_id FROM appointments))<>2 THEN RAISE EXCEPTION 'linked profiles lost'; END IF;
  IF (SELECT jsonb_agg(to_jsonb(a)) FROM appointments a) IS DISTINCT FROM (SELECT data FROM snapshot) THEN RAISE EXCEPTION 'appointments changed'; END IF;
  IF (SELECT jsonb_agg(to_jsonb(t)) FROM transactions t) IS DISTINCT FROM (SELECT data FROM payments_snapshot) THEN RAISE EXCEPTION 'payments changed'; END IF;
END $$;
SELECT delete_empty_duplicate_profile('30000000-0000-0000-0000-000000000001');
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM clients WHERE id='30000000-0000-0000-0000-000000000001') THEN RAISE EXCEPTION 'empty profile not deleted'; END IF;
  IF NOT EXISTS(SELECT 1 FROM clients WHERE id='30000000-0000-0000-0000-000000000012') THEN RAISE EXCEPTION 'other duplicate deleted'; END IF;
  BEGIN PERFORM delete_empty_duplicate_profile('30000000-0000-0000-0000-000000000011'); RAISE EXCEPTION 'cross shop allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.user_id','20000000-0000-0000-0000-000000000002',false);
DO $$ BEGIN
  BEGIN PERFORM delete_empty_duplicate_profile('30000000-0000-0000-0000-000000000012'); RAISE EXCEPTION 'barber allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM get_duplicate_review_profiles(ARRAY['30000000-0000-0000-0000-000000000012'::uuid]); RAISE EXCEPTION 'barber read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.user_id','',false);
DO $$ BEGIN
  BEGIN PERFORM find_duplicate_client_groups(); RAISE EXCEPTION 'anonymous allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_function_privilege('anon','public.delete_empty_duplicate_profile(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anon execute granted'; END IF;
  IF has_function_privilege('authenticated','public.duplicate_client_dependencies(uuid)','EXECUTE') THEN RAISE EXCEPTION 'private helper exposed'; END IF;
END $$;
SELECT set_config('test.user_id','20000000-0000-0000-0000-000000000001',false);
DO $$ DECLARE ids uuid[]; fp text; BEGIN
  SELECT client_ids INTO ids FROM find_duplicate_client_groups() WHERE match_type='name';
  fp:=get_duplicate_review_fingerprint(ids);
  PERFORM record_duplicate_review_decision(ids,'postpone',fp);
  IF EXISTS(SELECT 1 FROM find_duplicate_client_groups() WHERE match_type='name') THEN RAISE EXCEPTION 'postpone failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM client_duplicate_decisions WHERE expires_at=decided_at+interval '30 days') THEN RAISE EXCEPTION 'not 30 days'; END IF;
  UPDATE client_duplicate_decisions SET expires_at=now()-interval '1 second';
  IF NOT EXISTS(SELECT 1 FROM find_duplicate_client_groups() WHERE match_type='name') THEN RAISE EXCEPTION 'expired still hidden'; END IF;
  PERFORM record_duplicate_review_decision(ids,'preserve',fp);
  IF EXISTS(SELECT 1 FROM find_duplicate_client_groups() WHERE match_type='name') THEN RAISE EXCEPTION 'preserve failed'; END IF;
  UPDATE clients SET phone='7875551000' WHERE id=ids[1];
  IF NOT EXISTS(SELECT 1 FROM find_duplicate_client_groups() WHERE match_type='name') THEN RAISE EXCEPTION 'contact change hidden'; END IF;
  BEGIN PERFORM record_duplicate_review_decision(ids,'preserve',fp); RAISE EXCEPTION 'stale decision accepted'; EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='stale decision accepted' THEN RAISE; END IF;
  END;
END $$;
SELECT edit_duplicate_review_profile('30000000-0000-0000-0000-000000000003','Edited','Person','','fake@placeholder.local');
DO $$ DECLARE ids uuid[]; fp text; BEGIN
  SELECT client_ids INTO ids FROM find_duplicate_client_groups() WHERE match_type='name';
  fp := get_duplicate_review_fingerprint(ids);
  PERFORM record_duplicate_review_decision(ids,'preserve',fp);
  INSERT INTO clients(id,shop_id,first_name,last_name) VALUES
    ('30000000-0000-0000-0000-000000000016','10000000-0000-0000-0000-000000000001','Same','Person');
  IF NOT EXISTS(SELECT 1 FROM find_duplicate_client_groups() WHERE match_type='name') THEN RAISE EXCEPTION 'new profile hidden'; END IF;
  BEGIN PERFORM merge_duplicate_review_pair('30000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000011'); RAISE EXCEPTION 'cross shop merge allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='cross shop merge allowed' THEN RAISE; END IF; END;
  UPDATE clients SET auth_user_id='60000000-0000-0000-0000-000000000003' WHERE id='30000000-0000-0000-0000-000000000012';
  BEGIN PERFORM merge_duplicate_review_pair('30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000012'); RAISE EXCEPTION 'different account merge allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM='different account merge allowed' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
  IF (SELECT email FROM clients WHERE id='30000000-0000-0000-0000-000000000003') IS NOT NULL THEN RAISE EXCEPTION 'placeholder stored'; END IF;
  IF (SELECT jsonb_agg(to_jsonb(a)) FROM appointments a) IS DISTINCT FROM (SELECT data FROM snapshot) THEN RAISE EXCEPTION 'editor changed appointments'; END IF;
  IF (SELECT jsonb_agg(to_jsonb(t)) FROM transactions t) IS DISTINCT FROM (SELECT data FROM payments_snapshot) THEN RAISE EXCEPTION 'editor changed payments'; END IF;
END $$;
SELECT 'PASS: empty-only deletion, account/points/history guards, roles, shop scope, 30-day expiry, contact invalidation, profile-only edit, historical snapshots';