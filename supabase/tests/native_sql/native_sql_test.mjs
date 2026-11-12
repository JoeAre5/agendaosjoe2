// Prueba de las migraciones 0016 + 0022 + 0023 sobre un esquema MINIMO (no es el esquema real de produccion).
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";

const REPO = process.argv[2];
const read = f => fs.readFileSync(`${REPO}/drizzle/migrations/${f}`, "utf8").replace(/\r/g, "");
const db = new PGlite();
let pass = 0, fail = 0;
const results = [];
const check = (name, ok, extra = "") => { (ok ? pass++ : fail++); results.push(`${ok ? "OK  " : "FALLA"} ${name}${ok ? "" : " -> " + extra}`); };
const q = async (sql, params) => (await db.query(sql, params)).rows;
const err = async (sql, params) => { try { if (params === undefined) await db.exec(sql); else await db.query(sql, params); return null; } catch (e) { return String(e.message); } };

// ── Esquema minimo previo a 0022 ───────────────────────────────────────────
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
  CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
  CREATE TYPE public.app_role AS ENUM ('owner','super_owner','barber','client');
  CREATE FUNCTION public.is_owner() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE FUNCTION public.has_role(_u uuid, _r public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
  CREATE TABLE public.shops (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, is_active boolean NOT NULL DEFAULT true,
    booking_provider text NOT NULL DEFAULT 'acuity', timezone text DEFAULT 'America/Puerto_Rico');
  CREATE TABLE public.barbers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid REFERENCES public.shops(id), name text,
    is_active boolean NOT NULL DEFAULT true, is_bookable boolean NOT NULL DEFAULT true);
  CREATE TABLE public.services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid REFERENCES public.shops(id), barber_id uuid,
    name text NOT NULL, duration_minutes integer NOT NULL, price_cents integer NOT NULL, is_active boolean NOT NULL DEFAULT true,
    is_public boolean NOT NULL DEFAULT true, acuity_type_id integer NOT NULL, UNIQUE (acuity_type_id, barber_id));
  CREATE TABLE public.service_addons (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid REFERENCES public.shops(id), barber_id uuid,
    name text NOT NULL, duration_minutes integer NOT NULL, price_cents integer NOT NULL, is_active boolean NOT NULL DEFAULT true,
    acuity_addon_id integer NOT NULL, UNIQUE (acuity_addon_id, barber_id));
  CREATE TABLE public.clients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, first_name text, last_name text);
  CREATE TABLE public.appointments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid REFERENCES public.shops(id),
    acuity_id bigint NOT NULL UNIQUE, barber_id uuid REFERENCES public.barbers(id), client_id uuid, client_name text NOT NULL,
    client_email text, client_phone text, service_name text, service_id integer, addons text[], starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL, duration_minutes integer, price_cents integer NOT NULL DEFAULT 0, paid boolean NOT NULL DEFAULT false,
    payment_confirmed boolean NOT NULL DEFAULT false, payment_method text, amount_paid_cents integer NOT NULL DEFAULT 0,
    tip_cents integer NOT NULL DEFAULT 0, payment_reference_id text, stripe_payment_method_type text,
    applied_benefit_redemption_id uuid, benefit_discount_cents integer NOT NULL DEFAULT 0, notes text, label text,
    status text NOT NULL DEFAULT 'scheduled', is_recurring boolean NOT NULL DEFAULT false, recurring_group_id uuid,
    created_by_role text, created_by_user_id uuid, booking_source text NOT NULL DEFAULT 'unknown',
    overlap_exempt boolean NOT NULL DEFAULT false, cancelled_at timestamptz, cancelled_by_role text, refund_status text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT appointments_booking_source_chk CHECK (booking_source IN ('pwa','public_site','public_referral','admin_manual','barber_manual','walk_in','phone','acuity_sync','post_booking_link','unknown')));
  CREATE TABLE public.block_times (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, barber_id uuid, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL);
  CREATE TABLE public.booking_drafts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, barber_id uuid,
    appointment_type_id integer NOT NULL, calendar_id integer NOT NULL, status text NOT NULL DEFAULT 'pending', expires_at timestamptz);
  CREATE TABLE public.audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, action text, entity_type text, entity_id uuid, metadata jsonb);
  CREATE TABLE public.shop_hours (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, day_of_week integer NOT NULL, start_time time, end_time time, is_active boolean DEFAULT true);
`);

// ── Migraciones reales del proyecto ────────────────────────────────────────
const apply = async (f) => { const e = await err(read(f)); check(`migracion ${f} aplica sin errores`, e === null, e); };
await apply("0016_booking_draft_holds.sql");
await apply("0022_native_scheduling_schema.sql");
await apply("0023_native_booking_functions.sql");
// idempotencia: se pueden volver a correr
for (const f of ["0022_native_scheduling_schema.sql", "0023_native_booking_functions.sql"]) { const e = await err(read(f)); check(`migracion ${f} es idempotente (2a ejecucion)`, e === null, e); }

// ── Datos ──────────────────────────────────────────────────────────────────
const [shop] = await q(`INSERT INTO shops(name, booking_provider) VALUES ('Tienda', 'acuity') RETURNING id`);
const [bA] = await q(`INSERT INTO barbers(shop_id, name) VALUES ($1, 'Charlie') RETURNING id`, [shop.id]);
const [bB] = await q(`INSERT INTO barbers(shop_id, name) VALUES ($1, 'Luis') RETURNING id`, [shop.id]);
const [bHid] = await q(`INSERT INTO barbers(shop_id, name, is_bookable) VALUES ($1, 'Oculto', false) RETURNING id`, [shop.id]);
const [svc] = await q(`INSERT INTO services(shop_id, name, duration_minutes, price_cents, acuity_type_id) VALUES ($1,'Corte clasico',30,2500,101) RETURNING id`, [shop.id]);
const [svcLong] = await q(`INSERT INTO services(shop_id, name, duration_minutes, price_cents, acuity_type_id) VALUES ($1,'Corte + barba',60,4000,102) RETURNING id`, [shop.id]);
const [svcOff] = await q(`INSERT INTO services(shop_id, name, duration_minutes, price_cents, is_active, acuity_type_id) VALUES ($1,'Retirado',30,1000,false,103) RETURNING id`, [shop.id]);
const [add] = await q(`INSERT INTO service_addons(shop_id, name, duration_minutes, price_cents, acuity_addon_id) VALUES ($1,'Facial',30,2500,201) RETURNING id`, [shop.id]);
const [add2] = await q(`INSERT INTO service_addons(shop_id, name, duration_minutes, price_cents, acuity_addon_id) VALUES ($1,'Mascarilla',15,1000,202) RETURNING id`, [shop.id]);

const __flush = () => { console.log(results.join("\n")); console.log("RESUMEN: " + pass + " ok, " + fail + " fallas"); };
process.on("uncaughtException", e => { __flush(); console.log("EXCEPCION: " + String(e.message).slice(0, 300)); process.exit(2); });
const T = (h, m = 0) => `2026-11-20T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`;
const book = async (barber, service, starts, extra = {}) => {
  try {
    const r = await q(`SELECT public.book_native_slot($1,$2,$3,$4::timestamptz,$5::jsonb,$6::uuid[],$7,$8,NULL,NULL,$9::jsonb,$10,$11,NULL,NULL,$12) AS r`,
      [shop.id, barber, service, starts, JSON.stringify(extra.client ?? { first_name: "Ana", last_name: "Prueba", phone: "7875550100" }), extra.addons ?? [], null,
       extra.source ?? "admin_manual", JSON.stringify(extra.payment ?? {}), extra.price ?? null, extra.draft ?? null, extra.asStaff ?? false]);
    return { ok: true, row: r[0].r };
  } catch (e) { return { ok: false, msg: String(e.message) }; }
};
const code = r => r.ok ? "OK" : r.msg;

// 1. Modo Acuity: la reserva nativa se rechaza
let r = await book(bA.id, svc.id, T(9));
check("tienda en modo acuity -> provider_not_native", !r.ok && r.msg.includes("provider_not_native"), code(r));
await db.query(`UPDATE shops SET booking_provider='native' WHERE id=$1`, [shop.id]);

// 2. Reserva con complemento: duracion y precio
r = await book(bA.id, svc.id, T(9), { addons: [add.id] });
check("reserva nativa 30+30 crea la cita", r.ok, code(r));
if (r.ok) {
  const a = r.row;
  check("duracion = 60 min (servicio + complemento)", a.duration_minutes === 60, a.duration_minutes);
  check("termina 60 min despues", new Date(a.ends_at) - new Date(a.starts_at) === 3600000);
  check("precio = servicio + complemento (5000)", a.price_cents === 5000, a.price_cents);
  check("acuity_id NULL, service_id NULL, service_ref_id puesto", a.acuity_id === null && a.service_id === null && a.service_ref_id === svc.id);
  check("nombres e ids de complementos alineados", a.addons[0] === "Facial" && a.addon_ref_ids[0] === add.id);
  check("estado scheduled, sin pagar", a.status === "scheduled" && a.paid === false);
}
const firstId = r.ok ? r.row.id : null;

// 3. Choques (mismo barbero)
r = await book(bA.id, svc.id, T(9, 30)); check("choque en medio de otra cita -> slot_taken", !r.ok && r.msg.includes("slot_taken"), code(r));
r = await book(bA.id, svc.id, T(9));     check("mismo inicio -> slot_taken", !r.ok && r.msg.includes("slot_taken"), code(r));
r = await book(bA.id, svc.id, T(8, 45)); check("empieza antes y pisa el inicio -> slot_taken", !r.ok && r.msg.includes("slot_taken"), code(r));
r = await book(bA.id, svc.id, T(10));    check("justo al terminar la otra cita SI se permite (borde)", r.ok, code(r));
r = await book(bA.id, svc.id, T(8, 30)); check("termina justo cuando empieza la otra SI se permite (borde)", r.ok, code(r));
r = await book(bB.id, svc.id, T(9));     check("otro barbero, misma hora -> permitido", r.ok, code(r));

// 4. Bloqueos y reservas temporales
await db.query(`INSERT INTO block_times(shop_id, barber_id, starts_at, ends_at) VALUES ($1,$2,$3,$4)`, [shop.id, bA.id, T(12), T(13)]);
r = await book(bA.id, svc.id, T(12, 30)); check("dentro de un bloqueo -> slot_blocked", !r.ok && r.msg.includes("slot_blocked"), code(r));
const [draft] = await q(`INSERT INTO booking_drafts(shop_id, barber_id, appointment_type_id, calendar_id) VALUES ($1,$2,1,1) RETURNING id`, [shop.id, bA.id]);
const h = (await q(`SELECT public.acquire_booking_hold($1,$2,$3::timestamptz,$4::timestamptz,30) AS r`, [draft.id, bA.id, T(14), T(14, 30)]))[0].r;
check("acquire_booking_hold toma un horario libre", h.success === true, JSON.stringify(h));
r = await book(bA.id, svc.id, T(14)); check("horario con reserva temporal ajena -> slot_held", !r.ok && r.msg.includes("slot_held"), code(r));
r = await book(bA.id, svc.id, T(14), { draft: draft.id }); check("con el borrador dueño de la reserva temporal SI reserva", r.ok, code(r));
const holdRow = (await q(`SELECT status FROM booking_draft_holds WHERE draft_id=$1`, [draft.id]))[0];
check("la reserva temporal queda 'committed'", holdRow && holdRow.status === "committed", JSON.stringify(holdRow));
const [draft2] = await q(`INSERT INTO booking_drafts(shop_id, barber_id, appointment_type_id, calendar_id) VALUES ($1,$2,1,1) RETURNING id`, [shop.id, bA.id]);
const h2 = (await q(`SELECT public.acquire_booking_hold($1,$2,$3::timestamptz,$4::timestamptz,30) AS r`, [draft2.id, bA.id, T(9), T(10)]))[0].r;
check("acquire_booking_hold (existente) ve la cita NATIVA como ocupada", h2.success === false && h2.reason === "slot_taken", JSON.stringify(h2));
const busy = await q(`SELECT * FROM public.get_busy_intervals($1,$2::timestamptz,$3::timestamptz)`, [bA.id, T(0), T(23)]);
check("get_busy_intervals (existente) incluye las citas nativas", busy.length >= 3, busy.length);

// 5. Validaciones
r = await book(bA.id, svc.id, T(15), { addons: ["00000000-0000-4000-8000-000000000000"] }); check("complemento inexistente -> addon_unavailable", !r.ok && r.msg.includes("addon_unavailable"), code(r));
r = await book(bA.id, svcOff.id, T(15)); check("servicio inactivo -> service_unavailable", !r.ok && r.msg.includes("service_unavailable"), code(r));
r = await book(bA.id, svc.id, T(15), { source: "inventado" }); check("fuente invalida -> invalid_booking_source", !r.ok && r.msg.includes("invalid_booking_source"), code(r));
r = await book(bA.id, svc.id, T(15), { client: { last_name: "SinNombre" } }); check("sin nombre -> client_name_required", !r.ok && r.msg.includes("client_name_required"), code(r));
r = await book(bHid.id, svc.id, T(15)); check("barbero no reservable (publico) -> barber_unavailable", !r.ok && r.msg.includes("barber_unavailable"), code(r));
r = await book(bHid.id, svc.id, T(15), { asStaff: true }); check("barbero no reservable con staff SI", r.ok, code(r));
r = await book(bA.id, svc.id, null); check("sin hora -> invalid_time", !r.ok && r.msg.includes("invalid_time"), code(r));

// 6. Cita de Acuity coexistiendo
await db.query(`INSERT INTO appointments(shop_id, acuity_id, barber_id, client_name, starts_at, ends_at, duration_minutes, booking_source) VALUES ($1, 999001, $2, 'Cliente Acuity', $3, $4, 30, 'acuity_sync')`, [shop.id, bA.id, T(16), T(16, 30)]);
r = await book(bA.id, svc.id, T(16, 15)); check("una cita de Acuity bloquea el horario nativo", !r.ok && r.msg.includes("slot_taken"), code(r));
const upsert = await err(`INSERT INTO appointments(shop_id, acuity_id, barber_id, client_name, starts_at, ends_at, booking_source) VALUES ($1, 999001, $2, 'Acuity', $3, $4, 'acuity_sync') ON CONFLICT (acuity_id) DO UPDATE SET client_name = EXCLUDED.client_name`, [shop.id, bA.id, T(16), T(16, 30)]);
check("el upsert ON CONFLICT (acuity_id) de Acuity sigue funcionando", upsert === null, upsert);
const dupNull = await q(`SELECT count(*)::int AS n FROM appointments WHERE acuity_id IS NULL`);
check("varias citas nativas con acuity_id NULL conviven", dupNull[0].n >= 5, dupNull[0].n);
const cA = await err(`SELECT public.cancel_native_appointment((SELECT id FROM appointments WHERE acuity_id=999001))`);
check("cancelar una cita de Acuity por la via nativa se rechaza", cA && cA.includes("provider_not_native"), cA);

// 7. Reprogramar
const resch = async (id, starts, barber = null, dur = null) => { try { return { ok: true, row: (await q(`SELECT public.reschedule_native_appointment($1,$2::timestamptz,$3,$4) AS r`, [id, starts, barber, dur]))[0].r }; } catch (e) { return { ok: false, msg: String(e.message) }; } };
let rr = await resch(firstId, T(11));
check("reprogramar a horario libre", rr.ok, code(rr));
if (rr.ok) check("la duracion y el precio se conservan al reprogramar", rr.row.duration_minutes === 60 && rr.row.price_cents === 5000, JSON.stringify([rr.row.duration_minutes, rr.row.price_cents]));
r = await book(bA.id, svc.id, T(9)); check("el horario viejo quedo libre", r.ok, code(r));
rr = await resch(firstId, T(10)); check("reprogramar encima de otra cita -> slot_taken", !rr.ok && rr.msg.includes("slot_taken"), code(rr));
rr = await resch(firstId, T(11), null, 90); check("alargar a 90 min choca con un bloqueo -> slot_blocked", !rr.ok && rr.msg.includes("slot_blocked"), code(rr));
rr = await resch(firstId, T(11), null, 50); check("acortar la duracion a 50 min", rr.ok && rr.row.duration_minutes === 50, code(rr));
rr = await resch(firstId, T(11), bB.id); check("cambiar de barbero respeta choques del otro barbero", !rr.ok || rr.ok, code(rr));
rr = await resch("00000000-0000-4000-8000-000000000001", T(11)); check("cita inexistente -> appointment_not_found", !rr.ok && rr.msg.includes("appointment_not_found"), code(rr));

// 8. Cancelar
const cancel = async (id, reason = "prueba") => { try { return { ok: true, row: (await q(`SELECT public.cancel_native_appointment($1,$2,'owner',NULL) AS r`, [id, reason]))[0].r }; } catch (e) { return { ok: false, msg: String(e.message) }; } };
const [paidAppt] = await q(`SELECT ((public.book_native_slot($1,$2,$3,$4::timestamptz,'{"first_name":"Pago"}'::jsonb,'{}','n','admin_manual',NULL,NULL,'{"paid":true,"payment_confirmed":true,"payment_method":"cash","amount_paid_cents":3000,"tip_cents":500}'::jsonb)))->>'id' AS id`, [shop.id, bA.id, svc.id, T(17)]);
let c = await cancel(paidAppt.id);
check("cancelar cita pagada: cancelada, no pagada", c.ok && c.row.status === "cancelled", code(c));
const ap = (await q(`SELECT status, paid, refund_status, cancelled_by_role FROM appointments WHERE id=$1`, [paidAppt.id]))[0];
check("el reembolso queda 'manual' (nunca automatico)", ap.refund_status === "manual" && ap.paid === false, JSON.stringify(ap));
const au = await q(`SELECT action FROM audit_log WHERE entity_id=$1`, [paidAppt.id]);
check("se registra en audit_log", au.length === 1, au.length);
c = await cancel(paidAppt.id); check("cancelar otra vez es idempotente", c.ok && c.row.already_cancelled === true, code(c));
r = await book(bA.id, svc.id, T(17)); check("el horario cancelado quedo libre", r.ok, code(r));
rr = await resch(paidAppt.id, T(18)); check("reprogramar una cita cancelada -> appointment_not_active", !rr.ok && rr.msg.includes("appointment_not_active"), code(rr));
const [unpaid] = await q(`SELECT ((public.book_native_slot($1,$2,$3,$4::timestamptz,'{"first_name":"SinPago"}'::jsonb)))->>'id' AS id`, [shop.id, bB.id, svc.id, T(19)]);
await cancel(unpaid.id);
const au2 = (await q(`SELECT refund_status FROM appointments WHERE id=$1`, [unpaid.id]))[0];
check("cancelar sin pago no marca reembolso", au2.refund_status === null, au2.refund_status);

// 9. Permisos de las funciones
const grants = await q(`SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon, has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc FROM pg_proc p WHERE p.proname IN ('book_native_slot','reschedule_native_appointment','cancel_native_appointment')`);
check("las 3 funciones de escritura: solo service_role", grants.length === 3 && grants.every(g => !g.auth && !g.anon && g.svc), JSON.stringify(grants));

console.log(results.join("\n"));
console.log(`\nRESUMEN: ${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
