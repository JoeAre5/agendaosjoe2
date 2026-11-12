import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { backoffMinutes, endpointMatches, hmacHex } from "./index.ts";

Deno.test("hmacHex: vector conocido de HMAC-SHA256", async () => {
  // Vector de RFC 4231 (caso 2): clave "Jefe", mensaje "what do ya want for nothing?"
  assertEquals(
    await hmacHex("Jefe", "what do ya want for nothing?"),
    "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
  );
});

Deno.test("hmacHex: el cuerpo cambia la firma", async () => {
  assert((await hmacHex("k", '{"a":1}')) !== (await hmacHex("k", '{"a":2}')));
});

Deno.test("backoffMinutes: crece y tiene tope de 60", () => {
  assertEquals([1, 2, 3, 4].map(backoffMinutes), [1, 4, 9, 16]);
  assertEquals(backoffMinutes(7), 49);
  assertEquals(backoffMinutes(20), 60);
});

Deno.test("endpointMatches: '*', tipos concretos, tienda e inactivos", () => {
  const ep = (o: Partial<{ event_types: string[]; shop_id: string | null; is_active: boolean }>) => ({ event_types: ["*"], shop_id: null, is_active: true, ...o });
  assert(endpointMatches(ep({}), "booking.created", "s1"));
  assert(endpointMatches(ep({ event_types: ["booking.cancelled"] }), "booking.cancelled", "s1"));
  assert(!endpointMatches(ep({ event_types: ["booking.cancelled"] }), "booking.created", "s1"));
  assert(!endpointMatches(ep({ is_active: false }), "booking.created", "s1"));
  assert(endpointMatches(ep({ shop_id: "s1" }), "booking.created", "s1"));
  assert(!endpointMatches(ep({ shop_id: "s2" }), "booking.created", "s1"));
  assert(!endpointMatches(ep({ event_types: [] }), "booking.created", "s1"));
});
