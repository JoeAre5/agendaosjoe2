// notify-product-sale — fired by commitDraft after a booking with mini-shop
// products is paid. Sends a Web Push notification to every owner subscriber.
//
// Owners are identified via push_subscriptions joined to clients with
// auth_user_id → user_roles (role='owner'). We deliberately do NOT email here
// — push is sufficient because the inventory action is immediate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendPush, isExpiredEndpoint } from "../_shared/webPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProductLine {
  id: string;
  qty: number;
  name?: string;
  price_cents?: number;
}

interface Body {
  appointment_id: string;
  client_name: string;
  products: ProductLine[];
  total_cents: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Only callable by service_role (we are invoked from another edge function)
  const authz = req.headers.get("Authorization") || "";
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (authz !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.appointment_id || !Array.isArray(body.products) || body.products.length === 0) {
    return new Response(JSON.stringify({ error: "missing_fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve owner client_ids via user_roles → clients(auth_user_id)
  const { data: ownerRoles, error: rolesErr } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "owner");
  if (rolesErr) {
    console.error("[notify-product-sale] roles lookup failed:", rolesErr);
    return new Response(JSON.stringify({ error: "roles_lookup_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const ownerUserIds = (ownerRoles || []).map((r) => r.user_id).filter(Boolean);
  if (ownerUserIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_owner_role" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: ownerClients } = await admin
    .from("clients")
    .select("id")
    .in("auth_user_id", ownerUserIds);
  const ownerClientIds = (ownerClients || []).map((c) => c.id);

  // Owners can also have push tokens directly on their client row (the only
  // reliable join in this schema).  If no client row exists for the owner
  // (admin-only account), nothing to push to.
  if (ownerClientIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_owner_client_row" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, language")
    .in("client_id", ownerClientIds);

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_subscriptions" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build payload
  const totalLabel = `$${(body.total_cents / 100).toFixed(2)}`;
  const itemsLabel = body.products
    .map((p) => {
      const line = `${p.qty}× ${p.name || "Producto"}`;
      return p.price_cents != null
        ? `${line} ($${((p.price_cents * p.qty) / 100).toFixed(2)})`
        : line;
    })
    .join(", ");
  // Deep-link directly to the appointment detail so the owner can review the
  // full order (services + products + client) in one tap.
  const appointmentUrl = `/admin/appointment/${body.appointment_id}`;

  let success = 0;
  let failure = 0;
  const expiredIds: string[] = [];

  for (const s of subs) {
    const isEs = (s.language || "es").toLowerCase().startsWith("es");
    const payload = {
      title: isEs ? `🛍️ Venta online · ${totalLabel}` : `🛍️ Online sale · ${totalLabel}`,
      body: isEs
        ? `${body.client_name} — ${itemsLabel}. Toca para ver la cita y reponer.`
        : `${body.client_name} — ${itemsLabel}. Tap to open the appointment and restock.`,
      url: appointmentUrl,
      tag: `product-sale-${body.appointment_id}`,
      data: {
        appointment_id: body.appointment_id,
        kind: "product_sale",
        url: appointmentUrl,
        total_cents: body.total_cents,
      },
    };
    const res = await sendPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      payload,
    );
    if (res.ok) success++;
    else {
      failure++;
      if (isExpiredEndpoint(res.status)) expiredIds.push(s.id);
    }
  }

  // Cleanup expired subscriptions
  if (expiredIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expiredIds);
  }

  return new Response(
    JSON.stringify({ ok: true, sent: success, failed: failure, expired: expiredIds.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
