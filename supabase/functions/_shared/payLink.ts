// Signed pay-link codes for the public /pay/:code page.
//
// A code is bound server-side to ONE appointment, the exact balance owed when
// it was issued, and an expiration. It is HMAC-signed with PAY_LINK_SECRET, so
// it cannot be guessed or edited. Knowing an appointment id is not enough.
// deno-lint-ignore-file no-explicit-any
import { canAccessDraft } from "./accessGuards.ts";

export const PAY_LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PayLinkClaims { a: string; b: number; e: number }

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const c of bytes) s += String.fromCharCode(c);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const p = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(p);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(data: string): Promise<Uint8Array> {
  const secret = Deno.env.get("PAY_LINK_SECRET");
  if (!secret) throw new Error("PAY_LINK_SECRET missing");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function signPayLink(appointmentId: string, balanceCents: number): Promise<{ code: string; expiresAt: number }> {
  const e = Math.floor(Date.now() / 1000) + PAY_LINK_TTL_SECONDS;
  const body = b64url(enc.encode(JSON.stringify({ a: appointmentId, b: balanceCents, e })));
  const sig = b64url(await hmac(body));
  return { code: `${body}.${sig}`, expiresAt: e };
}

export async function verifyPayLink(code: unknown): Promise<PayLinkClaims | null> {
  if (typeof code !== "string" || code.length > 400) return null;
  const [body, sig] = code.split(".");
  if (!body || !sig) return null;
  try {
    const expected = await hmac(body);
    const given = fromB64url(sig);
    if (given.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= given[i] ^ expected[i];
    if (diff !== 0) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as PayLinkClaims;
    if (!claims?.a || !Number.isInteger(claims.b) || !Number.isInteger(claims.e)) return null;
    if (claims.e < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

/**
 * Who may start a payment for an existing appointment:
 *  - anyone holding a valid pay-link code for THIS appointment and its current balance, or
 *  - the appointment's own signed-in client, or shop staff.
 */
export async function canPayAppointment(
  admin: any, req: Request, appt: { id: string; client_id: string | null }, balanceCents: number, payCode: unknown,
): Promise<boolean> {
  if (payCode) {
    const claims = await verifyPayLink(payCode);
    return !!claims && claims.a === appt.id && claims.b === balanceCents;
  }
  const hasAuth = (req.headers.get("Authorization") || "").startsWith("Bearer ");
  if (!hasAuth || !appt.client_id) {
    if (!hasAuth) return false;
  }
  return await canAccessDraft(admin, req, appt.client_id, true);
}
