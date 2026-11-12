import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { queueOrDispatchRecurringPush } from "../_shared/recurringPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Allowlisted Acuity API path prefixes
const ALLOWED_PATH_PREFIXES = [
  "/appointments",
  "/appointment-types",
  "/appointment-addons",
  "/calendars",
  "/availability",
  "/blocks",
  "/clients",
  "/forms",
  "/addons",
  "/webhooks", // owner-only, used to register/inspect webhook subscriptions
];

// Paths clients can read (GET only)
const CLIENT_READ_PREFIXES = [
  "/calendars",
  "/appointment-types",
  "/availability",
  "/appointment-addons",
  "/addons",
];

// Paths clients can POST to
const CLIENT_WRITE_PREFIXES = ["/appointments"];

// Write methods restricted to owner/barber roles
const WRITE_METHODS = ["POST", "PUT", "DELETE", "PATCH"];

function appendQueryParam(path: string, key: string, value: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(value)}`;
}

function sameMinute(a: string, b: string): boolean {
  return Math.floor(new Date(a).getTime() / 60000) === Math.floor(new Date(b).getTime() / 60000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;

    // Look up role from user_roles table using service role client
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const role = roleRow?.role;
    if (role !== "owner" && role !== "barber" && role !== "client") {
      return new Response(
        JSON.stringify({ error: "Forbidden: authenticated users only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Parse request ---
    const { path, method = "GET", body: rawBody } = await req.json();
    let body = rawBody;

    if (!path || typeof path !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing required field: path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Path allowlist validation ---
    const normalizedPath = path.split("?")[0]; // strip query params for prefix check
    const isAllowed = ALLOWED_PATH_PREFIXES.some((prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(prefix + "/") || normalizedPath.startsWith(prefix + "?")
    );

    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: "Path not allowed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Webhook subscriptions are owner-only (shop-wide configuration) ---
    if ((normalizedPath === "/webhooks" || normalizedPath.startsWith("/webhooks/")) && role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Client role restrictions ---
    if (role === "client") {
      const upperMethod = (method || "GET").toUpperCase();
      const isClientRead = upperMethod === "GET" && CLIENT_READ_PREFIXES.some((p) =>
        normalizedPath === p || normalizedPath.startsWith(p + "/") || normalizedPath.startsWith(p + "?")
      );
      const isClientWrite = upperMethod === "POST" && CLIENT_WRITE_PREFIXES.some((p) =>
        normalizedPath === p || normalizedPath.startsWith(p + "/")
      );
      // Allow reschedule and cancel (PUT /appointments/{id}/reschedule or /appointments/{id}/cancel)
      const rcMatch = upperMethod === "PUT" ? normalizedPath.match(/^\/appointments\/(\d+)\/(reschedule|cancel)$/) : null;
      const isClientRescheduleOrCancel = !!rcMatch;

      if (!isClientRead && !isClientWrite && !isClientRescheduleOrCancel) {
        return new Response(
          JSON.stringify({ error: "Forbidden: clients can only read services/availability and manage their appointments" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // New bookings by a client are always tied to the caller's own contact details.
      if (isClientWrite) {
        if (!/^\/appointments(\?.*)?$/.test(normalizedPath)) {
          return new Response(
            JSON.stringify({ error: "Forbidden" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { data: me } = await adminClient
          .from("clients")
          .select("id, email, phone")
          .eq("auth_user_id", userId)
          .maybeSingle();
        if (!me?.id || !me.email) {
          return new Response(
            JSON.stringify({ error: "Forbidden: no client profile" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const b = (body && typeof body === "object") ? { ...(body as Record<string, unknown>) } : {};
        b.email = me.email;
        if (me.phone) b.phone = me.phone;
        body = b;
      }

      // IDOR guard: for reschedule/cancel, verify the appointment belongs to this client
      if (rcMatch) {
        const acuityId = Number(rcMatch[1]);
        const { data: callerClient } = await adminClient
          .from("clients")
          .select("id")
          .eq("auth_user_id", userId)
          .maybeSingle();
        if (!callerClient?.id) {
          return new Response(
            JSON.stringify({ error: "Forbidden: no client profile" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const { data: targetAppt } = await adminClient
          .from("appointments")
          .select("id, client_id")
          .eq("acuity_id", acuityId)
          .maybeSingle();
        if (!targetAppt || targetAppt.client_id !== callerClient.id) {
          return new Response(
            JSON.stringify({ error: "Forbidden: appointment does not belong to this client" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // --- Restrict write methods for barbers ---
    // Barbers can POST (some Acuity reads use POST) and write to /blocks and /appointments
    const BARBER_WRITE_PREFIXES = ["/blocks", "/appointments"];
    if (WRITE_METHODS.includes(method.toUpperCase()) && role !== "owner" && role !== "client") {
      const isPost = method.toUpperCase() === "POST";
      const isBarberWritePath = BARBER_WRITE_PREFIXES.some((p) =>
        normalizedPath === p || normalizedPath.startsWith(p + "/")
      );
      if (!isPost && !isBarberWritePath) {
        return new Response(
          JSON.stringify({ error: "Forbidden: owner only for this method" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Build Acuity request ---
    const acuityUserId = Deno.env.get("ACUITY_USER_ID");
    const acuityApiKey = Deno.env.get("ACUITY_API_KEY");

    if (!acuityUserId || !acuityApiKey) {
      return new Response(
        JSON.stringify({ error: "Acuity credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const basicAuth = btoa(`${acuityUserId}:${acuityApiKey}`);
    const upperMethod = method.toUpperCase();
    const shouldUseAdmin = WRITE_METHODS.includes(upperMethod) || normalizedPath === "/blocks" || normalizedPath.startsWith("/blocks/");
    const acuityPath = shouldUseAdmin ? appendQueryParam(path, "admin", "true") : path;
    const acuityUrl = `https://acuityscheduling.com/api/v1${acuityPath}`;

    const fetchOptions: RequestInit = {
      method: upperMethod,
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
    };

    if (body && !["GET", "HEAD"].includes(upperMethod)) {
      fetchOptions.body = JSON.stringify(body);
    }

    // Availability guard ONLY for recurring series occurrences.
    // Owners may intentionally double-book one-off appointments; the guard would block that.
    // Recurring loops set respectAvailability:true so they skip occupied slots instead of forcing duplicates.
    if (
      upperMethod === "POST" &&
      normalizedPath === "/appointments" &&
      body?.respectAvailability === true &&
      body?.datetime && body?.appointmentTypeID && body?.calendarID
    ) {
      const date = String(body.datetime).slice(0, 10);
      const availabilityUrl = `https://acuityscheduling.com/api/v1/availability/times?appointmentTypeID=${encodeURIComponent(String(body.appointmentTypeID))}&calendarID=${encodeURIComponent(String(body.calendarID))}&date=${encodeURIComponent(date)}`;
      const availabilityRes = await fetch(availabilityUrl, { headers: { Authorization: `Basic ${basicAuth}` } });
      const availability = await availabilityRes.json().catch(() => []);
      const slotAvailable = Array.isArray(availability) && availability.some((slot: any) => sameMinute(slot.time, body.datetime));
      if (!slotAvailable) {
        return new Response(JSON.stringify({ error: "slot_unavailable", message: "Selected time is no longer available" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Strip the proxy-only flag before sending to Acuity
    if (body && typeof body === "object" && "respectAvailability" in body) {
      const { respectAvailability: _ignore, ...rest } = body as Record<string, unknown>;
      fetchOptions.body = JSON.stringify(rest);
    }

    const acuityRes = await fetch(acuityUrl, fetchOptions);

    // Handle empty responses (e.g. 204 No Content from DELETE)
    const responseText = await acuityRes.text();
    let acuityData: any = null;
    if (responseText) {
      try {
        acuityData = JSON.parse(responseText);
      } catch {
        acuityData = { raw: responseText };
      }
    }

    // --- Tenant filtering (multi-tenant support) ---
    // If TENANT_ACUITY_CALENDAR_IDS is set, filter calendars/types/appointments to this tenant only.
    // Leave unset for single-tenant shops (no filtering).
    const tenantCalRaw = Deno.env.get("TENANT_ACUITY_CALENDAR_IDS");
    if (tenantCalRaw && acuityRes.ok && upperMethod === "GET" && Array.isArray(acuityData)) {
      const tenantCalIds = new Set(
        tenantCalRaw.split(",").map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n))
      );
      if (tenantCalIds.size > 0) {
        if (normalizedPath === "/calendars") {
          acuityData = acuityData.filter((c: any) => tenantCalIds.has(Number(c.id)));
        } else if (normalizedPath === "/appointment-types") {
          acuityData = acuityData.filter((t: any) =>
            Array.isArray(t.calendarIDs) && t.calendarIDs.some((id: any) => tenantCalIds.has(Number(id)))
          );
        } else if (normalizedPath === "/appointments" || normalizedPath.startsWith("/appointments?")) {
          acuityData = acuityData.filter((a: any) => tenantCalIds.has(Number(a.calendarID)));
        }
      }
    }

    if (acuityRes.ok && upperMethod === "PUT") {
      const match = normalizedPath.match(/^\/appointments\/(\d+)\/(reschedule|cancel)$/);
      if (match) {
        const acuityId = Number(match[1]);
        const event = match[2];
        const { data: localAppt } = await adminClient
          .from("appointments")
          .select("id, client_id, service_name, starts_at, barber_id, recurring_group_id, barbers:barber_id(name)")
          .eq("acuity_id", acuityId)
          .maybeSingle();

        if (localAppt?.client_id) {
          try {
            const startsAt = event === "reschedule" ? (acuityData?.datetime || body?.datetime || localAppt.starts_at) : localAppt.starts_at;
            await queueOrDispatchRecurringPush({
              admin: adminClient,
              client_id: localAppt.client_id,
              appointment_id: localAppt.id,
              recurring_group_id: (localAppt as any).recurring_group_id ?? null,
              template_name: event === "reschedule" ? "appointment_rescheduled" : "appointment_cancelled_by_shop",
              starts_at: startsAt,
              service: localAppt.service_name || null,
              barber: (localAppt.barbers as any)?.name || null,
              event_key: event === "reschedule" ? `appt:${localAppt.id}:reschedule:${new Date(startsAt).toISOString()}` : `appt:${localAppt.id}:cancel`,
            });
          } catch (pushErr) {
            console.warn(`[acuity-proxy] ${event} push dispatch failed:`, pushErr);
          }
        }
      }
    }

    // --- Operator audit log: who did what through the app ---
    if (WRITE_METHODS.includes(upperMethod) && (normalizedPath.startsWith("/appointments") || normalizedPath.startsWith("/blocks"))) {
      try {
        const { data: barberRow } = await adminClient.from("barbers").select("id, name").eq("user_id", userId).maybeSingle();
        const idMatch = normalizedPath.match(/^\/(?:appointments|blocks)\/(\d+)/);
        const actionName = /\/cancel$/.test(normalizedPath) ? "cancel"
          : /\/reschedule$/.test(normalizedPath) ? "reschedule"
          : upperMethod === "POST" ? "create" : upperMethod === "DELETE" ? "delete" : "update";
        await adminClient.from("acuity_operator_log").insert({
          user_id: userId,
          user_email: (claimsData.claims as any).email ?? null,
          role,
          barber_id: barberRow?.id ?? null,
          barber_name: barberRow?.name ?? null,
          action: actionName,
          method: upperMethod,
          path: normalizedPath,
          acuity_id: idMatch ? Number(idMatch[1]) : (acuityData?.id ? Number(acuityData.id) : null),
          target_datetime: body?.datetime ?? acuityData?.datetime ?? null,
          target_calendar_id: body?.calendarID ?? acuityData?.calendarID ?? null,
          status_code: acuityRes.status,
          user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        });
      } catch (logErr) {
        console.warn("[acuity-proxy] operator log failed:", (logErr as Error).message);
      }
    }

    return new Response(JSON.stringify(acuityData ?? { success: true }), {
      status: acuityRes.status === 204 ? 200 : acuityRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
