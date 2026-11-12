-- Run ONLY in the disposable local database after the bootstrap, existing
-- migrations 0002/0016, reproduction and pending/staff_overlap_client_guard.sql.
UPDATE booking_draft_holds SET status='released';
DO $$ BEGIN
  IF acquire_booking_hold('20000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000000','2026-11-07T11:15:00-04:00','2026-11-07T11:45:00-04:00',30)->>'success' <> 'false' THEN
    RAISE EXCEPTION 'Client hold permitted over exempt appointment';
  END IF;
  IF (SELECT count(*) FROM get_busy_intervals('10000000-0000-0000-0000-000000000000','2026-11-07T11:15:00-04:00','2026-11-07T11:45:00-04:00')) <> 1 THEN
    RAISE EXCEPTION 'Exempt appointment missing from busy intervals';
  END IF;
END $$;
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000003',false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    INSERT INTO appointments(acuity_id,barber_id,starts_at,ends_at) VALUES (6,'10000000-0000-0000-0000-000000000000','2026-11-07T11:15:00-04:00','2026-11-07T11:45:00-04:00');
    RAISE EXCEPTION 'Client overlapping insert permitted';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
END $$;
RESET ROLE;
-- Staff overrides must still persist after installing the stricter serializer.
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT staff_preauthorize_overlap(7,'owner post-patch confirmation');
INSERT INTO appointments(acuity_id,barber_id,starts_at,ends_at) VALUES (7,'10000000-0000-0000-0000-000000000000','2026-11-07T11:15:00-04:00','2026-11-07T11:45:00-04:00');
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000002',false);
SELECT staff_preauthorize_overlap(8,'barber post-patch confirmation');
INSERT INTO appointments(acuity_id,barber_id,starts_at,ends_at) VALUES (8,'10000000-0000-0000-0000-000000000000','2026-11-07T11:15:00-04:00','2026-11-07T11:45:00-04:00');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM appointments WHERE acuity_id IN (7,8) AND overlap_exempt=true) <> 2 THEN
    RAISE EXCEPTION 'Staff overrides lost after guard';
  END IF;
END $$;
SELECT set_config('test.user_id','00000000-0000-0000-0000-000000000003',false);
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    UPDATE appointments SET starts_at='2026-11-07T11:20:00-04:00',ends_at='2026-11-07T11:50:00-04:00' WHERE acuity_id=7;
    RAISE EXCEPTION 'Client reused staff exemption';
  EXCEPTION WHEN exclusion_violation THEN NULL;
  END;
  INSERT INTO appointments(acuity_id,barber_id,starts_at,ends_at) VALUES (9,'10000000-0000-0000-0000-000000000000','2026-11-07T12:00:00-04:00','2026-11-07T12:30:00-04:00');
END $$;
RESET ROLE;
SELECT 'PASS: client holds, busy intervals and direct inserts protect staff-exempt appointments';