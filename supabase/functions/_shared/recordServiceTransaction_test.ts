// cd supabase/functions && deno test --no-check --node-modules-dir=auto _shared/recordServiceTransaction_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { recordServiceTransactionOnce } from "./recordServiceTransaction.ts";

const ROW = { appointment_id: "a1", payment_method: "stripe", stripe_payment_id: "pi_1", type: "service", status: "completed", total_cents: 2000 };

// Doble de la base: una tabla en memoria con la restriccion unica (appointment_id, stripe_payment_id) de la migracion 0030.
function fakeAdmin(opts: { rows?: any[]; failSelect?: boolean; uniqueIndex?: boolean } = {}) {
  const rows: any[] = [...(opts.rows ?? [])];
  const calls = { inserts: 0 };
  const admin = {
    rows,
    calls,
    from(_t: string) {
      const filters: Record<string, unknown> = {};
      const builder: any = {
        select() { return builder; },
        eq(k: string, v: unknown) { filters[k] = v; return builder; },
        limit() { return builder; },
        async maybeSingle() {
          if (opts.failSelect) throw new Error("select boom");
          const hit = rows.find((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
          return { data: hit ?? null, error: null };
        },
        async insert(r: any) {
          calls.inserts++;
          if (opts.uniqueIndex && rows.some((x) => x.appointment_id === r.appointment_id && x.stripe_payment_id === r.stripe_payment_id && x.type === "service" && x.status === "completed")) {
            return { error: { code: "23505", message: "duplicate key" } };
          }
          rows.push({ id: `t${rows.length + 1}`, ...r });
          return { error: null };
        },
      };
      return builder;
    },
  };
  return admin;
}

const quiet = () => {};

Deno.test("first call inserts, second call for the same payment does not", async () => {
  const admin = fakeAdmin();
  assertEquals(await recordServiceTransactionOnce(admin, ROW, quiet), "inserted");
  assertEquals(await recordServiceTransactionOnce(admin, ROW, quiet), "exists");
  assertEquals(admin.rows.length, 1);
  assertEquals(admin.calls.inserts, 1);
});

Deno.test("a race that slips past the lookup is stopped by the unique index (23505 = exists)", async () => {
  const admin = fakeAdmin({ rows: [{ id: "t0", ...ROW }], failSelect: true, uniqueIndex: true });
  assertEquals(await recordServiceTransactionOnce(admin, ROW, quiet), "exists");
  assertEquals(admin.rows.length, 1);
});

Deno.test("a different payment on the same appointment is recorded (add-on top-up)", async () => {
  const admin = fakeAdmin({ rows: [{ id: "t0", ...ROW }] });
  assertEquals(await recordServiceTransactionOnce(admin, { ...ROW, stripe_payment_id: "pi_2" }, quiet), "inserted");
  assertEquals(admin.rows.length, 2);
});

Deno.test("another appointment paid with the same intent is recorded (one payment, several appointments)", async () => {
  const admin = fakeAdmin({ rows: [{ id: "t0", ...ROW }], uniqueIndex: true });
  assertEquals(await recordServiceTransactionOnce(admin, { ...ROW, appointment_id: "a2" }, quiet), "inserted");
});

Deno.test("a real insert error is reported, not hidden as exists", async () => {
  const admin: any = fakeAdmin();
  const orig = admin.from.bind(admin);
  admin.from = (t: string) => { const b = orig(t); b.insert = async () => ({ error: { code: "XX000", message: "boom" } }); return b; };
  assertEquals(await recordServiceTransactionOnce(admin, ROW, quiet), "error");
});
