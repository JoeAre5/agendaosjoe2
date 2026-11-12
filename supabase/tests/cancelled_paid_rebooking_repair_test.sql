-- Disposable PostgreSQL only. Never run this fixture against the hosted app.
\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE repair_appointments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), acuity_id bigint UNIQUE,
 barber_id uuid, client_id uuid, starts_at timestamptz, ends_at timestamptz,
 status text, price_cents integer, amount_paid_cents integer,
 paid boolean, payment_confirmed boolean, payment_method text,
 cancelled_at timestamptz, refund_status text, overlap_exempt boolean DEFAULT false
);
ALTER TABLE repair_appointments ADD CONSTRAINT repair_no_overlap
 EXCLUDE USING gist (barber_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
 WHERE (status NOT IN ('cancelled','no_show') AND overlap_exempt=false);
CREATE UNIQUE INDEX repair_exact_slot ON repair_appointments(barber_id,starts_at)
 WHERE status <> 'cancelled' AND overlap_exempt=false;
INSERT INTO repair_appointments(acuity_id,barber_id,client_id,starts_at,ends_at,status,
 price_cents,amount_paid_cents,paid,payment_confirmed,payment_method,cancelled_at,refund_status)
VALUES(1802847314,'9129755c-807a-41f6-86c6-60595362b98c',
 'f6f42d6d-0c43-4927-94a9-5ce2a16afb72','2026-11-07T15:30:00-04:00',
 '2026-11-07T16:00:00-04:00','scheduled',2500,2500,true,true,'ath_movil',
 '2026-11-07T14:25:27.677-04:00','manual');
DO $$ BEGIN
 BEGIN
  INSERT INTO repair_appointments(acuity_id,barber_id,starts_at,ends_at,status)
  VALUES(1802966457,'9129755c-807a-41f6-86c6-60595362b98c',
   '2026-11-07T15:30:00-04:00','2026-11-07T16:00:00-04:00','scheduled');
  RAISE EXCEPTION 'Original failure was not reproduced';
 EXCEPTION WHEN exclusion_violation OR unique_violation THEN NULL; END;
END $$;
WITH cancelled AS (
 UPDATE repair_appointments SET status='cancelled',paid=false
 WHERE acuity_id=1802847314 AND status='scheduled' AND amount_paid_cents=2500
 RETURNING barber_id,starts_at,ends_at
)
INSERT INTO repair_appointments(acuity_id,barber_id,client_id,starts_at,ends_at,status,
 price_cents,amount_paid_cents,paid,payment_confirmed)
SELECT 1802966457,barber_id,'16129bfc-192f-40a8-b24e-dd8c010c038f',starts_at,ends_at,
 'scheduled',3000,0,false,false FROM cancelled;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM repair_appointments WHERE acuity_id=1802847314
  AND status='cancelled' AND paid=false AND amount_paid_cents=2500
  AND payment_confirmed=true AND payment_method='ath_movil'
  AND refund_status='manual' AND cancelled_at='2026-11-07T14:25:27.677-04:00'
  AND client_id='f6f42d6d-0c43-4927-94a9-5ce2a16afb72') THEN
  RAISE EXCEPTION 'Original financial evidence changed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM repair_appointments WHERE acuity_id=1802966457
  AND status='scheduled' AND price_cents=3000 AND amount_paid_cents=0
  AND paid=false AND payment_confirmed=false
  AND client_id='16129bfc-192f-40a8-b24e-dd8c010c038f') THEN
  RAISE EXCEPTION 'New appointment inherited payment or identity'; END IF;
 IF (SELECT count(*) FROM repair_appointments WHERE status='scheduled') <> 1 THEN
  RAISE EXCEPTION 'Wrong active appointment count'; END IF;
END $$;
SELECT 'PASS: conflict reproduced, cancelled $25 preserved, new $30 unpaid, separate IDs and client links' result;