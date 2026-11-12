// Disposable in-memory PostgreSQL (PGlite) test for staff_record_created_appointment.
// Usage: bun supabase/tests/staff_cross_barber_booking_test.ts <function.sql>
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const J = "00000000-0000-0000-0000-00000000000a", CH = "22222222-2222-2222-2222-222222222222", OT = "33333333-3333-3333-3333-333333333333";
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user_id', true),'')::uuid $$;
CREATE TYPE app_role AS ENUM ('super_owner','owner','barber','client');
CREATE TABLE user_roles(user_id uuid, role app_role);
CREATE FUNCTION has_role(_id uuid,_r app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_id AND role=_r) $$;
CREATE TABLE shop_memberships(user_id uuid, shop_id uuid);
CREATE FUNCTION current_shop_id(_user_id uuid DEFAULT auth.uid()) RETURNS uuid LANGUAGE sql AS $$ SELECT shop_id FROM shop_memberships WHERE user_id=_user_id LIMIT 1 $$;
CREATE TABLE barbers(id uuid PRIMARY KEY, shop_id uuid);
CREATE TABLE acuity_operator_log(acuity_id bigint, user_id uuid, action text, status_code int, created_at timestamptz DEFAULT now());
CREATE TABLE appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), acuity_id bigint UNIQUE, barber_id uuid, client_id uuid, client_name text, client_email text, client_phone text, service_name text, service_id int, addons text[], starts_at timestamptz, ends_at timestamptz, duration_minutes int, price_cents int, status text, paid boolean, is_recurring boolean, recurring_group_id uuid, created_by_role text, created_by_user_id uuid);
GRANT USAGE ON SCHEMA public, auth TO authenticated;
INSERT INTO user_roles VALUES ('${J}','barber');
INSERT INTO shop_memberships VALUES ('${J}','11111111-1111-1111-1111-111111111111');
INSERT INTO barbers VALUES ('${CH}','11111111-1111-1111-1111-111111111111'),('${OT}','99999999-9999-9999-9999-999999999999');
INSERT INTO acuity_operator_log VALUES (100,'${J}','create',200),(300,'${J}','create',200);
INSERT INTO appointments(acuity_id,barber_id,client_name,status,paid) VALUES (100,'${CH}','Enrique','scheduled',true);
`);
await db.exec(readFileSync(process.argv[2], "utf8"));
async function asJoseph(sql: string) {
  try { await db.exec(`SET ROLE authenticated; SET test.user_id='${J}'; ${sql}`); return "ok"; }
  catch { return "blocked"; } finally { await db.exec("RESET ROLE"); }
}
const call = (id: number, b: string) => asJoseph(`SELECT staff_record_created_appointment(${id},'${b}',null,'X',null,null,'CORTE',1,'{}',now(),now()+interval '30 min',30,2500,false,null);`);
let fail = 0;
const chk = (got: unknown, want: unknown, name: string) => { const p = got === want; if (!p) fail = 1; console.log(`${p ? "PASS" : "FAIL"} ${name}${p ? "" : ` (got ${got})`}`); };
chk(await call(100, CH), "ok", "barber books for another barber in same shop (already synced row)");
const r = (await db.query<any>("select created_by_role, created_by_user_id, paid from appointments where acuity_id=100")).rows[0];
chk(`${r.created_by_role},${r.created_by_user_id},${r.paid}`, `barber,${J},true`, "records who booked, keeps payment");
chk(await call(200, CH), "blocked", "cannot claim a booking they did not create");
chk(await call(300, OT), "blocked", "cannot book for a barber in another shop");
chk(await asJoseph("INSERT INTO appointments(acuity_id) VALUES (5)"), "blocked", "no direct table write");
process.exit(fail);
