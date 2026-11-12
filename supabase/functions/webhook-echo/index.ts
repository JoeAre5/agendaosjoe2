// SOLO PARA PRUEBAS. Receptor de eco para ver los webhooks de salida sin enviarlos a un servicio
// externo: responde 200 con lo recibido y, si se le pasa ?secret=..., dice si la firma es valida.
// No lo despliegues en produccion. Uso:  POST .../functions/v1/webhook-echo?secret=mi-clave
// deno-lint-ignore-file no-explicit-any
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const raw = await req.text();
  const secret = new URL(req.url).searchParams.get("secret");
  const sent = req.headers.get("x-webhook-signature");
  let signature_ok: boolean | null = null;
  if (secret) signature_ok = sent === `sha256=${await hmacHex(secret, raw)}`;
  let parsed: any = null;
  try { parsed = JSON.parse(raw); } catch { /* no JSON */ }
  console.log(JSON.stringify({ event: req.headers.get("x-webhook-event"), id: req.headers.get("x-webhook-id"), signature_ok, type: parsed?.event_type }));
  // Pruebas: ?status=500 fuerza un error; con ?secret=, una firma invalida responde 401.
  const forced = Number(new URL(req.url).searchParams.get("status") || 0);
  if (forced >= 400) return new Response(JSON.stringify({ forced }), { status: forced, headers: corsHeaders });
  if (signature_ok === false) return new Response(JSON.stringify({ ok: false, error: "bad_signature" }), { status: 401, headers: corsHeaders });
  return new Response(JSON.stringify({ ok: true, received_event: parsed?.event_type ?? null, signature_ok }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
