// Envia los eventos de salida (citas, servicios, complementos) a los webhooks configurados
// (GoHighLevel u otro CRM). Ver drizzle/migrations/0025_outbound_webhooks.sql.
//
//   POST { event_id }                 -> envia ese evento (lo llama el disparador via pg_net)
//   POST { sweep: true }              -> reintenta los pendientes vencidos (lo llama el cron cada 5 min)
//   POST { test: { endpoint_id } }    -> (solo dueño) envia un evento de ejemplo a un destino
//
// Autenticacion: x-internal-secret (cron / base de datos) o JWT de un dueño para "test".
// Cada envio lleva:  X-Webhook-Event, X-Webhook-Id (id del evento, sirve para deduplicar) y, si el
// destino tiene secreto, X-Webhook-Signature: sha256=<hex HMAC-SHA256 del cuerpo exacto>.
// Reintentos: hasta 8 intentos con espera creciente (1, 4, 9... min, maximo 60). Un destino que ya
// recibio el evento no lo recibe de nuevo. La respuesta de un destino nunca afecta a una reserva.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCaller, isOwnerCaller, unauthorizedResponse } from "../_shared/internalAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const MAX_ATTEMPTS = 8;
const SWEEP_LIMIT = 25;
const TIMEOUT_MS = 10_000;

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Espera antes del siguiente intento: 1, 4, 9, 16... minutos, tope 60. */
export function backoffMinutes(attempt: number): number {
  return Math.min(60, attempt * attempt);
}

export function endpointMatches(ep: { event_types: string[] | null; shop_id: string | null; is_active: boolean }, eventType: string, shopId: string | null): boolean {
  if (!ep.is_active) return false;
  if (ep.shop_id && ep.shop_id !== shopId) return false;
  const types = ep.event_types ?? [];
  return types.includes("*") || types.includes(eventType);
}

async function postToEndpoint(ep: any, event: any): Promise<{ ok: boolean; http_status: number | null; error?: string }> {
  const body = JSON.stringify({
    id: event.id,
    event_type: event.event_type,
    occurred_at: event.created_at,
    shop_id: event.shop_id,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    data: event.data,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Webhook-Event": String(event.event_type),
    "X-Webhook-Id": String(event.id),
  };
  if (ep.secret) headers["X-Webhook-Signature"] = `sha256=${await hmacHex(ep.secret, body)}`;
  try {
    const res = await fetch(ep.url, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.text().catch(() => "");
    return { ok: res.ok, http_status: res.status };
  } catch (e) {
    return { ok: false, http_status: null, error: (e as Error).message };
  }
}

async function deliver(admin: any, eventId: string): Promise<{ id: string; status: string }> {
  const { data: event } = await admin.from("outbound_webhook_events").select("*").eq("id", eventId).maybeSingle();
  if (!event) return { id: eventId, status: "not_found" };
  if (event.status === "sent" || event.status === "failed") return { id: eventId, status: event.status };

  const { data: endpoints } = await admin.from("outbound_webhook_endpoints").select("*").eq("is_active", true);
  const targets = (endpoints ?? []).filter((ep: any) => endpointMatches(ep, event.event_type, event.shop_id));
  const deliveries: Record<string, any> = { ...(event.deliveries ?? {}) };
  let allOk = true;
  let lastError: string | null = null;

  for (const ep of targets) {
    if (deliveries[ep.id]?.ok) continue; // ya lo recibio
    const r = await postToEndpoint(ep, event);
    deliveries[ep.id] = { ok: r.ok, http_status: r.http_status, at: new Date().toISOString() };
    if (!r.ok) {
      allOk = false;
      lastError = `${ep.name}: ${r.error ?? `HTTP ${r.http_status}`}`;
    }
  }

  const attempts = (event.attempt_count ?? 0) + 1;
  if (allOk) {
    await admin.from("outbound_webhook_events").update({ status: "sent", attempt_count: attempts, deliveries, last_error: null, sent_at: new Date().toISOString() }).eq("id", eventId);
    return { id: eventId, status: "sent" };
  }
  const giveUp = attempts >= MAX_ATTEMPTS;
  await admin.from("outbound_webhook_events").update({
    status: giveUp ? "failed" : "pending",
    attempt_count: attempts,
    deliveries,
    last_error: lastError,
    next_attempt_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
  }).eq("id", eventId);
  return { id: eventId, status: giveUp ? "failed" : "pending" };
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let body: any = {};
    try { body = await req.json(); } catch { /* cuerpo vacio */ }

    const internal = await isInternalCaller(req, admin);

    // Prueba manual: solo un dueño autenticado, a un destino concreto.
    if (body?.test?.endpoint_id) {
      if (!internal && !(await isOwnerCaller(req, admin))) return unauthorizedResponse(corsHeaders);
      const { data: ep } = await admin.from("outbound_webhook_endpoints").select("*").eq("id", body.test.endpoint_id).maybeSingle();
      if (!ep) return jsonRes({ error: "endpoint_not_found" }, 404);
      const sample = {
        id: crypto.randomUUID(),
        event_type: "booking.created",
        created_at: new Date().toISOString(),
        shop_id: ep.shop_id,
        entity_type: "appointment",
        entity_id: crypto.randomUUID(),
        data: {
          test: true,
          appointment_id: "00000000-0000-0000-0000-000000000000",
          status: "scheduled",
          starts_at: new Date(Date.now() + 86_400_000).toISOString(),
          service: { id: null, name: "Corte (ejemplo)" },
          barber: { id: null, name: "Barbero de ejemplo" },
          client: { id: null, name: "Cliente Ejemplo", first_name: "Cliente", last_name: "Ejemplo", email: "ejemplo@example.com", phone: "7875550100" },
          price_cents: 2500, paid: false,
        },
      };
      const r = await postToEndpoint(ep, sample);
      return jsonRes({ ok: r.ok, http_status: r.http_status, error: r.error ?? null });
    }

    if (!internal) return unauthorizedResponse(corsHeaders);

    if (body?.event_id) return jsonRes(await deliver(admin, String(body.event_id)));

    if (body?.sweep) {
      const { data: due } = await admin
        .from("outbound_webhook_events")
        .select("id")
        .eq("status", "pending")
        .lte("next_attempt_at", new Date().toISOString())
        .order("next_attempt_at", { ascending: true })
        .limit(SWEEP_LIMIT);
      const results = [];
      for (const row of due ?? []) results.push(await deliver(admin, row.id));
      return jsonRes({ processed: results.length, results });
    }

    return jsonRes({ error: "event_id_or_sweep_required" }, 400);
  });
}
