\set ON_ERROR_STOP 0
SELECT staff_cancel_paid_appointment('00000000-0000-0000-0000-0000000000a1'); -- no role: must fail
\set ON_ERROR_STOP 1
SELECT status FROM appointments; -- scheduled
INSERT INTO cur VALUES ('barber');
SELECT staff_cancel_paid_appointment('00000000-0000-0000-0000-0000000000a1','t');
SELECT status, paid, cancelled_by_role, refund_status, amount_paid_cents FROM appointments;
SELECT staff_cancel_paid_appointment('00000000-0000-0000-0000-0000000000a1');
SELECT count(*) audit_rows FROM audit_log;
SELECT has_function_privilege('anon','staff_cancel_paid_appointment(uuid,text)','execute') anon_exec;
