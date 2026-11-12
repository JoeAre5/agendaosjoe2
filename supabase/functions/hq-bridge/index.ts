// HQ Bridge — allows Renova360 HQ to push/pull tenant configuration into this barbershop project.
// Authenticated via a shared HQ_BRIDGE_SECRET header (set per project as a secret).
// Endpoints (POST { action, payload }):
//   - "ping"             → health check, returns tenant identity
//   - "get_shop_info"    → returns shop_settings + barbers (public-safe)
//   - "set_shop_info"    → upserts shop_settings (HQ-driven onboarding)
//   - "list_calendar_ids"→ returns the currently configured TENANT_ACUITY_CALENDAR_IDS
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hq-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const expected = Deno.env.get("HQ_BRIDGE_SECRET");
    if (!expected) {
      return new Response(JSON.stringify({ error: "HQ bridge not configured on this tenant" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const provided = req.headers.get("x-hq-secret");
    if (!provided || provided !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, payload } = await req.json().catch(() => ({ action: null, payload: null }));
    if (!action || typeof action !== "string") {
      return new Response(JSON.stringify({ error: "Missing action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const tenantCalIds = (Deno.env.get("TENANT_ACUITY_CALENDAR_IDS") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    switch (action) {
      case "ping": {
        return json({
          ok: true,
          project_ref: Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1] ?? null,
          tenant_calendar_ids: tenantCalIds,
          timestamp: new Date().toISOString(),
        });
      }

      case "get_shop_info": {
        const [{ data: settings }, { data: barbers }] = await Promise.all([
          admin.from("shop_settings").select("*").maybeSingle(),
          admin.from("barbers").select("id, name, acuity_calendar_id, is_active, color").eq("is_active", true),
        ]);
        return json({ settings, barbers, tenant_calendar_ids: tenantCalIds });
      }

      case "set_shop_info": {
        if (!payload || typeof payload !== "object") {
          return json({ error: "Missing payload" }, 400);
        }
        // Only public shop-info fields may be written through the bridge.
        const ALLOWED = ["shop_name", "city", "owner_name", "address", "phone", "hours", "timezone", "whatsapp", "email", "maps_url"];
        const patch: Record<string, unknown> = {};
        for (const k of ALLOWED) {
          if (k in (payload as Record<string, unknown>)) patch[k] = (payload as Record<string, unknown>)[k];
        }
        if (Object.keys(patch).length === 0) return json({ error: "No allowed fields" }, 400);
        const { data: existing } = await admin.from("shop_settings").select("id").limit(1).maybeSingle();
        if (!existing) return json({ error: "Shop settings not found" }, 404);
        const { error } = await admin.from("shop_settings").update(patch).eq("id", existing.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      case "list_calendar_ids": {
        return json({ tenant_calendar_ids: tenantCalIds });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
