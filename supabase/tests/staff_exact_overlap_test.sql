-- Disposable local PostgreSQL only. Requires staff_overlap bootstrap and guards.
-- Transaction rollback keeps fixtures out of subsequent runs.
BEGIN;
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT staff_preauthorize_overlap(91001,'owner exact-slot confirmation');
INSERT INTO appointments(acuity_id,barber_id,starts_at,ends_at)
VALUES (91001,'10000000-0000-0000-0000-000000000000','2026-11-07T10:00:00-04:00','2026-11-07T11:00:00-04:00');
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000002',true);
SELECT staff_preauthorize_overlap(91002,'barber exact-slot confirmation');
INSERT INTO appointments(acuity_id,barber_id,starts_at,ends_at)
VALUES (91002,'10000000-0000-0000-0000-000000000000','2026-11-07T10:00:00-04:00','2026-11-07T11:00:00-04:00');
DO $$ BEGIN
  IF (SELECT count(*) FROM appointments WHERE acuity_id IN (91001,91002) AND overlap_exempt=true) <> 2 THEN
    RAISE EXCEPTION 'Authorized exact-slot appointments missing';
  END IF;
END $$;
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000003',true);
DO $$ BEGIN
  BEGIN
    PERFORM staff_preauthorize_overlap(91003,'client attempt');
    RAISE EXCEPTION 'Client authorized';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Client authorized' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO appointments(acuity_id,barber_id,starts_at,ends_at)
    VALUES (91003,'10000000-0000-0000-0000-000000000000','2026-11-07T10:00:00-04:00','2026-11-07T11:00:00-04:00');
    RAISE EXCEPTION 'Client exact overlap permitted';
  EXCEPTION WHEN exclusion_violation OR unique_violation THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF acquire_booking_hold('20000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000000','2026-11-07T10:00:00-04:00','2026-11-07T11:00:00-04:00',30)->>'success' <> 'false' THEN
    RAISE EXCEPTION 'Client hold allowed exact overlap';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: owner and barber exact overlaps persisted; client authorization, insert and hold denied';