import { preserveItemizedEdit, readEditItems } from "../_shared/appointmentEditItems.ts";
import { createAcuityAddonResolver } from "../_shared/acuityAddons.ts";
import { preserveFranciscoName } from "../_shared/acuityClientName.ts";
import { contactEmail } from "../_shared/contactEmail.ts";
import { isNativeMode } from "../_shared/nativeDraft.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("acuity-sync: start");
    // --- Auth check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Native scheduler: the database is the source of truth; Acuity events must not rewrite it.
    if (await isNativeMode(supabaseAdmin)) {
      return new Response(JSON.stringify({ skipped: true, reason: "native_provider" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Role check: only shop staff may run the sync ---
    let callerIsOwner = false;
    {
      const uid = String(claimsData.claims.sub || "");
      const { data: roleRows } = await supabaseAdmin
        .from("user_roles").select("role").eq("user_id", uid);
      const allowed = (roleRows ?? []).some((r: { role: string }) =>
        ["owner", "super_owner", "manager", "staff", "barber"].includes(r.role));
      callerIsOwner = (roleRows ?? []).some((r: { role: string }) =>
        r.role === "owner" || r.role === "super_owner");
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // --- Acuity credentials ---
    const acuityUserId = Deno.env.get("ACUITY_USER_ID");
    const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
    if (!acuityUserId || !acuityApiKey) {
      return new Response(
        JSON.stringify({ error: "Acuity credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const basicAuth = btoa(`${acuityUserId}:${acuityApiKey}`);

    // --- Load barber mapping from DB ---
    const { data: barbers, error: barbersError } = await supabaseAdmin
      .from("barbers")
      .select("id, acuity_calendar_key");

    if (barbersError) {
      return new Response(
        JSON.stringify({ error: "Failed to load barbers", details: barbersError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build calendar-name → barber_id map
    const calendarKeyToBarber: Record<string, string> = {};
    for (const b of barbers) {
      if (b.acuity_calendar_key) {
        calendarKeyToBarber[b.acuity_calendar_key.toUpperCase()] = b.id;
      }
    }

    // --- Fetch calendars from Acuity to map calendar ID → key ---
    const calRes = await fetch("https://acuityscheduling.com/api/v1/calendars", {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    const calendars = await calRes.json();

    const calendarIdToBarber: Record<number, string> = {};
    for (const cal of calendars) {
      // Match calendar name to our keys (CHARLIE, PITO, JOSEPH)
      const name = (cal.name || "").toUpperCase().trim();
      for (const [key, barberId] of Object.entries(calendarKeyToBarber)) {
        if (name.includes(key)) {
          calendarIdToBarber[cal.id] = barberId;
          break;
        }
      }
    }

    // --- Determine date range from request body or default to current week ---
    let minDate: string;
    let maxDate: string;

    try {
      const body = await req.json();
      if (body?.minDate && body?.maxDate) {
        minDate = body.minDate;
        maxDate = body.maxDate;
      } else {
        throw new Error("no range");
      }
    } catch {
      // Default to current week (Mon-Sun)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + mondayOffset);
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      minDate = fmt(monday);
      maxDate = fmt(sunday);
    }

    // --- Fetch appointments from Acuity (chunked by month for large ranges) ---
    const allAppointments: any[] = [];
    
    // Split range into monthly chunks to avoid 500-item API limit
    const startDate = new Date(minDate);
    const endDate = new Date(maxDate);
    const chunks: { min: string; max: string }[] = [];
    
    const current = new Date(startDate);
    while (current <= endDate) {
      const chunkEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0); // last day of month
      const actualEnd = chunkEnd > endDate ? endDate : chunkEnd;
      const fmtD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      chunks.push({ min: fmtD(current), max: fmtD(actualEnd) });
      current.setFullYear(current.getFullYear(), current.getMonth() + 1, 1);
    }
    
    console.log(`acuity-sync: fetching ${chunks.length} chunk(s) from ${minDate} to ${maxDate}`);
    
    const chunkResults = await Promise.all(
      chunks.map(async (chunk) => {
        const apptUrl = `https://acuityscheduling.com/api/v1/appointments?minDate=${chunk.min}&maxDate=${chunk.max}&max=500`;
        try {
          const apptRes = await fetch(apptUrl, {
            headers: { Authorization: `Basic ${basicAuth}` },
          });
          const data = await apptRes.json();
          return { chunk, data };
        } catch (e) {
          return { chunk, data: null, error: (e as Error).message };
        }
      })
    );
    for (const { chunk, data: chunkData } of chunkResults) {
      if (Array.isArray(chunkData)) {
        allAppointments.push(...chunkData);
      } else {
        console.error(`Unexpected response for chunk ${chunk.min}-${chunk.max}:`, chunkData);
      }
    }
    
    const appointments = allAppointments;

    if (appointments.length === 0) {
      console.log("acuity-sync: no appointments found");
    }

    // --- Preload existing appointments to avoid N+1 lookups ---
    const acuityIds = appointments.map((a: { id: number }) => a.id);
    const existingApptMap = new Map<number, {
      id: string;
      payment_confirmed: boolean;
      payment_method: string | null;
      amount_paid_cents: number;
      tip_cents: number;
      paid: boolean;
      status: string | null;
      client_id: string | null;
      client_name: string | null;
      cancelled_at: string | null;
      cancelled_by_role: string | null;
      refund_status: string | null;
      last_pushed_at: string | null;
      edit_line_items: unknown;
      duration_minutes: number;
    }>();
    if (acuityIds.length > 0) {
      // Chunk to avoid URL length limits on .in()
      const chunkSize = 500;
      for (let i = 0; i < acuityIds.length; i += chunkSize) {
        const slice = acuityIds.slice(i, i + chunkSize);
        const { data: existing } = await supabaseAdmin
          .from("appointments")
          .select("id, acuity_id, payment_confirmed, payment_method, amount_paid_cents, tip_cents, paid, status, client_id, client_name, cancelled_at, cancelled_by_role, refund_status, last_pushed_at, booking_source, edit_line_items, duration_minutes, price_cents, service_id, service_name, addons")
          .in("acuity_id", slice);
        for (const e of existing || []) {
          existingApptMap.set(e.acuity_id, e);
        }
      }
    }

    // Database-level slot guard companion: after the cleanup migration there can
    // only be one active appointment per barber/start/end. Acuity may still send
    // legacy duplicate records with different acuity_id values; keep the row
    // already in our DB and skip the incoming shadow instead of failing the batch.
    const activeSlotMap = new Map<string, { id: string; acuity_id: number; client_email: string | null; client_phone: string | null; amount_paid_cents: number; payment_confirmed: boolean }>();
    const hasRealContact = (email?: string | null, phone?: string | null) => {
      const cleanEmail = contactEmail(email);
      const cleanPhone = String(phone || "").replace(/\D/g, "");
      return !!cleanEmail || cleanPhone.length >= 7;
    };
    const slotKey = (barberId: string, startsAt: string, endsAt: string) =>
      `${barberId}|${new Date(startsAt).getTime()}|${new Date(endsAt).getTime()}`;
    const { data: activeSlots } = await supabaseAdmin
      .from("appointments")
      .select("id, acuity_id, barber_id, starts_at, ends_at, client_email, client_phone, amount_paid_cents, payment_confirmed")
      .gte("starts_at", `${minDate}T00:00:00-04:00`)
      .lte("starts_at", `${maxDate}T23:59:59-04:00`)
      .neq("status", "cancelled");
    for (const s of activeSlots || []) {
      activeSlotMap.set(slotKey(s.barber_id, s.starts_at, s.ends_at), {
        id: s.id,
        acuity_id: s.acuity_id,
        client_email: s.client_email,
        client_phone: s.client_phone,
        amount_paid_cents: s.amount_paid_cents ?? 0,
        payment_confirmed: !!s.payment_confirmed,
      });
    }
    const pendingSlotMap = new Map<string, number>();

    // --- Map and upsert (batched) ---
    let upsertCount = 0;
    const errors: string[] = [];
    const rowsToUpsert: Record<string, unknown>[] = [];
    const resolveAddonNames = createAcuityAddonResolver(async () => {
      const response = await fetch("https://acuityscheduling.com/api/v1/appointment-addons", {
        headers: { Authorization: `Basic ${basicAuth}` },
      });
      if (!response.ok) throw new Error(`Add-on catalog HTTP ${response.status}`);
      return response.json();
    }, (error) => console.warn("acuity-sync: add-on names unresolved; preserving stored names", String(error)));

    for (const appt of appointments) {
      const barberId = calendarIdToBarber[appt.calendarID];
      if (!barberId) {
        errors.push(`No barber mapping for calendarID=${appt.calendarID} (appt ${appt.id})`);
        continue;
      }

      const startsAt = new Date(appt.datetime).toISOString();
      const endsAt = new Date(
        new Date(appt.datetime).getTime() + (appt.duration || 30) * 60_000
      ).toISOString();

      const priceCents = Math.round(parseFloat(appt.price || "0") * 100);
      const amountPaidCents = Math.round(parseFloat(appt.amountPaid || "0") * 100);
      const acuityPaid = appt.paid === "yes"; // "yes" = paid online through Acuity
      
      const notes = (appt.notes || "").toLowerCase();
      const isCancelled = !!appt.canceled;
      const isNoShow = !!appt.noShow;
      const isPast = new Date(appt.datetime) < new Date();
      
      let paymentMethod: string | null = null;
      let effectiveAmountPaid = amountPaidCents;
      let isPaid = false;
      
      let paymentConfirmed = false;
      
      if (acuityPaid) {
        // Digital payment confirmed by Acuity
        paymentMethod = notes.includes("ath") ? "ath_movil" : "stripe";
        if (effectiveAmountPaid === 0) effectiveAmountPaid = priceCents;
        isPaid = true;
        paymentConfirmed = true;
      } else if (amountPaidCents > 0) {
        // Partial or full payment recorded but not via Acuity checkout
        paymentMethod = "cash";
        isPaid = amountPaidCents >= priceCents;
        paymentConfirmed = amountPaidCents >= priceCents;
      }
      // Past appointments with no payment evidence stay unpaid
      // until manually confirmed via checkout or webhook
      // Future appointments with no payment stay unpaid
      
      // Tip detection: if amountPaid > price, the difference is a tip
      const tipCents = effectiveAmountPaid > priceCents ? effectiveAmountPaid - priceCents : 0;

      const addonNames = readEditItems(existingApptMap.get(appt.id)?.edit_line_items)
        ? undefined : await resolveAddonNames(appt);
      const row = {
        acuity_id: appt.id,
        barber_id: barberId,
        client_name: `${appt.firstName || ""} ${appt.lastName || ""}`.trim() || "Unknown",
        client_email: contactEmail(appt.email),
        client_phone: appt.phone || null,
        acuity_client_id: appt.clientID || null,
        service_name: appt.type || "Unknown",
        service_id: appt.appointmentTypeID || null,
        ...(addonNames !== undefined ? { addons: addonNames } : {}),
        starts_at: startsAt,
        ends_at: endsAt,
        duration_minutes: appt.duration || 30,
        price_cents: priceCents,
        paid: isPaid && !isCancelled && !isNoShow,
        payment_method: paymentMethod,
        amount_paid_cents: effectiveAmountPaid,
        tip_cents: tipCents,
        notes: appt.notes || null,
        label: appt.label || null,
        status: isCancelled ? "cancelled" : isNoShow ? "no_show" : "scheduled",
        payment_confirmed: paymentConfirmed,
        booking_source: "acuity_sync",
        updated_at: new Date().toISOString(),
      };

      // Check preloaded map for existing confirmed payment data
      const existingAppt = existingApptMap.get(appt.id);

      // HARD-DELETE on cancellation when no payment is recorded.
      // Owner directive: don't leave "cancelled" ghosts in the calendar.
      if (isCancelled && existingAppt && (existingAppt.amount_paid_cents ?? 0) === 0 && !existingAppt.payment_confirmed) {
        const { data: hardDel, error: hardDelErr } = await supabaseAdmin.rpc("webhook_hard_delete_appointment", {
          _appointment_id: existingAppt.id,
          _reason: "Acuity sync: cancellation (no payment) → hard delete",
        });
        if (!hardDelErr && (hardDel as any)?.success) {
          continue; // skip upsert — row is gone
        }
        // If hard-delete failed, fall through to normal cancelled upsert
      }
      if (isCancelled && !existingAppt) {
        continue; // never import cancelled Acuity rows as local ghosts
      }

      const locallyCancelled = existingAppt?.status === "cancelled" && !isCancelled;
      if (locallyCancelled) {
        row.status = "cancelled";
        row.paid = false;
        row.client_id = existingAppt.client_id;
        row.client_name = existingAppt.client_name || row.client_name;
        row.cancelled_at = existingAppt.cancelled_at || new Date().toISOString();
        row.cancelled_by_role = existingAppt.cancelled_by_role || "owner";
        row.refund_status = existingAppt.refund_status || "none";
      }
      if (existingAppt?.payment_confirmed) {
        row.paid = existingAppt.paid;
        row.payment_method = existingAppt.payment_method;
        row.amount_paid_cents = existingAppt.amount_paid_cents;
        row.tip_cents = existingAppt.tip_cents;
        row.payment_confirmed = existingAppt.payment_confirmed;
      }
      preserveItemizedEdit(row, existingAppt);
      preserveFranciscoName(row, existingAppt);
      // Preserve the original booking_source for any row that was created
      // natively (PWA / public site / admin / walk-in). Acuity sync should
      // never downgrade an attributed booking to 'acuity_sync' because that
      // makes the appointment ineligible for rewards + referral matching.
      if (existingAppt?.booking_source && existingAppt.booking_source !== "acuity_sync" && existingAppt.booking_source !== "unknown") {
        row.booking_source = existingAppt.booking_source;
      }

      // Echo-loop guard: if we just pushed this appointment to Acuity within
      // the last 30 seconds, ignore the inbound starts/ends/duration so a
      // freshly-rescheduled appointment isn't reverted by stale Acuity data.
      const lastPushed = (existingAppt as any)?.last_pushed_at
        ? new Date((existingAppt as any).last_pushed_at).getTime()
        : 0;
      if (lastPushed && Date.now() - lastPushed < 30_000) {
        delete (row as any).starts_at;
        delete (row as any).ends_at;
        delete (row as any).duration_minutes;
        for (const key of ["price_cents", "service_id", "service_name", "addons", "amount_paid_cents", "tip_cents", "paid", "payment_confirmed", "payment_method"]) delete (row as any)[key];
      }

      if (row.status !== "cancelled" && (row as any).starts_at && (row as any).ends_at) {
        const key = slotKey(barberId, (row as any).starts_at, (row as any).ends_at);
        const existingSlot = activeSlotMap.get(key);
        const pendingAcuityId = pendingSlotMap.get(key);
        if (existingSlot && existingSlot.acuity_id !== appt.id) {
          const existingHasRealContact = hasRealContact(existingSlot.client_email, existingSlot.client_phone);
          const incomingHasRealContact = hasRealContact((row as any).client_email, (row as any).client_phone);
          const existingHasPayment = existingSlot.amount_paid_cents > 0 || existingSlot.payment_confirmed;
          if (!existingHasRealContact && incomingHasRealContact && !existingHasPayment) {
            const { data: hardDel, error: hardDelErr } = await supabaseAdmin.rpc("webhook_hard_delete_appointment", {
              _appointment_id: existingSlot.id,
              _reason: "Acuity sync: replaced placeholder duplicate with real-contact appointment",
            });
            if (!hardDelErr && (hardDel as any)?.success) {
              activeSlotMap.set(key, {
                id: String((row as any).id || "pending"),
                acuity_id: appt.id,
                client_email: (row as any).client_email || null,
                client_phone: (row as any).client_phone || null,
                amount_paid_cents: (row as any).amount_paid_cents || 0,
                payment_confirmed: !!(row as any).payment_confirmed,
              });
            } else {
              errors.push(`Skipped duplicate active slot acuity_id=${appt.id}; existing acuity_id=${existingSlot.acuity_id}; cleanup failed=${hardDelErr?.message || JSON.stringify(hardDel)}`);
              continue;
            }
          } else {
          errors.push(`Skipped duplicate active slot acuity_id=${appt.id}; existing acuity_id=${existingSlot.acuity_id}`);
          continue;
          }
        }
        if (pendingAcuityId && pendingAcuityId !== appt.id) {
          errors.push(`Skipped duplicate active slot in incoming batch acuity_id=${appt.id}; pending acuity_id=${pendingAcuityId}`);
          continue;
        }
        pendingSlotMap.set(key, appt.id);
      }

      rowsToUpsert.push(row);
    }

    // Batch upsert all appointment rows in chunks
    const upsertChunkSize = 100;
    for (let i = 0; i < rowsToUpsert.length; i += upsertChunkSize) {
      const slice = rowsToUpsert.slice(i, i + upsertChunkSize);
      const { error: upsertError } = await supabaseAdmin
        .from("appointments")
        .upsert(slice, { onConflict: "acuity_id" });
      if (upsertError) {
        // Isolate: retry row-by-row so one conflicting row can't drop valid ones.
        for (const one of slice) {
          const { error: oneErr } = await supabaseAdmin
            .from("appointments")
            .upsert(one, { onConflict: "acuity_id" });
          if (!oneErr) { upsertCount += 1; continue; }
          errors.push(`Upsert failed acuity_id=${(one as any).acuity_id}: ${oneErr.message}`);
          if (String(oneErr.message).includes("appointments_no_barber_overlap")) {
            const { error: cErr } = await supabaseAdmin.from("acuity_sync_conflicts").insert({
              acuity_id: (one as any).acuity_id,
              source: "acuity-sync",
              conflict_reason: "overlaps existing local appointment",
              payload: one,
              status: "open",
            });
            if (cErr && (cErr as any).code !== "23505") errors.push(`Conflict record failed: ${cErr.message}`);
          }
        }
      } else {
        upsertCount += slice.length;
      }
    }

    // --- Upsert clients from appointments ---
    // Acuity doesn't provide a clientID in appointment responses, so we deduplicate
    // by normalized name + phone (or name + email if no phone).
    type ClientData = { firstName: string; lastName: string; email: string; phone: string; barberId: string; startsAt: string };
    const clientMap = new Map<string, ClientData>();

    for (const appt of appointments) {
      const firstName = (appt.firstName || "").trim();
      const lastName = (appt.lastName || "").trim();
      const phone = (appt.phone || "").trim();
      const email = contactEmail(appt.email) || "";

      // Complete-profile gate: skip if missing any required field
      if (!firstName || firstName === "…") continue;
      if (!lastName || lastName === "." || lastName === "…") continue;
      if (!phone) continue;
      if (!email) continue;

      const barberId = calendarIdToBarber[appt.calendarID];
      if (!barberId) continue;

      // Create a dedup key: normalized name + phone or email
      const normName = `${firstName} ${lastName}`.toLowerCase().replace(/\s+/g, " ");
      const key = phone ? `${normName}|p:${phone}` : email ? `${normName}|e:${email}` : `${normName}|solo`;

      const existing = clientMap.get(key);
      const apptDate = appt.datetime || "";

      if (!existing || apptDate > existing.startsAt) {
        clientMap.set(key, { firstName, lastName, email, phone, barberId, startsAt: apptDate });
      }
    }

    let clientsUpserted = 0;
    const clientErrors: string[] = [];

    for (const [, data] of clientMap.entries()) {
      const cleanLast = data.lastName && data.lastName !== "." ? data.lastName : null;

      // Database lookup is required here. The previous in-memory preload only
      // returned the default 1,000 rows, so older clients outside that slice were
      // missed and Acuity sync recreated them as duplicate email profiles.
      let existingId: string | undefined;
      const { data: matchedClientId, error: matchErr } = await supabaseAdmin.rpc("find_client_by_identity", {
        _phone: data.phone || null,
        _email: data.email || null,
      });
      if (matchErr) {
        clientErrors.push(`Client lookup failed: ${matchErr.message}`);
        continue;
      }
      if (matchedClientId) existingId = matchedClientId as string;

      if (existingId) {
        // DB IS SOURCE OF TRUTH for client contact info.
        // Acuity only fills BLANK fields — never overwrites edits made in the app.
        const { data: existing } = await supabaseAdmin
          .from("clients")
          .select("first_name, last_name, phone, email")
          .eq("id", existingId)
          .maybeSingle();
        const patch: Record<string, unknown> = {
          last_visit_at: data.startsAt ? new Date(data.startsAt).toISOString() : null,
          updated_at: new Date().toISOString(),
        };
        if (!existing?.first_name && data.firstName) patch.first_name = data.firstName;
        if (!existing?.last_name && cleanLast) patch.last_name = cleanLast;
        if (!existing?.email && data.email) patch.email = data.email;
        if (!existing?.phone && data.phone) patch.phone = data.phone;

        const { error: updateErr } = await supabaseAdmin
          .from("clients")
          .update(patch)
          .eq("id", existingId);

        if (updateErr) {
          clientErrors.push(`Client update failed: ${updateErr.message}`);
        } else {
          clientsUpserted++;
        }
      } else {
        const { data: newClient, error: insertErr } = await supabaseAdmin
          .from("clients")
          .insert({
            first_name: data.firstName,
            last_name: cleanLast,
            email: data.email || null,
            phone: data.phone || null,
            preferred_barber_id: data.barberId,
            last_visit_at: data.startsAt ? new Date(data.startsAt).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (insertErr) {
          clientErrors.push(`Client insert failed: ${insertErr.message}`);
        } else if (newClient) {
          clientsUpserted++;
        }
      }
    }

    // --- Cleanup: delete incomplete client profiles ---
    // Keep newsletter-only subscribers. They may have only an email address
    // when they join from the public newsletter form, so treating them as
    // incomplete appointment clients would silently remove them from the list.
    // Destructive global cleanup is owner-only.
    // DISABLED: this global DELETE matched ~500 clients still linked to
    // appointments, timed out (~6-8s) on every sync and rolled back, loading
    // the database and slowing the app. Kept as a no-op until a safe,
    // appointment-aware cleanup is designed.
    void callerIsOwner;
    const { data: deletedClients, error: cleanupError } =
      { data: [] as { id: string }[], error: null as null | { message: string } };

    const cleanedCount = deletedClients?.length || 0;

    // NOTE: total_spent_cents/total_visits are maintained by the
    // sync_client_stats trigger on `transactions`. The previous per-client
    // recalculation loop here was the main cause of 504 timeouts (one OR
    // query per client × hundreds of clients) and has been removed.

    // --- Fetch and upsert block times from Acuity (parallel) ---
    let blockUpsertCount = 0;
    const blockErrors: string[] = [];
    let totalBlocksFromAcuity = 0;

    const calEntries = Object.entries(calendarIdToBarber);
    const blockResults = await Promise.all(
      calEntries.map(async ([calIdStr, barberId]) => {
        const calId = Number(calIdStr);
        const blockUrl = `https://acuityscheduling.com/api/v1/blocks?calendarID=${calId}&minDate=${minDate}&maxDate=${maxDate}`;
        try {
          const blockRes = await fetch(blockUrl, {
            headers: { Authorization: `Basic ${basicAuth}` },
          });
          const blocks = await blockRes.json();
          return { calId, barberId, blocks };
        } catch (e) {
          return { calId, barberId, blocks: null, error: (e as Error).message };
        }
      })
    );

    const blockRowsToUpsert: Record<string, unknown>[] = [];
    for (const { calId, barberId, blocks } of blockResults) {
      if (!Array.isArray(blocks)) {
        blockErrors.push(`Unexpected blocks response for calendarID=${calId}`);
        continue;
      }
      totalBlocksFromAcuity += blocks.length;
      for (const block of blocks) {
        const bStart = new Date(block.start);
        const bEnd = new Date(block.end);
        const durationHours = (bEnd.getTime() - bStart.getTime()) / 3_600_000;
        blockRowsToUpsert.push({
          acuity_block_id: block.id,
          barber_id: barberId,
          starts_at: bStart.toISOString(),
          ends_at: bEnd.toISOString(),
          is_all_day: durationHours >= 23,
          is_multi_day: durationHours >= 47,
          notes: block.notes || null,
        });
      }
    }

    // Batch upsert blocks
    const blockChunkSize = 100;
    for (let i = 0; i < blockRowsToUpsert.length; i += blockChunkSize) {
      const slice = blockRowsToUpsert.slice(i, i + blockChunkSize);
      const { error: blockUpsertError } = await supabaseAdmin
        .from("block_times")
        .upsert(slice, { onConflict: "acuity_block_id" });
      if (blockUpsertError) {
        blockErrors.push(`Block batch upsert failed (chunk ${i}): ${blockUpsertError.message}`);
      } else {
        blockUpsertCount += slice.length;
      }
    }

    // --- Reconcile: remove local Acuity-sourced blocks deleted in Acuity ---
    // Anything inside the synced window with an acuity_block_id that Acuity no
    // longer returns was deleted upstream, so it must disappear locally too.
    // Internal auto-blocks (`Auto-block:appt:`) are owned by the app, not Acuity.
    let blocksRemoved = 0;
    const allBlocksOk = blockResults.every((r) => Array.isArray(r.blocks));
    if (allBlocksOk) {
      const liveIds = new Set(blockRowsToUpsert.map((r) => r.acuity_block_id as number));
      const windowStart = `${minDate}T00:00:00-04:00`;
      const windowEnd = `${maxDate}T23:59:59-04:00`;
      const { data: localBlocks, error: localBlocksErr } = await supabaseAdmin
        .from("block_times")
        .select("id, acuity_block_id, notes")
        .not("acuity_block_id", "is", null)
        .gte("starts_at", windowStart)
        .lte("starts_at", windowEnd);
      if (localBlocksErr) {
        blockErrors.push(`Reconcile fetch failed: ${localBlocksErr.message}`);
      } else {
        const stale = (localBlocks || [])
          .filter(
            (b) =>
              !String(b.notes || "").startsWith("Auto-block:appt:") &&
              !liveIds.has(Number(b.acuity_block_id))
          )
          .map((b) => b.id);
        for (let i = 0; i < stale.length; i += 100) {
          const slice = stale.slice(i, i + 100);
          const { error: delErr } = await supabaseAdmin
            .from("block_times")
            .delete()
            .in("id", slice);
          if (delErr) blockErrors.push(`Reconcile delete failed: ${delErr.message}`);
          else blocksRemoved += slice.length;
        }
      }
    }


    return new Response(
      JSON.stringify({
        success: true,
        range: `${minDate} to ${maxDate}`,
        acuity_count: appointments.length,
        upserted: upsertCount,
        errors,
        clients: {
          unique_from_appointments: clientMap.size,
          upserted: clientsUpserted,
          incomplete_deleted: cleanedCount,
          errors: clientErrors,
        },
        blocks: {
          acuity_count: totalBlocksFromAcuity,
          upserted: blockUpsertCount,
          removed: blocksRemoved,
          errors: blockErrors,
        },

        calendar_mapping: Object.fromEntries(
          calendars.map((c: { id: number; name: string }) => [
            c.name,
            calendarIdToBarber[c.id] || "UNMAPPED",
          ])
        ),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
