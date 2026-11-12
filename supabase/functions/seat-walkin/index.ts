import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contactEmail } from "../_shared/contactEmail.ts";
import { nativeRpcError } from "../_shared/nativeBooking.ts";
import { nativeShopFor } from "../_shared/nativeDraft.ts";
// Phase 1B.TIMEZONE: utcIsoToAcuityDatetime imported dynamically inside handler.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Strip emojis, lowercase, collapse whitespace */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Safely parse Acuity-style dates (offset without colon like -0400) */
function safeParseDate(s: string): Date {
  // Insert colon in timezone offset if missing: -0400 → -04:00
  const fixed = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(fixed);
  if (isNaN(d.getTime())) throw new Error(`Cannot parse date: ${s}`);
  return d;
}

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
    // ── Auth check ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Service-role client for DB operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller is authenticated
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabaseUser.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Enforce staff role (owner or barber). Do NOT default to admin.
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", claimsData.user.id)
      .in("role", ["owner", "barber"])
      .maybeSingle();
    if (!roleRow) {
      return json({ error: "Forbidden: staff role required" }, 403);
    }
    const callerRole = roleRow.role === "owner" ? "admin" : "barber";
    const callerUserId = claimsData.user.id;


    // ── Parse request ──
    const body = await req.json();
    const { waitlist_id, barber_id, email, seated_at_datetime } = body;

    if (!waitlist_id || !barber_id || !seated_at_datetime) {
      return json({ error: "Missing required fields" }, 400);
    }

    // ── 1. VALIDATE ──
    const { data: entry, error: fetchErr } = await supabaseAdmin
      .from("waitlist")
      .select("*")
      .eq("id", waitlist_id)
      .maybeSingle();

    if (fetchErr || !entry) {
      return json({ error: "Waitlist entry not found" }, 404);
    }
    if (entry.status !== "waiting") {
      return json(
        { error: "This client has already been seated or removed." },
        409,
      );
    }

    // Fetch barber
    const { data: barber } = await supabaseAdmin
      .from("barbers")
      .select("id, name, acuity_calendar_id")
      .eq("id", barber_id)
      .single();

    if (!barber) {
      return json({ error: "Barber not found" }, 404);
    }

    // Native scheduler: no Acuity call even if the barber still has an acuity_calendar_id.
    const seatShop = await nativeShopFor(supabaseAdmin, null);
    const isNativeSeat = seatShop.kind === "native";
    let acuityAppointmentId: number | null = null;
    let acuitySkipped = false;
    let acuityData: any = null;

    // ── 2. MATCH SERVICE FROM LOCAL DB ──
    const normalizedWaitlistService = normalize(entry.service_name);

    // Query local services table — prefer match for this barber
    const { data: localServices } = await supabaseAdmin
      .from("services")
      .select("id, acuity_type_id, name, duration_minutes, price_cents, barber_id")
      .eq("is_active", true);

    let matchedService: any = null;
    let fallbackService: any = null;

    for (const s of localServices || []) {
      if (normalize(s.name) === normalizedWaitlistService) {
        if (s.barber_id === barber_id) {
          matchedService = s;
          break;
        }
        if (!fallbackService) fallbackService = s;
      }
    }

    const service = matchedService || fallbackService;
    if (!service) {
      return json({ error: `Servicio no encontrado: ${entry.service_name}` }, 422);
    }

    console.log("Matched local service:", service.name, "acuity_type_id:", service.acuity_type_id);

    // ── 3. CREATE APPOINTMENT IN ACUITY (if barber has calendar) ──
    if (!isNativeSeat && barber.acuity_calendar_id) {
      const acuityUserId = Deno.env.get("ACUITY_USER_ID");
      const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
      if (!acuityUserId || !acuityApiKey) {
        return json({ error: "Acuity credentials not configured" }, 500);
      }
      const basicAuth = btoa(`${acuityUserId}:${acuityApiKey}`);

      // Build Acuity-format ISO with the SHOP timezone offset (Phase 1B.TIMEZONE).
      // Replaces the old hardcoded `utcMs - 4*60*60*1000` math + literal "-0400".
      const utc = new Date(seated_at_datetime);
      const tz = "America/Puerto_Rico"; // fallback if shop_settings unreachable
      let acuityDatetime: string;
      try {
        // Convert UTC instant → wall-clock in shop tz → Acuity ISO with shop offset.
        // toAcuityDatetime expects shop-local wall-clock components; derive them
        // by passing the UTC moment through Luxon (handled inside _shared/timezone).
        const { utcIsoToAcuityDatetime } = await import("../_shared/timezone.ts");
        acuityDatetime = await utcIsoToAcuityDatetime(utc.toISOString());
      } catch (_e) {
        // Last-resort fallback (preserves old PR-only behavior)
        const astMs = utc.getTime() - 4 * 60 * 60 * 1000;
        const ast = new Date(astMs);
        const pad = (n: number) => String(n).padStart(2, "0");
        acuityDatetime = `${ast.getUTCFullYear()}-${pad(ast.getUTCMonth() + 1)}-${pad(ast.getUTCDate())}T${pad(ast.getUTCHours())}:${pad(ast.getUTCMinutes())}:00-04:00`;
      }

      const acuityRes = await fetch(
        "https://acuityscheduling.com/api/v1/appointments?admin=true",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            appointmentTypeID: service.acuity_type_id,
            calendarID: barber.acuity_calendar_id,
            datetime: acuityDatetime,
            firstName: entry.first_name,
            lastName: entry.last_name || "Client",
            email: email || (entry.phone ? `${entry.phone}@placeholder.local` : ""),
            phone: entry.phone || "",
            notes: "Walk-in — Lista de Espera",
            admin: true,
          }),
        },
      );

      const acuityText = await acuityRes.text();
      try {
        acuityData = JSON.parse(acuityText);
      } catch {
        return json({ error: `Acuity error: ${acuityText}` }, 502);
      }

      if (!acuityRes.ok || acuityData?.status_code >= 400 || acuityData?.error) {
        const msg = acuityData?.message || acuityData?.error || "Unknown Acuity error";
        return json({ error: msg }, 502);
      }

      acuityAppointmentId = acuityData.id;
      console.log("Acuity appointment created:", acuityAppointmentId);
    } else {
      acuitySkipped = !isNativeSeat;
    }

    // ── 3. UPDATE WAITLIST ROW ──
    const updatePayload: Record<string, any> = {
      status: "seated",
      seated_at: seated_at_datetime,
      barber_id: barber_id,
    };
    if (acuitySkipped) {
      updatePayload.notes = "Walk-in — Sin Acuity";
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("waitlist")
      .update(updatePayload)
      .eq("id", waitlist_id)
      .eq("status", "waiting")
      .select("id");

    if (updateErr) {
      // Race condition: Acuity appt created but DB update failed
      if (acuityAppointmentId) {
        // Try to reverse the Acuity appointment
        const acuityUserId = Deno.env.get("ACUITY_USER_ID");
        const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
        if (acuityUserId && acuityApiKey) {
          const basicAuth = btoa(`${acuityUserId}:${acuityApiKey}`);
          await fetch(
            `https://acuityscheduling.com/api/v1/appointments/${acuityAppointmentId}?admin=true`,
            {
              method: "PUT",
              headers: {
                Authorization: `Basic ${basicAuth}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ canceled: true }),
            },
          ).then((r) => r.text());
        }
      }
      return json(
        { error: "This client has already been seated or removed." },
        409,
      );
    }

    if (!updated || updated.length === 0) {
      // Another worker already seated this entry — that's OK, proceed to create local appointment
      console.log("Waitlist already seated by another worker, proceeding to link appointment");
    }

    // ── 4. CREATE LOCAL APPOINTMENT DIRECTLY ──
    let localAppointmentId: string | null = null;

    if (isNativeSeat) {
      // Native: the appointment is written by the database function (same lock as online bookings).
      // Staff seating a walk-in may share time with another appointment (like Acuity admin=true).
      const { data: booked, error: bookErr } = await supabaseAdmin.rpc("book_native_slot", {
        _shop_id: seatShop.shopId,
        _barber_id: barber_id,
        _service_id: service.id,
        _starts_at: new Date(seated_at_datetime).toISOString(),
        _client: {
          client_id: entry.client_id || null,
          first_name: entry.first_name,
          last_name: entry.last_name || null,
          phone: entry.phone || null,
          email: contactEmail(email) || null,
        },
        _addon_ids: [],
        _notes: "Walk-in — Lista de Espera",
        _booking_source: "walk_in",
        _created_by_role: callerRole,
        _created_by_user_id: callerUserId,
        _payment: {},
        _price_cents: null,
        _draft_id: null,
        _recurring_group_id: null,
        _label: null,
        _as_staff: true,
        _allow_overlap: true,
      });
      if (bookErr || !booked) {
        const e = nativeRpcError(bookErr);
        // Put the client back in the queue: nothing was booked.
        await supabaseAdmin.from("waitlist").update({ status: "waiting", seated_at: null }).eq("id", waitlist_id).eq("status", "seated");
        return json({ error: (e as any).reason || "native_booking_failed", detail: e.message }, 409);
      }
      localAppointmentId = (booked as any).id;
      await supabaseAdmin.from("waitlist").update({ appointment_id: localAppointmentId }).eq("id", waitlist_id);
    } else if (acuityAppointmentId && acuityData) {
      // Use data directly from the Acuity POST response (no re-fetch needed)
      const clientName = `${entry.first_name} ${entry.last_name || ""}`.trim();
      const startsAt = acuityData.datetime
        ? safeParseDate(acuityData.datetime).toISOString()
        : seated_at_datetime;
      const durationMin = acuityData.duration || entry.service_duration_minutes || 30;
      let endsAt: string;
      try {
        endsAt = acuityData.endTime
          ? safeParseDate(acuityData.endTime).toISOString()
          : new Date(new Date(startsAt).getTime() + durationMin * 60000).toISOString();
      } catch {
        // Acuity sometimes returns endTime as just a time string like "8:15pm"
        endsAt = new Date(new Date(startsAt).getTime() + durationMin * 60000).toISOString();
      }
      const priceCents = acuityData.price
        ? Math.round(parseFloat(acuityData.price) * 100)
        : 0;
      const serviceName = acuityData.type || entry.service_name;

      console.log("Inserting local appointment for acuity_id:", acuityAppointmentId);

      const { data: insertedAppt, error: insertErr } = await supabaseAdmin
        .from("appointments")
        .insert({
          acuity_id: acuityAppointmentId,
          barber_id: barber_id,
          client_name: clientName,
          client_phone: entry.phone || null,
          client_email: contactEmail(email),
          service_name: serviceName,
          starts_at: startsAt,
          ends_at: endsAt,
          duration_minutes: durationMin,
          price_cents: priceCents,
          status: "scheduled",
          notes: "Walk-in — Lista de Espera",
          client_id: entry.client_id || null,
          created_by_role: callerRole,
          created_by_user_id: callerUserId,
          booking_source: "walk_in",
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("Insert failed:", JSON.stringify(insertErr));
        // If duplicate acuity_id, the webhook already created it — find and link
        if (insertErr.code === "23505") {
          const { data: existing } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("acuity_id", acuityAppointmentId)
            .maybeSingle();
          if (existing?.id) localAppointmentId = existing.id;
        }
      } else if (insertedAppt) {
        localAppointmentId = insertedAppt.id;
        console.log("Local appointment created:", localAppointmentId);
      }

      // Link appointment to waitlist
      if (localAppointmentId) {
        await supabaseAdmin
          .from("waitlist")
          .update({ appointment_id: localAppointmentId })
          .eq("id", waitlist_id);
      }
    } else if (acuitySkipped) {
      // No Acuity — still create a local appointment so it shows in calendar
      const clientName = `${entry.first_name} ${entry.last_name || ""}`.trim();
      const durationMin = entry.service_duration_minutes || 30;
      const startsAt = seated_at_datetime;
      const endsAt = new Date(new Date(startsAt).getTime() + durationMin * 60000).toISOString();

      const { data: insertedAppt, error: insertErr } = await supabaseAdmin
        .from("appointments")
        .insert({
          acuity_id: 0,
          barber_id: barber_id,
          client_name: clientName,
          client_phone: entry.phone || null,
          service_name: entry.service_name,
          starts_at: startsAt,
          ends_at: endsAt,
          duration_minutes: durationMin,
          price_cents: 0,
          status: "scheduled",
          notes: "Walk-in — Sin Acuity",
          client_id: entry.client_id || null,
          created_by_role: callerRole,
          created_by_user_id: callerUserId,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("Insert (no-acuity) failed:", JSON.stringify(insertErr));
      } else if (insertedAppt) {
        localAppointmentId = insertedAppt.id;
        await supabaseAdmin
          .from("waitlist")
          .update({ appointment_id: insertedAppt.id })
          .eq("id", waitlist_id);
      }
    }

    // ── 5. RETURN SUCCESS ──
    return json({
      success: true,
      waitlist_id,
      acuity_appointment_id: acuityAppointmentId,
      local_appointment_id: localAppointmentId,
      barber_name: barber.name,
      seated_at: seated_at_datetime,
      acuity_skipped: acuitySkipped,
    });
  } catch (err: any) {
    return json({ error: err.message || "Internal error" }, 500);
  }
});
