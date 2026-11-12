// Public booking edge function — no auth required.
// Multi-action: list-calendars, list-services, list-addons, list-dates, list-times, create.
// All Acuity calls happen server-side; client never sees credentials.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { notifyOwners } from "../_shared/notifyOwners.ts";
import { contactEmail } from "../_shared/contactEmail.ts";
import { readAvailabilityDuration } from "./availabilityDuration.ts";
import { BookingRejectedError, nativeRpcError } from "../_shared/nativeBooking.ts";
import { nativeQuote, nativeShopFor } from "../_shared/nativeDraft.ts";
import {
  nativeErrorCode,
  nativeErrorStatus,
  nativeListAddons,
  nativeListCalendars,
  nativeListDates,
  nativeListServices,
  nativeListTimes,
  parseCatalogQuery,
} from "../_shared/native/catalog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "").slice(-10);
}

async function acuityFetch(path: string, init: RequestInit = {}) {
  const acuityUserId = Deno.env.get("ACUITY_USER_ID");
  const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
  if (!acuityUserId || !acuityApiKey) throw new Error("Acuity not configured");
  const basicAuth = btoa(`${acuityUserId}:${acuityApiKey}`);
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://acuityscheduling.com/api/v1${path}${sep}admin=true`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const action = String(body.action || "");

    // ─── Native scheduler (shops.booking_provider = native): catalogue, hours and booking come from
    // this database. Acuity shops fall through to the Acuity code below, unchanged. ───
    let nativeShopId: string | null = null;
    if (action !== "list-products") {
      try {
        const sp = await nativeShopFor(createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!), null);
        if (sp.kind === "native") nativeShopId = sp.shopId;
      } catch (e) {
        console.warn("[public-booking-create] provider lookup failed, using Acuity path:", (e as Error).message);
      }
    }
    if (nativeShopId) {
      const nAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const q = parseCatalogQuery(body);
      try {
        if (action === "list-calendars") return jsonRes(await nativeListCalendars(nAdmin, nativeShopId));
        if (action === "list-services") return jsonRes(await nativeListServices(nAdmin, nativeShopId));
        if (action === "list-addons") return jsonRes(await nativeListAddons(nAdmin, nativeShopId));
        if (action === "list-dates") {
          if (!q.serviceId || !q.month) return jsonRes({ error: "Missing fields" }, 400);
          return jsonRes(await nativeListDates(nAdmin, nativeShopId, { serviceId: q.serviceId, barberId: q.barberId, addonIds: q.addonIds, month: q.month }));
        }
        if (action === "list-times") {
          if (!q.serviceId || !q.date) return jsonRes({ error: "Missing fields" }, 400);
          if (!/^d{4}-d{2}-d{2}$/.test(String(q.date))) return jsonRes({ error: "Invalid date" }, 400);
          return jsonRes(await nativeListTimes(nAdmin, nativeShopId, { serviceId: q.serviceId, barberId: q.barberId, addonIds: q.addonIds, date: q.date }));
        }
      } catch (e) {
        const status = nativeErrorStatus(e);
        console.error(JSON.stringify({ event: "public_catalog_failed", fn: "public-booking-create", action, code: nativeErrorCode(e), status }));
        return jsonRes({ error: status >= 500 ? "availability_unavailable" : nativeErrorCode(e) }, status);
      }
    }

    // ─── READ actions (no DB writes) ───
    if (action === "list-calendars") {
      const { data } = await acuityFetch("/calendars");
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: barberRows, error: barberErr } = await admin
        .from("barbers_public")
        .select("id, acuity_calendar_id, avatar_url, name")
        .eq("is_active", true);
      if (barberErr) console.error("[public-booking-create] barbers_public select error:", barberErr);
      const enriched = (Array.isArray(data) ? data : []).map((cal: { id: number; name: string }) => {
        const match = (barberRows || []).find(
          (b) =>
            b.acuity_calendar_id === cal.id ||
            (b.name && cal.name.toUpperCase().includes(b.name.split(" ")[0].toUpperCase()))
        );
        return {
          id: cal.id,
          name: cal.name,
          avatarUrl: match?.avatar_url || null,
          barberId: match?.id || null,
        };
      }).filter((c) => c.barberId); // only show calendars mapped to active barbers
      return jsonRes(enriched);
    }

    if (action === "list-services") {
      const { data } = await acuityFetch("/appointment-types");
      const filtered = (Array.isArray(data) ? data : []).filter(
        (t: { private?: boolean }) => !t.private
      );
      return jsonRes(filtered);
    }

    if (action === "list-addons") {
      const { data } = await acuityFetch("/appointment-addons");
      const filtered = (Array.isArray(data) ? data : []).filter(
        (a: { id: number }) => a.id !== 584093
      );
      return jsonRes(filtered);
    }

    // Mini-shop: list active products with stock for the public booking flow.
    // Public read uses service-role bypass (no auth required for guests).
    if (action === "list-products") {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: products, error: prodErr } = await admin
        .from("products")
        .select("id, name, description, category, price_cents, image_url, stock_count, sort_order")
        .eq("is_active", true)
        .gt("stock_count", 0)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (prodErr) {
        console.error("[list-products] error:", prodErr);
        return jsonRes({ error: prodErr.message }, 500);
      }
      return jsonRes(products || []);
    }

    if (action === "list-dates") {
      const { appointmentTypeID, calendarID, month } = body;
      if (!appointmentTypeID || !calendarID || !month) return jsonRes({ error: "Missing fields" }, 400);
      const { data } = await acuityFetch(
        `/availability/dates?appointmentTypeID=${appointmentTypeID}&calendarID=${calendarID}&month=${encodeURIComponent(month)}`
      );
      return jsonRes(Array.isArray(data) ? data : []);
    }

    if (action === "list-times") {
      const { appointmentTypeID, calendarID, date, addonIDs } = body;
      if (!appointmentTypeID || !calendarID || !date) return jsonRes({ error: "Missing fields" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return jsonRes({ error: "Invalid date" }, 400);
      // Combined availability: Acuity candidates minus local busy intervals
      // (appointments + active holds), using full service + add-on duration.
      // Fails closed; returns times only, never other clients' data.
      const [slotsRes, totalMin] = await Promise.all([
        acuityFetch(`/availability/times?appointmentTypeID=${Number(appointmentTypeID)}&calendarID=${Number(calendarID)}&date=${encodeURIComponent(date)}`),
        readAvailabilityDuration(acuityFetch, Number(appointmentTypeID), (Array.isArray(addonIDs) ? addonIDs : []).map(Number)),
      ]);
      if (!slotsRes.ok || !Array.isArray(slotsRes.data)) return jsonRes({ error: "availability_unavailable" }, 503);
      if (totalMin === null) return jsonRes({ error: "duration_unknown" }, 503);
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: barber } = await admin.from("barbers").select("id").eq("acuity_calendar_id", Number(calendarID)).maybeSingle();
      if (!barber?.id) return jsonRes({ error: "availability_unavailable" }, 503);
      // Window starts the day before so cross-midnight intervals are caught.
      const dayStart = new Date(`${date}T00:00:00-04:00`).getTime();
      const { data: busy, error: busyErr } = await admin.rpc("get_busy_intervals", {
        _barber_id: barber.id,
        _window_start: new Date(dayStart - 24 * 3600_000).toISOString(),
        _window_end: new Date(dayStart + 48 * 3600_000).toISOString(),
      });
      if (busyErr) return jsonRes({ error: "availability_unavailable" }, 503);
      const intervals = (busy || []).map((b: any) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
      const free = (slotsRes.data as Array<{ time: string }>).filter((s) => {
        const st = new Date(s.time).getTime();
        const en = st + totalMin * 60_000;
        return !intervals.some(([bs, be]) => st < be && en > bs);
      });
      return jsonRes(free);
    }

    // ─── CREATE booking ───
    if (action === "create") {
      const { appointmentTypeID, calendarID, datetime, firstName, lastName, phone, email, addonIDs, notes, confirmedClientId } = body;
      if (!appointmentTypeID || !calendarID || !datetime || !firstName || !phone) {
        return jsonRes({ error: "Missing required fields" }, 400);
      }

      const fName = String(firstName).trim().slice(0, 80);
      const lName = String(lastName || "").trim().slice(0, 80);
      const phoneNorm = normalizePhone(String(phone));
      if (phoneNorm.length < 7) return jsonRes({ error: "Invalid phone" }, 400);
      const emailTrim = contactEmail(String(email || "").slice(0, 255)) || "";
      const acuityEmail = emailTrim || `${phoneNorm}@placeholder.local`;

      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // ─── Unified client matching (guest matrix) ───
      // Both match  → silent attach
      // Email only  → silent attach + update profile phone to incoming number
      // Phone only  → require explicit client confirmation (returns 200 + requiresPhoneConfirm)
      // None        → create new profile
      let clientId: string | null = null;
      let isReturning = false;
      let cardOnFile: { brand: string | null; last4: string | null } | null = null;
      let returningName: string | null = null;

      const { data: matchRows } = await admin.rpc("find_matching_client", {
        _phone: phoneNorm || null,
        _email: emailTrim ? emailTrim.toLowerCase() : null,
      });
      const match = Array.isArray(matchRows) && matchRows.length > 0 ? matchRows[0] : null;
      const matchType = (match?.match_type as string) || "none";
      const matchedId = (match?.client_id as string) || null;

      // If the client just confirmed a phone-only match on the previous call, honor it.
      const confirmedMatchId = typeof confirmedClientId === "string" && confirmedClientId === matchedId
        ? matchedId
        : null;

      if (matchedId && (matchType === "both" || matchType === "email" || confirmedMatchId)) {
        clientId = matchedId;
        const { data: prof } = await admin
          .from("clients")
          .select("first_name")
          .eq("id", matchedId)
          .maybeSingle();
        if (prof) {
          isReturning = true;
          returningName = prof.first_name;
          // Saved card details are never returned to unauthenticated callers.
        }
        // Email-only match: never overwrite the saved profile phone from an
        // unauthenticated request. The typed phone stays on this booking only.
      } else if (matchedId && matchType === "phone") {
        // Phone-only match: require explicit confirmation from the booker.
        return jsonRes({
          requiresPhoneConfirm: true,
          match: {
            clientId: matchedId,
            displayName: match?.display_name || null,
          },
        });
      } else {
        const { data: created, error: createErr } = await admin
          .from("clients")
          .insert({
            first_name: fName,
            last_name: lName || null,
            phone: phoneNorm,
            email: emailTrim || null,
            is_guest: true,
            account_verified: false,
            booking_source: "public_site",
          })
          .select("id")
          .single();
        if (createErr || !created) {
          return jsonRes({ error: "Could not create client", detail: createErr?.message }, 500);
        }
        clientId = created.id;
      }

      // ─── Native scheduler: validate with the public rules, then book atomically in the database ───
      if (nativeShopId) {
        const addonIds = Array.isArray(addonIDs) ? addonIDs.map((a: unknown) => String(a)) : [];
        const { data: nBarber } = await admin.from("barbers").select("id, name").eq("id", String(calendarID)).eq("shop_id", nativeShopId).maybeSingle();
        if (!nBarber?.id) return jsonRes({ error: "Barber not found" }, 400);
        const qte = await nativeQuote(admin, nativeShopId, {
          serviceId: String(appointmentTypeID), barberId: nBarber.id, addonIds, startsAt: String(datetime),
        });
        if (!qte.ok) return jsonRes({ error: qte.error === "slot_unavailable" ? "slot_taken" : qte.error }, qte.status);
        const { data: booked, error: bookErr } = await admin.rpc("book_native_slot", {
          _shop_id: nativeShopId,
          _barber_id: nBarber.id,
          _service_id: String(appointmentTypeID),
          _starts_at: qte.startsAt,
          _client: { client_id: clientId, first_name: fName, last_name: lName || null, phone: phoneNorm, email: emailTrim || null },
          _addon_ids: addonIds,
          _notes: notes ? String(notes).slice(0, 1000) : null,
          _booking_source: "public_site",
          _created_by_role: "public_site",
          _created_by_user_id: null,
          _payment: {},
          _price_cents: null,
          _draft_id: null,
          _recurring_group_id: null,
          _label: null,
          _as_staff: false,
          _allow_overlap: false,
        });
        if (bookErr || !booked) {
          const e = nativeRpcError(bookErr);
          if (e instanceof BookingRejectedError) return jsonRes({ error: e.reason === "slot_held" ? "slot_taken" : e.reason }, 409);
          console.error("[public-booking-create] native booking failed:", e.message);
          return jsonRes({ error: "booking_failed" }, 500);
        }
        const row = booked as Record<string, any>;
        try {
          const dateStr = new Date(row.starts_at).toLocaleString("es-PR", {
            timeZone: "America/Puerto_Rico", weekday: "short", day: "2-digit", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
          });
          notifyOwners({
            event_key: "admin_booking_new",
            vars: { source: "Sitio público", client: row.client_name, service: row.service_name, barber: nBarber.name, date: dateStr, appointment_id: row.id },
            defaults: {
              title: "Nueva cita (Sitio público)",
              body: `${row.client_name} reservó ${row.service_name}, ${dateStr}.`,
              url: `/admin/appointment/${row.id}`,
              tag: `new-appointment-${row.id}`,
            },
          }).catch((e) => console.warn("notifyOwners warn:", (e as Error).message));
        } catch (e) {
          console.warn("notifyOwners setup warn:", (e as Error).message);
        }
        if (emailTrim) {
          const dateLabel = new Date(row.starts_at).toLocaleString("es-PR", {
            weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Puerto_Rico",
          });
          const cents = Number(row.price_cents) || 0;
          admin.functions.invoke("send-transactional-email", {
            body: {
              templateName: "booking-confirmation",
              recipientEmail: emailTrim,
              idempotencyKey: `booking-unpaid-${row.id}`,
              templateData: {
                clientName: fName || undefined,
                serviceName: row.service_name,
                barberName: nBarber.name,
                appointmentDate: dateLabel,
                totalLabel: cents > 0 ? `$${(cents / 100).toFixed(2)}` : "Pago al llegar",
                payUrl: `https://charliesbarbershop.co/pay/${row.id}`,
                isPaid: false,
              },
            },
          }).catch((e) => console.error("Email send failed:", e));
        }
        return jsonRes({
          success: true,
          acuityId: null,
          appointmentId: row.id,
          clientId,
          isReturning,
          returningName,
          cardOnFile,
          appointment: {
            id: row.id,
            starts_at: row.starts_at,
            service_name: row.service_name,
            barber_name: nBarber.name,
            price: ((Number(row.price_cents) || 0) / 100).toFixed(2),
            duration: row.duration_minutes,
          },
        });
      }

      // Resolve barber from calendarID
      const { data: calRow } = await admin
        .from("barbers_public")
        .select("id, name")
        .eq("acuity_calendar_id", calendarID)
        .maybeSingle();
      if (!calRow?.id) return jsonRes({ error: "Barber not found" }, 400);

      // Acuity create
      const acuityRes = await acuityFetch("/appointments", {
        method: "POST",
        body: JSON.stringify({
          appointmentTypeID,
          calendarID,
          datetime,
          firstName: fName,
          lastName: lName || fName,
          email: acuityEmail,
          phone,
          notes: notes || "",
          addonIDs: addonIDs || [],
        }),
      });

      const acuityData = acuityRes.data as Record<string, unknown> & { id?: number; error?: string; message?: string; status_code?: number };
      if (!acuityRes.ok || acuityData?.error || (acuityData?.status_code ?? 0) >= 400) {
        return jsonRes(
          { error: acuityData?.message || acuityData?.error || "Acuity booking failed" },
          400
        );
      }

      const startsAt = String(acuityData.datetime);
      const duration = Number(acuityData.duration) || 30;
      const endsAt = new Date(new Date(startsAt).getTime() + duration * 60_000).toISOString();
      const addonNames = ((acuityData.addons as { name: string }[]) || []).map((a) => a.name);

      const { data: upserted, error: upsertErr } = await admin.from("appointments").upsert(
        {
          acuity_id: acuityData.id,
          barber_id: calRow.id,
          client_name: `${acuityData.firstName} ${acuityData.lastName}`.trim(),
          client_email: contactEmail(acuityData.email),
          client_phone: (acuityData.phone as string) || null,
          client_id: clientId,
          service_name: acuityData.type as string,
          service_id: acuityData.appointmentTypeID as number,
          addons: addonNames,
          starts_at: startsAt,
          ends_at: endsAt,
          duration_minutes: duration,
          price_cents: Math.round(parseFloat(String(acuityData.price || "0")) * 100),
          status: "scheduled",
          paid: false,
          created_by_role: "public_site",
          booking_source: "public_site",
        },
        { onConflict: "acuity_id" }
      ).select("id").single();
      if (upsertErr) console.error("Appointment upsert failed:", upsertErr);

      // Fire-and-forget: push owners on every public-site booking (paid or not).
      if (upserted?.id) {
        try {
          const clientFullName = `${acuityData.firstName ?? ""} ${acuityData.lastName ?? ""}`.trim() || "Cliente";
          const serviceName = String(acuityData.type || "Servicio");
          const dateStr = new Date(startsAt).toLocaleString("es-PR", {
            timeZone: "America/Puerto_Rico",
            weekday: "short", day: "2-digit", month: "short",
            hour: "numeric", minute: "2-digit", hour12: true,
          });
          const barberName = (calRow?.name as string | undefined)?.trim() || String((acuityData as { calendar?: string }).calendar || "").trim() || "Barbero";
          notifyOwners({
            event_key: "admin_booking_new",
            vars: { source: "Sitio público", client: clientFullName, service: serviceName, barber: barberName, date: dateStr, appointment_id: upserted.id },
            defaults: {
              title: "Nueva cita (Sitio público)",
              body: `${clientFullName} reservó ${serviceName}, ${dateStr}.`,
              url: `/admin/appointment/${upserted.id}`,
              tag: `new-appointment-${upserted.id}`,
            },
          }).catch((e) => console.warn("notifyOwners warn:", (e as Error).message));
        } catch (e) {
          console.warn("notifyOwners setup warn:", (e as Error).message);
        }
      }

      // Fire-and-forget: send unpaid booking confirmation email with Pay link.
      // Idempotency key derived from acuity_id ensures no duplicates if request is retried.
      const confirmationEmail = contactEmail(acuityData.email);
      if (upserted?.id && confirmationEmail) {
        const apptDate = new Date(startsAt);
        const dateLabel = apptDate.toLocaleString("es-PR", {
          weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
          timeZone: "America/Puerto_Rico",
        });
        const priceCents = Math.round(parseFloat(String(acuityData.price || "0")) * 100);
        const totalLabel = priceCents > 0 ? `$${(priceCents / 100).toFixed(2)}` : "Pago al llegar";

        admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "booking-confirmation",
            recipientEmail: confirmationEmail,
            idempotencyKey: `booking-unpaid-${acuityData.id}`,
            templateData: {
              clientName: String(acuityData.firstName || "").trim() || undefined,
              serviceName: acuityData.type as string,
              barberName: calRow.name,
              appointmentDate: dateLabel,
              totalLabel,
              payUrl: `https://charliesbarbershop.co/pay/${upserted.id}`,
              isPaid: false,
            },
          },
        }).catch((e) => console.error("Email send failed:", e));
      }

      return jsonRes({
        success: true,
        acuityId: acuityData.id,
        appointmentId: upserted?.id,
        clientId,
        isReturning,
        returningName,
        cardOnFile,
        appointment: {
          id: upserted?.id,
          starts_at: startsAt,
          service_name: acuityData.type,
          barber_name: calRow.name,
          price: acuityData.price,
          duration,
        },
      });
    }

    return jsonRes({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonRes({ error: (err as Error).message }, 500);
  }
});
