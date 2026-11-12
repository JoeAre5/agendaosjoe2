import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Auth gate — service-role JWT (cron/internal) or owner role.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    if (token !== serviceKey) {
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      const uid = userData?.user?.id;
      if (!uid) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", uid);
      const isOwner = (roles ?? []).some((r: any) => r.role === "owner");
      if (!isOwner) return json({ error: "Forbidden" }, 403);
    }

    const acuityUserId = Deno.env.get("ACUITY_USER_ID");
    const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
    if (!acuityUserId || !acuityApiKey) {
      return json({ error: "Acuity credentials not configured" }, 500);
    }
    const basicAuth = btoa(`${acuityUserId}:${acuityApiKey}`);

    // Fetch barbers
    const { data: barbers } = await supabaseAdmin
      .from("barbers")
      .select("id, acuity_calendar_id")
      .eq("is_active", true);

    const calToBarber = new Map<number, string>();
    for (const b of barbers || []) {
      if (b.acuity_calendar_id) calToBarber.set(b.acuity_calendar_id, b.id);
    }

    // Fetch appointment types from Acuity
    const typesRes = await fetch(
      "https://acuityscheduling.com/api/v1/appointment-types",
      { headers: { Authorization: `Basic ${basicAuth}` } },
    );
    const acuityTypes: any[] = await typesRes.json();
    if (!Array.isArray(acuityTypes)) {
      return json({ error: "Failed to fetch from Acuity", detail: acuityTypes }, 502);
    }

    // Fetch addons from Acuity
    const addonsRes = await fetch(
      "https://acuityscheduling.com/api/v1/appointment-addons",
      { headers: { Authorization: `Basic ${basicAuth}` } },
    );
    const acuityAddons: any[] = await addonsRes.json();
    const addonsList = Array.isArray(acuityAddons) ? acuityAddons : [];

    // Fetch existing services so we know which rows are locally_edited
    // (admin-edited rows must not be overwritten by the sync). We also need
    // their current name/duration/price/description so the slim upsert payload
    // satisfies NOT NULL on the INSERT-path of ON CONFLICT DO UPDATE.
    const { data: existingServices } = await supabaseAdmin
      .from("services")
      .select("acuity_type_id, barber_id, locally_edited, name, duration_minutes, price_cents, description");
    const lockedRows = new Map<string, { name: string; duration_minutes: number; price_cents: number; description: string | null }>();
    for (const s of existingServices || []) {
      if (s.locally_edited) {
        lockedRows.set(`${s.acuity_type_id}|${s.barber_id}`, {
          name: s.name,
          duration_minutes: s.duration_minutes,
          price_cents: s.price_cents,
          description: s.description,
        });
      }
    }

    // Build service rows: one per barber-type combo
    // For locally-edited rows we send a SLIM payload (no name/duration/price/description)
    // so Postgres upsert leaves those columns untouched.
    const serviceRows: any[] = [];
    for (const t of acuityTypes) {
      const calIDs: number[] = t.calendarIDs || [];
      const priceCents = t.price ? Math.round(parseFloat(t.price) * 100) : 0;

      for (const calId of calIDs) {
        const barberId = calToBarber.get(calId);
        if (!barberId) continue;

        const isLocked = lockedRows.has(`${t.id}|${barberId}`);
        const acuityName = (typeof t.name === "string" ? t.name.trim() : "");
        const fallbackName = acuityName || (t.category ? String(t.category) : "") || `Servicio ${t.id}`;

        if (isLocked) {
          const local = lockedRows.get(`${t.id}|${barberId}`)!;
          // Preserve admin-edited name/duration/price/description (also satisfies NOT NULL on INSERT-path)
          serviceRows.push({
            acuity_type_id: t.id,
            barber_id: barberId,
            name: local.name ?? fallbackName,
            description: local.description,
            duration_minutes: local.duration_minutes ?? (t.duration || 30),
            price_cents: local.price_cents ?? (t.price ? Math.round(parseFloat(t.price) * 100) : 0),
            category: t.category || null,
            color: t.color || null,
            is_active: !t.private,
            addon_ids: t.addonIDs || [],
            padding_before_minutes: t.paddingBefore || 0,
            padding_after_minutes: t.paddingAfter || 0,
            image_url: t.image || null,
            scheduling_url: t.schedulingUrl || null,
            form_ids: t.formIDs || [],
            last_synced_at: new Date().toISOString(),
          });
        } else {
          serviceRows.push({
            acuity_type_id: t.id,
            name: fallbackName,
            description: t.description || null,
            duration_minutes: t.duration || 30,
            price_cents: priceCents,
            barber_id: barberId,
            category: t.category || null,
            color: t.color || null,
            is_active: !t.private,
            addon_ids: t.addonIDs || [],
            padding_before_minutes: t.paddingBefore || 0,
            padding_after_minutes: t.paddingAfter || 0,
            image_url: t.image || null,
            scheduling_url: t.schedulingUrl || null,
            form_ids: t.formIDs || [],
            last_synced_at: new Date().toISOString(),
          });
        }
      }
    }

    // Upsert services (ignoreDuplicates=false so locked rows still receive metadata updates)
    let servicesError: string | null = null;
    if (serviceRows.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from("services")
        .upsert(serviceRows, { onConflict: "acuity_type_id,barber_id" });

      if (upsertErr) {
        console.error("Services upsert error:", upsertErr);
        servicesError = upsertErr.message;
      }
    }

    // Build addon rows: one per addon per barber that has a service using it
    const addonRows: any[] = [];
    const seenAddonBarber = new Set<string>();

    for (const addon of addonsList) {
      // Find which barbers offer services that include this addon
      for (const t of acuityTypes) {
        const typeAddonIDs: number[] = t.addonIDs || [];
        if (!typeAddonIDs.includes(addon.id)) continue;

        const calIDs: number[] = t.calendarIDs || [];
        for (const calId of calIDs) {
          const barberId = calToBarber.get(calId);
          if (!barberId) continue;

          const key = `${addon.id}|${barberId}`;
          if (seenAddonBarber.has(key)) continue;
          seenAddonBarber.add(key);

          const priceCents = addon.price ? Math.round(parseFloat(addon.price) * 100) : 0;

          addonRows.push({
            acuity_addon_id: addon.id,
            name: addon.name,
            duration_minutes: addon.duration || 0,
            price_cents: priceCents,
            barber_id: barberId,
            is_active: true,
            last_synced_at: new Date().toISOString(),
          });
        }
      }
    }

    // Upsert addons
    let addonsError: string | null = null;
    if (addonRows.length > 0) {
      const { error: addonUpsertErr } = await supabaseAdmin
        .from("service_addons")
        .upsert(addonRows, { onConflict: "acuity_addon_id,barber_id" });

      if (addonUpsertErr) {
        console.error("Addons upsert error:", addonUpsertErr);
        addonsError = addonUpsertErr.message;
      }
    }

    return json({
      success: !servicesError && !addonsError,
      services: {
        acuity_types_fetched: acuityTypes.length,
        synced: serviceRows.length,
        error: servicesError,
      },
      addons: {
        acuity_addons_fetched: addonsList.length,
        synced: addonRows.length,
        error: addonsError,
      },
      barbers_mapped: calToBarber.size,
    });
  } catch (err: any) {
    console.error("Sync error:", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
});
