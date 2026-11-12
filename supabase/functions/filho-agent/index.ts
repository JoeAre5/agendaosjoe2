// Filho — concierge AI agent for AgendaOS
// - Anon (public) and authenticated client modes
// - Tool registry gated by role (server-side re-validation per tool)
// - Datetime formatting in -04:00 AST happens in tool layer (LLM never formats dates)
// - Em-dash post-processing filter (replaces — with comma)
// - Persists turns to filho_conversations + filho_messages
// - Uses Lovable AI Gateway (LOVABLE_API_KEY) — google/gemini-2.5-flash by default
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { formatInShopTz, getShopNow } from "../_shared/timezone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";
const MAX_TOOL_HOPS = 6;
// Conversation length guardrails (cost control). Counts USER turns only.
const SOFT_WARN_AT = 10;   // Filho should remind the user to focus on booking
const HARD_LIMIT = 16;     // Refuse further open chat, redirect to booking

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Em-dash sanitizer for customer-facing copy ────────────────────────────
// Memory rule: NEVER use em dashes (—) in user-facing copy. Replace with commas.
function stripEmDashes(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\s*—\s*/g, ", ").replace(/\s*–\s*/g, ", ");
}

// ─── Friendly fallback when the model returns a tool-only turn (no text) ───
// This prevents the dreaded "Tuve un problema generando una respuesta" error
// from showing up whenever Filho fires a uiHint tool without follow-up prose.
function fallbackTextForUiHint(hint: any, locale: "es" | "en"): string {
  const es = locale === "es";
  if (!hint || typeof hint !== "object") {
    return es
      ? "Listo. Si necesitas algo más, escríbeme."
      : "Done. Let me know if you need anything else.";
  }
  if (hint.openBookingFlow) {
    return es
      ? "¡Claro! Te abro la reserva. Toca el botón abajo y escoge tu barbero."
      : "Sure! Opening booking for you. Tap the button below and pick your barber.";
  }
  if (hint.openReschedule) {
    return es
      ? "Te llevo a reagendar tu cita. Toca el botón."
      : "Taking you to reschedule. Tap the button.";
  }
  if (hint.showSavedCardConfirm) {
    return es
      ? "Confirma el pago abajo con tu tarjeta guardada."
      : "Confirm the payment below with your saved card.";
  }
  if (hint.showWhatsAppHandoff) {
    return es
      ? "Te conecto con el barbero por WhatsApp. Toca el botón para escribirle."
      : "Connecting you to the barber on WhatsApp. Tap to message.";
  }
  if (hint.showDirections) {
    return es
      ? "Estamos en " + (hint.address || "Camuy, PR") + ". Toca para abrir en Maps."
      : "We're at " + (hint.address || "Camuy, PR") + ". Tap to open in Maps.";
  }
  if (hint.showCallButton) {
    return es
      ? "Toca para llamar a la barbería."
      : "Tap to call the shop.";
  }
  if (hint.showProfileForm) {
    return es
      ? "Completa tus datos abajo para confirmar tu cita."
      : "Fill in your info below to confirm your appointment.";
  }
  if (hint.showPricingBarberPicker) {
    return es
      ? "En Charlie's, los tres barberos ofrecen los mismos servicios pero con precios distintos según su nivel y disponibilidad. Joseph tiene precios más accesibles, perfecto si buscas excelente trabajo a buen precio. Héctor, por la alta demanda, tiene menos disponibilidad y precios un poco más elevados. Y Charlie maneja precios exclusivos con disponibilidad limitada, para una experiencia premium. ¿De cuál barbero te gustaría ver los precios?"
      : "At Charlie's, all three barbers offer the same services but at different prices based on experience and availability. Joseph has the most accessible pricing, great work at a friendly price. Hector, due to high demand, has less availability and slightly higher prices. And Charlie offers exclusive pricing with limited availability, a premium experience. Which barber's prices would you like to see?";
  }
  if (hint.showBarberPriceList) {
    return es
      ? `Estos son los precios de ${hint.barberName || "este barbero"}. ¿Te abro la reserva?`
      : `Here are ${hint.barberName || "this barber"}'s prices. Want me to open booking?`;
  }
  if (hint.chips && Array.isArray(hint.chips) && hint.chips.length > 0) {
    return es ? "Escoge una opción:" : "Pick an option:";
  }
  return es
    ? "Listo. Si necesitas algo más, escríbeme."
    : "Done. Let me know if you need anything else.";
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ipFromReq(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || "0.0.0.0";
}

// ─── Tool layer ────────────────────────────────────────────────────────────
type Role = "anon" | "client";

interface ToolCtx {
  admin: SupabaseClient;
  role: Role;
  userId: string | null;     // auth.uid() when client
  clientId: string | null;   // public.clients.id when client
  ipHash: string;
}

interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  roles: Role[];
  handler: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<unknown>;
}

// Helper: enforce role at call time (defense in depth)
function assertRole(ctx: ToolCtx, allowed: Role[], name: string) {
  if (!allowed.includes(ctx.role)) {
    throw new Error(`tool_forbidden: ${name} not allowed for role=${ctx.role}`);
  }
}

// ─── TOOLS ─────────────────────────────────────────────────────────────────

const list_services: ToolDef = {
  name: "list_services",
  description: "List bookable services from the shop's admin Services table. ONLY these services may be offered to clients. Do NOT invent or suggest services not in this list.",
  parameters: { type: "object", properties: {}, required: [] },
  roles: ["anon", "client"],
  handler: async (_args, ctx) => {
    assertRole(ctx, ["anon", "client"], "list_services");
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin
      .from("services")
      .select("acuity_type_id, name, duration_minutes, price_cents")
      .eq("is_active", true)
      .eq("is_public", true)
      .order("sort_order", { ascending: true });
    if (error) return { error: "services_fetch_failed", detail: error.message };
    // Dedupe by acuity_type_id (multiple barbers share the same type), keep first.
    const seen = new Set<number>();
    const list = (data || [])
      .filter((s: any) => s.acuity_type_id && !seen.has(s.acuity_type_id) && (seen.add(s.acuity_type_id), true))
      .map((s: any) => ({
        id: s.acuity_type_id,
        name: s.name,
        duration_minutes: s.duration_minutes,
        price_usd: Number(((s.price_cents || 0) / 100).toFixed(2)),
      }));
    return { services: list };
  },
};

const list_barbers: ToolDef = {
  name: "list_barbers",
  description: "List active barbers (name, id). Use to let user pick a barber.",
  parameters: { type: "object", properties: {}, required: [] },
  roles: ["anon", "client"],
  handler: async (_args, ctx) => {
    assertRole(ctx, ["anon", "client"], "list_barbers");
    const { data } = await ctx.admin
      .from("barbers_public")
      .select("id, name, acuity_calendar_id")
      .eq("is_active", true);
    return { barbers: data || [] };
  },
};

const find_available_slots: ToolDef = {
  name: "find_available_slots",
  description: "Get available appointment time slots for a date in AST (America/Puerto_Rico). Returns ISO timestamps already in -04:00.",
  parameters: {
    type: "object",
    properties: {
      service_id: { type: "number", description: "Acuity appointmentTypeID" },
      barber_calendar_id: { type: "number", description: "Acuity calendarID" },
      date: { type: "string", description: "YYYY-MM-DD (interpreted as AST)" },
    },
    required: ["service_id", "barber_calendar_id", "date"],
  },
  roles: ["anon", "client"],
  handler: async (args, ctx) => {
    assertRole(ctx, ["anon", "client"], "find_available_slots");
    const acuityUserId = Deno.env.get("ACUITY_USER_ID");
    const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
    const auth = btoa(`${acuityUserId}:${acuityApiKey}`);
    const url = `https://acuityscheduling.com/api/v1/availability/times?appointmentTypeID=${args.service_id}&calendarID=${args.barber_calendar_id}&date=${encodeURIComponent(String(args.date))}&admin=true`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) return { error: "acuity_fetch_failed", status: res.status };
    const data = await res.json();
    // Format each slot in AST (-04:00) for the LLM
    const slots = await Promise.all(
      (Array.isArray(data) ? data : []).map(async (s: { time: string }) => ({
        iso_ast: s.time, // Acuity already returns -04:00
        label: await formatInShopTz(s.time, "h:mm a"),
      })),
    );
    return { date: args.date, slots };
  },
};

const submit_booking_contact_info: ToolDef = {
  name: "submit_booking_contact_info",
  description:
    "Submit user's contact info to lookup a returning client OR mark for create-on-commit. " +
    "Returns matched=true with first_name and has_account flag when matched. " +
    "If matched, attaches client_id to the in-flight draft (if draft_id provided).",
  parameters: {
    type: "object",
    properties: {
      first_name: { type: "string" },
      last_name: { type: "string" },
      phone: { type: "string", description: "PR phone, any format" },
      email: { type: "string" },
      draft_id: { type: "string", description: "Optional booking draft to attach to" },
    },
    required: ["first_name", "phone"],
  },
  roles: ["anon"],
  handler: async (args, ctx) => {
    assertRole(ctx, ["anon"], "submit_booking_contact_info");
    const first_name = String(args.first_name || "").trim().slice(0, 80);
    const last_name = String(args.last_name || "").trim().slice(0, 80);
    const phone = String(args.phone || "");
    const email = String(args.email || "").trim().slice(0, 255);
    const phoneNorm = phone.replace(/\D/g, "").slice(-10);
    if (!first_name || phoneNorm.length < 10) {
      return { matched: false, error: "invalid_input" };
    }

    // Rate limit + audit (5/hour, 20/day, cooldown 15min after 3 fails)
    const now = Date.now();
    const oneHourAgo = new Date(now - 3600_000).toISOString();
    const oneDayAgo = new Date(now - 86400_000).toISOString();
    const fifteenMinAgo = new Date(now - 15 * 60_000).toISOString();

    const { data: recent } = await ctx.admin
      .from("filho_identity_attempts")
      .select("success, created_at")
      .eq("ip_hash", ctx.ipHash)
      .gte("created_at", oneDayAgo);
    const recentArr = recent || [];
    const lastHour = recentArr.filter((r) => r.created_at >= oneHourAgo).length;
    if (lastHour >= 5) return { matched: false, error: "rate_limited_hour" };
    if (recentArr.length >= 20) return { matched: false, error: "rate_limited_day" };
    const recentFails = recentArr
      .filter((r) => r.created_at >= fifteenMinAgo && !r.success)
      .length;
    if (recentFails >= 3) return { matched: false, error: "cooldown_active" };

    const { data: matchId } = await ctx.admin.rpc("find_client_by_name_phone", {
      _first: first_name,
      _last: last_name,
      _phone: phoneNorm,
    });

    let matched = false;
    let resultClientId: string | null = null;
    let firstNameOut = first_name;
    let hasAccount = false;

    if (matchId) {
      const { data: client } = await ctx.admin
        .from("clients")
        .select("id, first_name, auth_user_id")
        .eq("id", matchId)
        .maybeSingle();
      if (client) {
        matched = true;
        resultClientId = client.id;
        firstNameOut = client.first_name || first_name;
        hasAccount = !!client.auth_user_id;
      }
    }

    // Audit
    await ctx.admin.from("filho_identity_attempts").insert({
      ip_hash: ctx.ipHash,
      attempted_first_name: first_name,
      attempted_last_name: last_name || null,
      attempted_phone_last4: phoneNorm.slice(-4),
      matched_client_id: resultClientId,
      success: matched,
    });

    // Attach client_id to draft if matched + draft_id given
    if (matched && resultClientId && args.draft_id) {
      await ctx.admin
        .from("booking_drafts")
        .update({ client_id: resultClientId, first_name, last_name: last_name || null, phone: phoneNorm, email: email || null })
        .eq("id", String(args.draft_id))
        .eq("status", "pending");
    }

    if (matched) {
      return {
        matched: true,
        first_name: firstNameOut,
        has_account: hasAccount,
        client_id: resultClientId,
        ...(hasAccount ? { uiHint: { loginSuggestion: true } } : {}),
      };
    }
    return { matched: false, will_create_on_commit: true, first_name };
  },
};

const get_my_appointments: ToolDef = {
  name: "get_my_appointments",
  description: "List the authenticated client's upcoming appointments (next 30 days, status != cancelled).",
  parameters: { type: "object", properties: {}, required: [] },
  roles: ["client"],
  handler: async (_args, ctx) => {
    assertRole(ctx, ["client"], "get_my_appointments");
    if (!ctx.clientId) return { error: "no_client" };
    const now = await getShopNow();
    const inThirty = now.plus({ days: 30 }).toUTC().toISO();
    const { data } = await ctx.admin
      .from("appointments")
      .select("id, service_name, starts_at, ends_at, barber_id, status, payment_confirmed, amount_paid_cents, price_cents, barbers:barber_id(name)")
      .eq("client_id", ctx.clientId)
      .neq("status", "cancelled")
      .gte("starts_at", new Date().toISOString())
      .lte("starts_at", inThirty!)
      .order("starts_at", { ascending: true })
      .limit(20);
    const items = await Promise.all(
      (data || []).map(async (a) => ({
        id: a.id,
        service_name: a.service_name,
        barber_name: (a.barbers as { name?: string } | null)?.name || null,
        starts_at_ast: a.starts_at,
        starts_at_label: await formatInShopTz(a.starts_at, "EEEE, d LLLL yyyy, h:mm a"),
        status: a.status,
        paid: !!a.payment_confirmed,
        price_cents: a.price_cents,
        amount_paid_cents: a.amount_paid_cents,
      })),
    );
    return { appointments: items };
  },
};

// present_appointment_picker — when the client wants to cancel/reschedule and
// has 0/1/many upcoming appointments. NEVER ask the client for an id; this
// tool returns chips or a single-confirm hint so the experience feels native.
const present_appointment_picker: ToolDef = {
  name: "present_appointment_picker",
  description:
    "Use this whenever an authenticated client wants to cancel or reschedule but you do NOT yet know WHICH appointment. " +
    "It fetches their upcoming appointments and returns a uiHint with friendly chips (or a single-appointment confirmation). " +
    "NEVER ask the client to type an appointment id, date, or any technical reference. " +
    "After the client picks one (their next message will reference it in plain language), " +
    "look it up in the previous tool result by service/date/barber and call cancel_my_appointment or open_reschedule with the matching id.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["cancel", "reschedule"], description: "Which action the user wants to take." },
    },
    required: ["action"],
  },
  roles: ["client"],
  handler: async (args, ctx) => {
    assertRole(ctx, ["client"], "present_appointment_picker");
    if (!ctx.clientId) return { error: "no_client" };
    const action = args.action === "reschedule" ? "reschedule" : "cancel";
    const now = await getShopNow();
    const inThirty = now.plus({ days: 30 }).toUTC().toISO();
    const { data } = await ctx.admin
      .from("appointments")
      .select("id, service_name, starts_at, barber_id, status, barbers:barber_id(name)")
      .eq("client_id", ctx.clientId)
      .neq("status", "cancelled")
      .gte("starts_at", new Date().toISOString())
      .lte("starts_at", inThirty!)
      .order("starts_at", { ascending: true })
      .limit(10);

    const items = await Promise.all(
      (data || []).map(async (a) => {
        const longLabel = await formatInShopTz(a.starts_at, "EEEE d LLLL, h:mm a");
        const shortLabel = await formatInShopTz(a.starts_at, "EEE d LLL, h:mm a");
        return {
          id: a.id,
          service_name: a.service_name,
          barber_name: (a.barbers as { name?: string } | null)?.name || "",
          long_label: longLabel,
          short_label: shortLabel,
        };
      }),
    );

    if (items.length === 0) {
      return {
        ok: true,
        count: 0,
        action,
        message_es: "No tienes citas próximas para " + (action === "cancel" ? "cancelar" : "reagendar") + ".",
        message_en: "You have no upcoming appointments to " + action + ".",
      };
    }

    if (items.length === 1) {
      const a = items[0];
      const verb_es = action === "cancel" ? "cancelar" : "reagendar";
      const verb_en = action === "cancel" ? "cancel" : "reschedule";
      const send_es = action === "cancel" ? `Sí, cancela mi cita del ${a.short_label}` : `Sí, reagenda mi cita del ${a.short_label}`;
      const send_en = action === "cancel" ? `Yes, cancel my appointment on ${a.short_label}` : `Yes, reschedule my appointment on ${a.short_label}`;
      return {
        ok: true,
        count: 1,
        action,
        appointment_id: a.id,
        appointment_label: a.long_label,
        barber_name: a.barber_name,
        service_name: a.service_name,
        uiHint: {
          chips: [
            { label_es: `Sí, ${verb_es}`, label_en: `Yes, ${verb_en}`, send_es, send_en },
            { label_es: "No, déjala", label_en: "No, keep it", send_es: "No, déjala", send_en: "No, keep it" },
          ],
        },
      };
    }

    // 2+ appointments — chips per appointment
    const chips = items.map((a) => {
      const verb_es = action === "cancel" ? "Cancelar" : "Reagendar";
      const verb_en = action === "cancel" ? "Cancel" : "Reschedule";
      const label_es = `${a.short_label} · ${a.barber_name}`;
      const label_en = `${a.short_label} · ${a.barber_name}`;
      return {
        label_es,
        label_en,
        send_es: `${verb_es} la cita del ${a.short_label} con ${a.barber_name}`,
        send_en: `${verb_en} the appointment on ${a.short_label} with ${a.barber_name}`,
      };
    });

    return {
      ok: true,
      count: items.length,
      action,
      appointments: items,
      uiHint: { chips },
    };
  },
};

const get_my_saved_card: ToolDef = {
  name: "get_my_saved_card",
  description: "Return the authenticated client's saved card brand + last4 (if any).",
  parameters: { type: "object", properties: {}, required: [] },
  roles: ["client"],
  handler: async (_args, ctx) => {
    assertRole(ctx, ["client"], "get_my_saved_card");
    if (!ctx.clientId) return { error: "no_client" };
    const { data } = await ctx.admin
      .from("clients")
      .select("card_brand, card_last4")
      .eq("id", ctx.clientId)
      .maybeSingle();
    if (!data?.card_last4) return { has_card: false };
    return { has_card: true, brand: data.card_brand, last4: data.card_last4 };
  },
};

const request_pay_saved_card: ToolDef = {
  name: "request_pay_saved_card",
  description:
    "Signal the UI to show the saved-card 1-tap confirm sheet for an existing appointment. " +
    "Does NOT charge. Returns a uiHint object the client app should render. The actual charge is done by client-pay-saved-card after the user taps confirm.",
  parameters: {
    type: "object",
    properties: {
      appointment_id: { type: "string" },
      tip_cents: { type: "number", default: 0 },
    },
    required: ["appointment_id"],
  },
  roles: ["client"],
  handler: async (args, ctx) => {
    assertRole(ctx, ["client"], "request_pay_saved_card");
    if (!ctx.clientId) return { error: "no_client" };
    const { data: appt } = await ctx.admin
      .from("appointments")
      .select("id, client_id, price_cents, payment_confirmed, status")
      .eq("id", String(args.appointment_id))
      .maybeSingle();
    if (!appt || appt.client_id !== ctx.clientId) return { error: "appointment_not_found_or_forbidden" };
    if (appt.payment_confirmed) return { error: "already_paid" };
    if (appt.status === "cancelled") return { error: "appointment_cancelled" };

    const { data: client } = await ctx.admin
      .from("clients")
      .select("card_brand, card_last4")
      .eq("id", ctx.clientId)
      .maybeSingle();
    if (!client?.card_last4) return { error: "no_saved_card" };

    const tip = Math.max(0, Math.round(Number(args.tip_cents) || 0));
    const total = (appt.price_cents || 0) + tip;
    return {
      uiHint: {
        showSavedCardConfirm: true,
        appointmentId: appt.id,
        totalCents: total,
        tipCents: tip,
        cardBrand: client.card_brand,
        cardLast4: client.card_last4,
      },
    };
  },
};

// PR is fixed UTC-04:00. Cancel deadline = 00:00 PR time of appointment day
// (i.e. 11:59 PM the day before). Anything past that must go through the barber.
const PR_OFFSET_MS = 4 * 3600 * 1000;
function getCancelDeadlineMs(startsAtIso: string): number {
  const startMs = new Date(startsAtIso).getTime();
  const prLocal = startMs - PR_OFFSET_MS;
  const dayStartPrLocal = Math.floor(prLocal / 86_400_000) * 86_400_000;
  return dayStartPrLocal + PR_OFFSET_MS;
}

const cancel_my_appointment: ToolDef = {
  name: "cancel_my_appointment",
  description:
    "Cancel an authenticated client's appointment. Policy: cancellations are accepted up until 11:59 PM (PR time) of the day BEFORE the appointment. " +
    "Refunds (if any) are handled MANUALLY by the shop, never auto-called.",
  parameters: {
    type: "object",
    properties: { appointment_id: { type: "string" } },
    required: ["appointment_id"],
  },
  roles: ["client"],
  handler: async (args, ctx) => {
    assertRole(ctx, ["client"], "cancel_my_appointment");
    if (!ctx.clientId) return { error: "no_client" };
    const { data: appt } = await ctx.admin
      .from("appointments")
      .select("id, acuity_id, client_id, starts_at, status")
      .eq("id", String(args.appointment_id))
      .maybeSingle();
    if (!appt || appt.client_id !== ctx.clientId) return { error: "appointment_not_found_or_forbidden" };
    if (appt.status === "cancelled") return { error: "already_cancelled" };

    const deadlineMs = getCancelDeadlineMs(appt.starts_at);
    if (Date.now() >= deadlineMs) {
      const deadlineLabel = await formatInShopTz(new Date(deadlineMs - 60_000).toISOString(), "EEEE d LLLL, h:mm a");
      return {
        error: "cancel_window_exceeded",
        deadline_label: deadlineLabel,
      };
    }

    // Cancel in Acuity
    const acuityUserId = Deno.env.get("ACUITY_USER_ID");
    const acuityApiKey = Deno.env.get("ACUITY_API_KEY");
    const auth = btoa(`${acuityUserId}:${acuityApiKey}`);
    if (appt.acuity_id) {
      await fetch(
        `https://acuityscheduling.com/api/v1/appointments/${appt.acuity_id}/cancel?admin=true&noEmail=true`,
        {
          method: "PUT",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({ cancelNote: "Cancelled by client via Filho" }),
        },
      ).catch((e) => console.warn("[filho cancel] acuity error", e));
    }

    await ctx.admin
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by_role: "client",
      })
      .eq("id", appt.id);

    return { success: true, cancelled_at_label: await formatInShopTz(new Date().toISOString()) };
  },
};

// ─── Booking-flow wrappers (call canonical pay-then-book) ──────────────────
const FN_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

async function callPayThenBook(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${FN_BASE}/pay-then-book`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// open_public_booking — Filho NO orquesta el booking. Devuelve un uiHint que
// abre el PublicBookingFlow oficial SIEMPRE en el primer paso (sin preselección).
// El cliente escoge barbero/servicio en el flow, no en el chat.
const open_public_booking: ToolDef = {
  name: "open_public_booking",
  description:
    "Use this whenever the user wants to book / reserve / schedule an appointment. " +
    "Returns a uiHint that opens the official PublicBookingFlow modal at step 1 (no preselection). " +
    "Do NOT ask the user for service / barber / date / time / contact / payment in the chat: the booking flow handles that. " +
    "Your reply MUST be ONE short line, e.g. 'Te abro la reserva.' Do NOT list services, prices or steps in text.",
  parameters: { type: "object", properties: {}, required: [] },
  roles: ["anon", "client"],
  handler: async (_args, _ctx) => {
    return {
      ok: true,
      uiHint: {
        openBookingFlow: true,
        label_es: "Abrir reserva",
        label_en: "Open booking",
      },
    };
  },
};

// open_reschedule — emit a uiHint with the full reschedule URL pre-built so
// the chat can render a "Reagendar" button that takes the client straight to
// the existing /app/cliente/reagendar page (with all required query params).
const open_reschedule: ToolDef = {
  name: "open_reschedule",
  description:
    "Render a 'Reagendar cita' button for an authenticated client. " +
    "Use when the user wants to move/reschedule an existing appointment AND it's still within the cancellation window " +
    "(>= 11:59 PM the day before). If outside the window, do NOT call this — call get_policy_explanation('reschedule') + send_whatsapp_handoff instead. " +
    "Your text reply MUST be ONE short line. The button takes care of the rest.",
  parameters: {
    type: "object",
    properties: { appointment_id: { type: "string" } },
    required: ["appointment_id"],
  },
  roles: ["client"],
  handler: async (args, ctx) => {
    assertRole(ctx, ["client"], "open_reschedule");
    if (!ctx.clientId) return { error: "no_client" };
    const { data: appt } = await ctx.admin
      .from("appointments")
      .select("id, acuity_id, client_id, service_id, service_name, barber_id, duration_minutes, starts_at, status, barbers:barber_id(name)")
      .eq("id", String(args.appointment_id))
      .maybeSingle();
    if (!appt || appt.client_id !== ctx.clientId) return { error: "appointment_not_found_or_forbidden" };
    if (appt.status === "cancelled") return { error: "appointment_cancelled" };
    if (Date.now() >= getCancelDeadlineMs(appt.starts_at)) return { error: "reschedule_window_exceeded" };

    const barberName = (appt.barbers as { name?: string } | null)?.name || "";
    const params = new URLSearchParams({
      apptId: appt.id,
      acuityId: String(appt.acuity_id || ""),
      typeId: String(appt.service_id || ""),
      barberId: appt.barber_id || "",
      service: appt.service_name || "",
      barber: barberName,
      duration: String(appt.duration_minutes || 30),
      startsAt: appt.starts_at,
    });
    return {
      uiHint: {
        openReschedule: true,
        href: `/app/cliente/reagendar?${params.toString()}`,
        appointmentLabel: await formatInShopTz(appt.starts_at, "EEEE d LLLL, h:mm a"),
        label_es: "Reagendar cita",
        label_en: "Reschedule",
      },
    };
  },
};

// repeat_last_appointment — open the public booking flow for an authenticated
// client. Today we cannot pre-fill service/date in PublicBookingFlow (only
// barber via openBooking(slug)), so we resolve last barber's slug if possible.
const SLUG_BY_NAME: Record<string, string> = {
  charlie: "charlie",
  pito: "pito",
  joseph: "joseph",
};
const repeat_last_appointment: ToolDef = {
  name: "repeat_last_appointment",
  description:
    "Open the public booking flow for an authenticated client who wants to repeat their last appointment. " +
    "Preselects the same barber when possible. The client picks the date/time in the flow.",
  parameters: { type: "object", properties: {}, required: [] },
  roles: ["client"],
  handler: async (_args, ctx) => {
    assertRole(ctx, ["client"], "repeat_last_appointment");
    if (!ctx.clientId) return { error: "no_client" };
    const { data: last } = await ctx.admin
      .from("appointments")
      .select("barbers:barber_id(name)")
      .eq("client_id", ctx.clientId)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const name = (last?.barbers as { name?: string } | null)?.name?.toLowerCase().split(" ")[0] || "";
    const slug = SLUG_BY_NAME[name] || null;
    return {
      uiHint: {
        openBookingFlow: true,
        ...(slug ? { barberSlug: slug } : {}),
        label_es: "Repetir mi cita",
        label_en: "Repeat my appointment",
      },
    };
  },
};

// ─── Customer service: policy + WhatsApp handoff ───────────────────────────
const POLICY_KB: Record<string, { es: string; en: string; suggestWhatsapp: boolean }> = {
  cancellation: {
    es: "Puedes cancelar tu cita SIN cargo hasta las 11:59 PM del día ANTES de tu cita (hora de Puerto Rico). Pasada esa hora la silla queda apartada para ti y la app ya no te deja cancelar, porque ese espacio bloquea a otro cliente. Si tienes una emergencia, escríbele al barbero por WhatsApp y veremos qué podemos hacer.",
    en: "You can cancel your appointment AT NO COST up until 11:59 PM the day BEFORE your appointment (Puerto Rico time). After that the chair is held for you and the app no longer allows cancellation, because that slot blocks another client. If it is an emergency, message the barber on WhatsApp and we'll see what we can do.",
    suggestWhatsapp: true,
  },
  reschedule: {
    es: "Reagendar funciona igual que cancelar: hasta las 11:59 PM del día antes puedes mover tu cita desde la app. Más cerca de la hora, escríbele al barbero por WhatsApp para coordinar.",
    en: "Rescheduling follows the same rule: up until 11:59 PM the day before you can move your appointment from the app. Closer to the time, message the barber on WhatsApp to coordinate.",
    suggestWhatsapp: true,
  },
  no_show: {
    es: "Un no-show (no llegar sin avisar) puede afectar tu próxima reserva y el pago no se reembolsa, porque la silla quedó apartada. Si vas a llegar tarde, avísale al barbero por WhatsApp lo antes posible.",
    en: "A no-show (not arriving without notice) can affect your next booking and the payment is non-refundable, because the chair was held. If you'll be late, message the barber on WhatsApp as soon as possible.",
    suggestWhatsapp: true,
  },
  late_arrival: {
    es: "Si llegas más de 10 minutos tarde el barbero puede tener que acortar el servicio o reprogramar para no afectar al próximo cliente. Avísale por WhatsApp si vas en camino.",
    en: "If you arrive more than 10 minutes late the barber may need to shorten the service or reschedule so the next client isn't affected. Message on WhatsApp if you're on your way.",
    suggestWhatsapp: true,
  },
  tip: {
    es: "La propina es 100% opcional. Si quieres dejar una, la app te sugiere 15%, 18% o 20% al pagar.",
    en: "Tipping is 100% optional. If you'd like to leave one, the app suggests 15%, 18%, or 20% at checkout.",
    suggestWhatsapp: false,
  },
  payment_methods: {
    es: "Aceptamos tarjeta (Visa, Mastercard, Amex, Apple Pay, Google Pay, Link), PayPal y ATH Móvil. Para reservar online el pago se procesa antes de confirmar la cita.",
    en: "We accept card (Visa, Mastercard, Amex, Apple Pay, Google Pay, Link), PayPal and ATH Móvil. To book online the payment is processed before the appointment is confirmed.",
    suggestWhatsapp: false,
  },
  refund: {
    es: "Los reembolsos se manejan manualmente caso por caso. Escríbele al barbero por WhatsApp con el detalle de la cita y te ayudamos.",
    en: "Refunds are handled manually case by case. Message the barber on WhatsApp with the appointment details and we'll help.",
    suggestWhatsapp: true,
  },
};

const get_policy_explanation: ToolDef = {
  name: "get_policy_explanation",
  description:
    "Return the official explanation of a shop policy (cancellation, reschedule, no-show, late, tip, payment methods, refund). " +
    "Use this when a user asks 'why' about any of these topics. " +
    "If suggest_whatsapp is true, follow up by also calling send_whatsapp_handoff so the user can reach a human in one tap.",
  parameters: {
    type: "object",
    properties: {
      topic: {
        type: "string",
        enum: ["cancellation", "reschedule", "no_show", "late_arrival", "tip", "payment_methods", "refund"],
      },
    },
    required: ["topic"],
  },
  roles: ["anon", "client"],
  handler: async (args, _ctx) => {
    const topic = String(args.topic || "");
    const entry = POLICY_KB[topic];
    if (!entry) return { error: "unknown_topic" };
    return {
      topic,
      summary_es: entry.es,
      summary_en: entry.en,
      suggest_whatsapp: entry.suggestWhatsapp,
    };
  },
};

const send_whatsapp_handoff: ToolDef = {
  name: "send_whatsapp_handoff",
  description:
    "Render a WhatsApp button in the chat that opens a wa.me link with a prefilled message. " +
    "Use this whenever the user wants to talk to a human, asks about something outside policy, or after explaining a policy that suggested WhatsApp. " +
    "Provide a clear, short prefilled message in BOTH languages so the user just has to tap Send.",
  parameters: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Short label, e.g. 'cancellation', 'late', 'general'" },
      prefilled_message_es: { type: "string", description: "Spanish prefill, includes context" },
      prefilled_message_en: { type: "string", description: "English prefill, includes context" },
      language: { type: "string", enum: ["es", "en"], description: "User's current language" },
    },
    required: ["prefilled_message_es", "prefilled_message_en", "language"],
  },
  roles: ["anon", "client"],
  handler: async (args, ctx) => {
    const lang = args.language === "en" ? "en" : "es";
    const { data: pub } = await ctx.admin
      .from("blog_publication_settings")
      .select("social_whatsapp")
      .limit(1)
      .maybeSingle();
    const rawNumber = pub?.social_whatsapp || "+17873481281";
    const phone = String(rawNumber).replace(/\D/g, "");
    const prefill = lang === "en"
      ? String(args.prefilled_message_en || "")
      : String(args.prefilled_message_es || "");
    const href = `https://wa.me/${phone}?text=${encodeURIComponent(prefill)}`;
    return {
      uiHint: {
        showWhatsAppHandoff: true,
        href,
        topic: args.topic ? String(args.topic) : "general",
        label_es: "Hablar con un barbero por WhatsApp",
        label_en: "Talk to a barber on WhatsApp",
      },
    };
  },
};

// ─── Location + phone quick actions (rendered as buttons in the chat) ──────
const SHOP_ADDRESS = "PR-2 Km 93.3 Bo. Membrillo, Camuy, PR 00627";
const SHOP_NAME = "Charlie's Barbershop";

const send_directions: ToolDef = {
  name: "send_directions",
  description:
    "Render a 'Open in Maps' button in the chat that takes the user to Charlie's Barbershop. " +
    "Use this whenever the user asks for directions, address, GPS, how to get to the shop, or where the shop is. " +
    "Your text reply MUST be SHORT: confirm the address in one line and tell them to tap the button.",
  parameters: { type: "object", properties: {}, required: [] },
  roles: ["anon", "client"],
  handler: async (_args, _ctx) => {
    const query = encodeURIComponent(`${SHOP_NAME}, ${SHOP_ADDRESS}`);
    const href = `https://www.google.com/maps/search/?api=1&query=${query}`;
    return {
      uiHint: {
        showDirections: true,
        href,
        address: SHOP_ADDRESS,
        label_es: "Abrir en Maps",
        label_en: "Open in Maps",
      },
    };
  },
};

const send_call_button: ToolDef = {
  name: "send_call_button",
  description:
    "Render a 'Call us' button in the chat that opens the phone dialer with the customer service number. " +
    "Use this whenever the user asks for the phone number, to call the shop, or asks for customer service by phone.",
  parameters: { type: "object", properties: {}, required: [] },
  roles: ["anon", "client"],
  handler: async (_args, ctx) => {
    const { data: pub } = await ctx.admin
      .from("blog_publication_settings")
      .select("social_whatsapp")
      .limit(1)
      .maybeSingle();
    const rawNumber = pub?.social_whatsapp || "+17873481281";
    const phone = String(rawNumber).replace(/\D/g, "");
    const display = phone.length === 11 && phone.startsWith("1")
      ? `+1 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`
      : `+${phone}`;
    return {
      uiHint: {
        showCallButton: true,
        href: `tel:+${phone}`,
        phoneDisplay: display,
        label_es: "Llamar a la barbería",
        label_en: "Call the shop",
      },
    };
  },
};

// ─── request_profile_form ─────────────────────────────────────────────────
// Tells the UI to render an inline form (name / phone / optional email) instead
// of asking the client to type contact info as free text. The user's submission
// comes back as a normal user message; Filho should then call
// submit_booking_contact_info with those values.
const request_profile_form: ToolDef = {
  name: "request_profile_form",
  description:
    "Ask the UI to render an inline contact form (name, phone, optional email) so the client fills it like a form instead of typing. " +
    "Use this BEFORE submit_booking_contact_info when you need to collect the client's contact info during the public booking flow. " +
    "Your text reply MUST be SHORT (e.g. 'Completa tus datos abajo para confirmar tu cita.'). Do NOT also ask for the fields in plain text.",
  parameters: {
    type: "object",
    properties: {
      include_email: {
        type: "boolean",
        description: "Whether to include the optional email field. Default true.",
      },
      context: {
        type: "string",
        enum: ["booking", "identify"],
        description: "Why we are collecting info. Default 'booking'.",
      },
    },
    required: [],
  },
  roles: ["anon"],
  handler: async (args, ctx) => {
    assertRole(ctx, ["anon"], "request_profile_form");
    const includeEmail = args.include_email !== false;
    const context = (args.context as string) === "identify" ? "identify" : "booking";
    const fields = ["fullName", "phone", ...(includeEmail ? ["email"] : [])];
    return {
      ok: true,
      uiHint: {
        showProfileForm: true,
        fields,
        required: ["fullName", "phone"],
        context,
      },
    };
  },
};

// ─── Pricing flow: per-barber pricing intro + per-barber service list ─────
// Filho should NOT show a flat "ver precios" list. The shop's three barbers
// (Charlie, Hector, Joseph) share the same services with different prices.
// We surface a pricing intro that explains the tiers and lets the user pick
// which barber's pricing to see.

const PRICING_BARBER_NAMES: { es: string; en: string; key: string }[] = [
  { es: "Joseph", en: "Joseph", key: "joseph" },
  { es: "Héctor", en: "Hector", key: "hector" },
  { es: "Charlie", en: "Charlie", key: "charlie" },
];

const get_pricing_intro: ToolDef = {
  name: "get_pricing_intro",
  description:
    "Use this whenever the user asks about prices/pricing/cost/'cuánto cuesta'/'precios'/'how much' WITHOUT specifying a barber. " +
    "Returns a uiHint with an explanation that each barber has the same services at different prices, " +
    "plus three chips (Joseph, Héctor, Charlie) so the user can pick whose pricing to see. " +
    "Your text reply MUST be ONE short line like '¡Claro! Te muestro los precios.' Do NOT list barbers, prices or services in text, the uiHint handles it.",
  parameters: { type: "object", properties: {}, required: [] },
  roles: ["anon", "client"],
  handler: async (_args, _ctx) => {
    return {
      ok: true,
      uiHint: {
        showPricingBarberPicker: true,
        chips: PRICING_BARBER_NAMES.map((b) => ({
          label_es: b.es,
          label_en: b.en,
          send_es: `Precios de ${b.es}`,
          send_en: `${b.en}'s prices`,
        })),
      },
    };
  },
};

const list_services_for_barber: ToolDef = {
  name: "list_services_for_barber",
  description:
    "Return the public service list with prices for ONE specific barber. " +
    "Use this AFTER the user picks a barber (Joseph, Héctor/Hector, or Charlie) from the pricing chips, " +
    "or whenever the user asks 'precios de <barbero>' / '<barber>'s prices'. " +
    "Returns ONLY public appointment types (no add-ons). Your text reply should be ONE short line; the data is rendered as a list.",
  parameters: {
    type: "object",
    properties: {
      barber: {
        type: "string",
        description: "Barber first name (case-insensitive): joseph, hector, héctor, or charlie.",
      },
    },
    required: ["barber"],
  },
  roles: ["anon", "client"],
  handler: async (args, ctx) => {
    assertRole(ctx, ["anon", "client"], "list_services_for_barber");
    const raw = String(args.barber || "").trim().toLowerCase();
    // Normalize: strip accents
    const norm = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let barberName: string | null = null;
    if (norm.startsWith("jos")) barberName = "Joseph Lasalle";
    else if (norm.startsWith("hec") || norm.startsWith("pit")) barberName = "Hector Cruz";
    else if (norm.startsWith("cha")) barberName = "Charlie Corchado";
    if (!barberName) return { error: "barber_not_recognized", hint: "joseph | hector | charlie" };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: barber } = await admin
      .from("barbers")
      .select("id, name")
      .eq("name", barberName)
      .eq("is_active", true)
      .maybeSingle();
    if (!barber) return { error: "barber_not_found", barber: barberName };

    const { data: services, error } = await admin
      .from("services")
      .select("name, duration_minutes, price_cents")
      .eq("barber_id", barber.id)
      .eq("is_active", true)
      .eq("is_public", true)
      .order("price_cents", { ascending: true });
    if (error) return { error: "services_fetch_failed", detail: error.message };

    const list = (services || []).map((s: any) => ({
      name: s.name,
      duration_minutes: s.duration_minutes,
      price_usd: Number(((s.price_cents || 0) / 100).toFixed(2)),
    }));

    return {
      ok: true,
      barber: barber.name,
      services: list,
      uiHint: {
        showBarberPriceList: true,
        barberName: barber.name,
        services: list,
      },
    };
  },
};
// Removed from exposure: list_services, list_barbers, find_available_slots,
// submit_booking_contact_info, request_profile_form. The shop catalog is
// injected into the prompt; the booking flow handles all orchestration.
const ALL_TOOLS: ToolDef[] = [
  // Job 2: open booking
  open_public_booking,
  // Job 3: actions on existing appointment (logged-in clients)
  get_my_appointments,
  present_appointment_picker,
  open_reschedule,
  cancel_my_appointment,
  get_my_saved_card,
  request_pay_saved_card,
  repeat_last_appointment,
  // Job 1+4: info / policies
  get_policy_explanation,
  // Pricing flow (per-barber)
  get_pricing_intro,
  list_services_for_barber,
  // Job 5: escalate to human + quick action buttons
  send_whatsapp_handoff,
  send_directions,
  send_call_button,
];

function toolsForRole(role: Role): ToolDef[] {
  return ALL_TOOLS.filter((t) => t.roles.includes(role));
}

// ─── Live shop catalog (injected into system prompt) ──────────────────────
async function fetchShopCatalog(admin: SupabaseClient): Promise<string> {
  let block = "";
  try {
    const { data: services } = await admin
      .from("services")
      .select("acuity_type_id, name, duration_minutes, price_cents")
      .eq("is_active", true)
      .eq("is_public", true)
      .order("sort_order", { ascending: true });
    const seen = new Set<number>();
    const lines = (services || [])
      .filter((s: any) => s.acuity_type_id && !seen.has(s.acuity_type_id) && (seen.add(s.acuity_type_id), true))
      .map((s: any) => `  - ${s.name} (${s.duration_minutes} min)`);
    if (lines.length > 0) {
      block += `\n\nSERVICIOS DISPONIBLES (nombres y duraciones, NO precios, los precios varían por barbero, usa list_services_for_barber para precios reales):\n${lines.join("\n")}\n`;
    }
  } catch (e) {
    console.warn("[filho-agent] services catalog failed", e);
  }
  try {
    const { data: barbers } = await admin
      .from("barbers_public")
      .select("name")
      .eq("is_active", true);
    const names = (barbers || []).map((b: any) => b.name).filter(Boolean);
    if (names.length > 0) {
      block += `\nBARBEROS ACTIVOS: ${names.join(", ")}.\n`;
    }
  } catch (e) {
    console.warn("[filho-agent] barbers catalog failed", e);
  }
  block +=
    `\nMÉTODOS DE PAGO: Tarjeta (Visa, Mastercard, Amex), Apple Pay, Google Pay, Link, PayPal, ATH Móvil. El pago se procesa antes de confirmar la cita online.\n` +
    `\nUBICACIÓN: ${SHOP_NAME}, ${SHOP_ADDRESS}.\n` +
    `\nPOLÍTICA CANCELAR/REAGENDAR: hasta las 11:59 PM (hora PR) del día ANTES de la cita. Pasada esa hora, el cliente debe escribir al barbero por WhatsApp (somos flexibles).\n` +
    `\nPROPINA: opcional. Sugerencias 15% / 18% / 20% al pagar.\n`;
  return block;
}

// ─── System prompt ─────────────────────────────────────────────────────────
function systemPromptFor(role: Role, ctxNowAst: string, catalogBlock: string): string {
  const base =
    `Eres Filho, el asistente AI de Charlie's Barbershop (Camuy, Puerto Rico). ` +
    `Hablas en español por defecto y cambias a inglés si el usuario escribe en inglés. ` +
    `Tu personalidad: cálido, cercano (tutea), confiado, breve y resolutivo. Como un buen recepcionista de barbería que conoce al cliente. ` +
    `Nunca uses guiones largos (—); usa comas, puntos o paréntesis. Nunca uses jerga corporativa.\n` +
    `Hora actual en AST: ${ctxNowAst}. Toda fecha/hora va en AST (-04:00); las tools devuelven datetimes formateados, NO los reformatees.` +
    catalogBlock +
    `\nESTILO DE CONVERSACIÓN (MUY IMPORTANTE):\n` +
    `- SIEMPRE responde con texto natural, aunque también llames un tool. Tu mensaje debe sentirse humano, no robótico.\n` +
    `- Cuando llames un tool que muestra un botón (open_public_booking, send_whatsapp_handoff, send_directions, send_call_button, request_pay_saved_card, open_reschedule, repeat_last_appointment), tu texto debe: (a) reconocer la petición del usuario en 1 frase amable, (b) decir lo que estás haciendo, (c) invitar a tocar el botón. Ejemplo: "¡Claro! Te abro la reserva ahora mismo. Toca el botón abajo y escoge tu barbero." NUNCA mandes solo "Te abro la reserva." sin contexto.\n` +
    `- Si la intención es ambigua, haz UNA pregunta corta para aclarar antes de llamar el tool. Ej: "¿Quieres reservar una cita nueva, ver tus citas activas o saber precios?"\n` +
    `- Después de informar (precios, horarios, ubicación), SIEMPRE ofrece el siguiente paso: "¿Te abro la reserva?" o "¿Quieres ver disponibilidad?"\n` +
    `- Si el usuario solo saluda ("hola", "hi"), responde con un saludo cálido + tu rol + ofrece 2-3 opciones rápidas. Ej: "¡Hola! Soy Filho, el asistente de Charlie's. Puedo ayudarte a reservar una cita, contestar precios y horarios, o conectarte con el barbero. ¿Qué necesitas?"\n` +
    `\nTIENES 5 TRABAJOS:\n` +
    `1. Informar (servicios, precios, horarios, barberos, ubicación, métodos de pago, políticas). Usa el catálogo de arriba, NO inventes.\n` +
    `   PRECIOS (MUY IMPORTANTE): cada barbero tiene los MISMOS servicios pero a precios DISTINTOS. NUNCA des un precio "promedio" ni listes precios sin barbero. Si el usuario pregunta precios genéricamente ("precios", "cuánto cuesta", "how much"), llama get_pricing_intro: el uiHint muestra los chips Joseph/Héctor/Charlie. Cuando el usuario escoja uno (o diga "precios de Joseph", "Charlie's prices", etc.), llama list_services_for_barber con su nombre, NO uses el catálogo deduplicado de arriba para responder precios. Solo SERVICIOS PÚBLICOS, sin add-ons.\n` +
    `   FORMATO DE RESPUESTA AL LLAMAR list_services_for_barber: tu texto DEBE ser UNA sola línea corta + UNA pregunta de cierre puercoespín (que invite al sí). NUNCA listes los servicios o precios en texto, NUNCA uses asteriscos, viñetas, markdown ni "**". El uiHint ya renderiza la tabla bonita. Ejemplo: "Estos son los precios de Charlie. ¿Te lo abro para reservar un Corte o prefieres La Experiencia?" o "Aquí tienes los precios de Joseph. ¿Te reservo un Corte & Barba este viernes o el sábado te queda mejor?"\n` +
    `2. Abrir la reserva oficial cuando el usuario quiera reservar/agendar/coger cita: llama open_public_booking. Acompaña con texto cálido (regla arriba).\n` +
    `3. Acciones sobre cita existente (solo cliente logueado): ver próxima (get_my_appointments), reagendar (open_reschedule), cancelar dentro de ventana (cancel_my_appointment), pagar pendiente con tarjeta guardada (request_pay_saved_card), repetir cita (repeat_last_appointment).\n` +
    `4. Explicar políticas (cancelar/reagendar/no-show/late/tip/payment/refund) con get_policy_explanation, y si suggest_whatsapp=true, acompaña con send_whatsapp_handoff.\n` +
    `5. Escalada humana: si la solicitud no encaja, o el usuario pide hablar con humano, llama send_whatsapp_handoff con un prefilled claro.\n` +
    `\nREGLAS DURAS:\n` +
    `- NUNCA orquestes el booking en el chat (no preguntes servicio, fecha, hora, datos, pago). El flow oficial lo maneja todo.\n` +
    `- NUNCA digas "déjame verificar", "un momento", "estoy revisando". Llama el tool y entrega el botón con tu acuse cálido.\n` +
    `- NUNCA niegues un servicio sin haberlo buscado en el catálogo (fuzzy-match: ignora tildes, mayúsculas, "de", "&", "and", "y", singular/plural).\n` +
    `- Si el cliente bromea, banter ligero (1 frase) y vuelve a la acción.\n` +
    `- Si NO estás 100% seguro de poder ayudar: send_whatsapp_handoff con texto cálido. NUNCA inventes.\n` +
    `- Botones rápidos: send_directions para Maps, send_call_button para teléfono.`;

  if (role === "anon") {
    return base +
      `\n\nMODO ANÓNIMO: el usuario no está logueado. NO tienes acceso a citas ni pagos guardados. Para reservar, open_public_booking. Para temas de cuenta o cita existente, send_whatsapp_handoff.`;
  }
  return base +
    `\n\nMODO CLIENTE AUTENTICADO: usa get_my_appointments cuando pregunte por sus citas (solo informativo).\n` +
    `CANCELAR / REAGENDAR (CRÍTICO): NUNCA, JAMÁS, le pidas al cliente un id, número de cita ni "cuál cita". El cliente NO sabe esa info y romperías la experiencia premium. Cuando exprese intención de cancelar o reagendar:\n` +
    `  1. Llama PRIMERO present_appointment_picker(action) con la acción correspondiente.\n` +
    `  2. Tu texto debe acusar recibo en una frase amable, ej: "Claro, te ayudo a cancelar. Escoge cuál:" o "Listo, vamos a reagendar tu cita."\n` +
    `  3. Cuando el usuario responda (vendrá en lenguaje natural como "Cancelar la cita del jueves 3 PM con Charlie" o "Sí, cancela"), busca esa cita en el resultado del tool anterior, identifica su id, y SOLO ENTONCES llama cancel_my_appointment(id) o open_reschedule(id). Si solo había 1 cita y dijo "sí", usa ese id directo.\n` +
    `  4. Antes de llamar cancel_my_appointment / open_reschedule verifica si la cita está dentro de ventana (>= 11:59 PM día antes); si no, send_whatsapp_handoff con get_policy_explanation('cancel'/'reschedule').\n` +
    `Para pagar pendiente con tarjeta guardada: request_pay_saved_card (también NUNCA pidas id, usa la última cita pendiente). Para repetir su última cita: repeat_last_appointment.`;
}

// ─── Conversation persistence ──────────────────────────────────────────────
async function getOrCreateConversation(
  admin: SupabaseClient,
  userId: string,
  role: Role,
  conversationId?: string,
): Promise<string> {
  if (conversationId) {
    const { data } = await admin
      .from("filho_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return data.id;
  }
  const { data, error } = await admin
    .from("filho_conversations")
    .insert({ user_id: userId, role: role === "anon" ? "anon" : "client" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// ─── Lovable AI Gateway call ───────────────────────────────────────────────
interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
  name?: string;
}

async function callGateway(messages: ChatMsg[], tools: ToolDef[]): Promise<{
  message: ChatMsg;
  finish_reason: string;
}> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const toolsPayload = tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: toolsPayload,
      tool_choice: "auto",
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) throw new Error(`gateway_rate_limit: ${txt}`);
    if (res.status === 402) throw new Error(`gateway_payment_required: ${txt}`);
    throw new Error(`gateway_error_${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const choice = data.choices?.[0];
  return { message: choice?.message, finish_reason: choice?.finish_reason || "stop" };
}

// ─── Main ─────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();

    // ── Feedback action: 👍/👎 on the most recent assistant message ──
    if (body.action === "feedback") {
      const convoId = String(body.conversation_id || "");
      const score = body.feedback === "up" ? 1 : body.feedback === "down" ? -1 : 0;
      if (!convoId || !score) return jsonRes({ error: "invalid_feedback" }, 400);
      // Only the signed-in owner of the conversation may rate it.
      const fbAuth = req.headers.get("Authorization") || "";
      const fbToken = fbAuth.startsWith("Bearer ") ? fbAuth.slice(7) : "";
      const { data: fbUser } = fbToken ? await admin.auth.getUser(fbToken) : { data: null };
      const fbUid = fbUser?.user?.id;
      if (!fbUid) return jsonRes({ success: true, recorded: false });
      const { data: convo } = await admin
        .from("filho_conversations").select("user_id").eq("id", convoId).maybeSingle();
      if (!convo || convo.user_id !== fbUid) return jsonRes({ success: true, recorded: false });
      // Update the most recent assistant message in this conversation.
      const { data: lastMsg } = await admin
        .from("filho_messages")
        .select("id")
        .eq("conversation_id", convoId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastMsg?.id) {
        await admin.from("filho_messages").update({ feedback: score }).eq("id", lastMsg.id);
      }
      return jsonRes({ success: true });
    }

    const userMessage = String(body.message || "").trim();
    if (!userMessage) return jsonRes({ error: "missing_message" }, 400);
    if (userMessage.length > 1000) return jsonRes({ error: "message_too_long" }, 400);
    const conversationId = body.conversation_id ? String(body.conversation_id) : undefined;
    const locale: "es" | "en" = body.locale === "en" ? "en" : "es";

    // ── Resolve role ──
    let role: Role = "anon";
    let userId: string | null = null;
    let clientId: string | null = null;

    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await admin.auth.getUser(token);
      if (userData?.user) {
        userId = userData.user.id;
        const { data: roleRow } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "client")
          .maybeSingle();
        if (roleRow) {
          role = "client";
          const { data: client } = await admin
            .from("clients")
            .select("id")
            .eq("auth_user_id", userId)
            .maybeSingle();
          clientId = client?.id || null;
        }
      }
    }

    // For anon users, derive a stable pseudo user_id from IP hash so we can
    // persist conversations under filho_conversations (user_id NOT NULL).
    const ipHash = await sha256Hex(
      ipFromReq(req) + (Deno.env.get("IP_HASH_SALT") || "filho_default_salt"),
    );
    const persistUserId = userId ?? `00000000-0000-0000-0000-${ipHash.slice(0, 12)}`;
    // anon conversations: skip persistence (user_id must be a uuid that exists for RLS-safe reads).
    // We still log to filho_conversations for owner audit when the column accepts non-auth uuids.
    // To keep schema simple, we ONLY persist when there is a real userId.
    const shouldPersist = !!userId;

    // Cost guard: anonymous visitors are rate limited per IP hash so the paid
    // AI gateway cannot be drained by unauthenticated callers.
    if (!userId) {
      const limits: Array<[string, number, number]> = [
        [`filho_anon_min:${ipHash}`, 6, 60],
        [`filho_anon_hour:${ipHash}`, 30, 3600],
        [`filho_anon_day:${ipHash}`, 60, 86400],
      ];
      for (const [key, max, win] of limits) {
        const { data: rl, error: rlErr } = await admin.rpc("check_rate_limit", {
          _key: key, _max: max, _window_seconds: win,
        });
        const allowed = !rlErr && (rl as { allowed?: boolean } | null)?.allowed !== false;
        if (!allowed) return jsonRes({ error: "rate_limited" }, 429);
      }
    }

    let convId: string | null = null;
    if (shouldPersist) {
      convId = await getOrCreateConversation(admin, userId!, role, conversationId);
    }

    const ctx: ToolCtx = { admin, role, userId, clientId, ipHash };

    // ── Build message history ──
    const nowLabel = await formatInShopTz(new Date().toISOString(), "EEEE, d LLLL yyyy, h:mm a");
    const catalogBlock = await fetchShopCatalog(admin);
    const history: ChatMsg[] = [
      { role: "system", content: systemPromptFor(role, nowLabel, catalogBlock) },
    ];

    if (convId) {
      const { data: prior } = await admin
        .from("filho_messages")
        .select("role, content, tool_calls, tool_result, tool_name")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true })
        .limit(40);
      for (const m of prior || []) {
        if (m.role === "user" || m.role === "assistant") {
          history.push({
            role: m.role as "user" | "assistant",
            content: m.content,
            tool_calls: (m.tool_calls as ChatMsg["tool_calls"]) || undefined,
          });
        } else if (m.role === "tool") {
          history.push({
            role: "tool",
            content: typeof m.tool_result === "string" ? m.tool_result : JSON.stringify(m.tool_result || {}),
            tool_call_id: (m.tool_calls as { id?: string } | null)?.id || "tool_unknown",
            name: m.tool_name || undefined,
          });
        }
      }
    }

    // For anon (not persisted), accept client-sent history so we can enforce limits.
    if (!convId && Array.isArray(body.history)) {
      for (const m of body.history.slice(-12)) {
        if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
          history.push({ role: m.role, content: m.content.slice(0, 1500) });
        }
      }
    }

    history.push({ role: "user", content: userMessage });
    if (convId) {
      await admin.from("filho_messages").insert({ conversation_id: convId, role: "user", content: userMessage });
    }

    // ── Cost guardrails: count user turns in this conversation ──
    const userTurnCount = history.filter((m) => m.role === "user").length;
    if (userTurnCount > HARD_LIMIT) {
      const hardMsg = role === "anon"
        ? "Llegamos al límite de esta conversación. Para seguir, vamos directo a reservar tu cita o escríbenos por WhatsApp. ¿Reservamos ahora?"
        : "Llegamos al límite de esta conversación. Para no consumir más recursos, sigamos directo con tu reserva o pago. ¿Continuamos?";
      return jsonRes({
        success: true,
        message: hardMsg,
        conversation_id: convId,
        role,
        uiHint: { conversationLimitReached: true },
      });
    }
    if (userTurnCount >= SOFT_WARN_AT) {
      // Inject a system reminder to nudge the model toward closing the booking.
      history.push({
        role: "system",
        content:
          `AVISO INTERNO: la conversación se está alargando (${userTurnCount} turnos del usuario, límite ${HARD_LIMIT}). ` +
          `Cierra el banter, recuérdale amablemente que para reservar conviene abrir el flujo oficial, ` +
          `y llama open_public_booking inmediatamente. Sé breve.`,
      });
    }

    // ── Tool loop ──
    const tools = toolsForRole(role);
    let finalText = "";
    let lastUiHint: unknown = null;

    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      const { message, finish_reason } = await callGateway(history, tools);
      if (!message) throw new Error("empty_gateway_response");

      // Persist assistant turn
      if (convId) {
        await admin.from("filho_messages").insert({
          conversation_id: convId,
          role: "assistant",
          content: message.content || null,
          tool_calls: message.tool_calls || null,
        });
      }
      history.push(message);

      const calls = message.tool_calls || [];
      if (calls.length === 0 || finish_reason === "stop") {
        finalText = stripEmDashes(message.content || "");
        break;
      }

      // Execute tools
      for (const call of calls) {
        const tool = ALL_TOOLS.find((t) => t.name === call.function.name);
        let result: unknown;
        if (!tool) {
          result = { error: "unknown_tool", name: call.function.name };
        } else if (!tool.roles.includes(role)) {
          result = { error: "tool_forbidden", name: call.function.name, role };
        } else {
          try {
            const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            result = await tool.handler(args, ctx);
            if ((result as { uiHint?: unknown })?.uiHint) {
              lastUiHint = (result as { uiHint: unknown }).uiHint;
            }
          } catch (e) {
            result = { error: "tool_threw", message: (e as Error).message };
          }
        }

        const toolResultStr = JSON.stringify(result);
        if (convId) {
          await admin.from("filho_messages").insert({
            conversation_id: convId,
            role: "tool",
            tool_name: call.function.name,
            tool_calls: { id: call.id },
            tool_result: result as Record<string, unknown>,
          });
        }
        history.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: toolResultStr,
        });
      }
    }

    if (!finalText) {
      if (lastUiHint) {
        // Tool-only turn: synthesize a friendly acknowledgement instead of erroring.
        finalText = fallbackTextForUiHint(lastUiHint, locale);
      } else {
        console.error("[filho-agent] empty final text with no uiHint after tool loop");
        finalText = locale === "es"
          ? "No pude procesar eso ahora mismo. Intenta de nuevo o escríbenos por WhatsApp."
          : "I couldn't process that right now. Try again or message us on WhatsApp.";
      }
    }

    // When the response carries a structured price list, strip any markdown
    // bullet/price lines from the assistant text so the user only sees the
    // pretty rendered table + a single closing line.
    if (lastUiHint?.showBarberPriceList) {
      const lines = finalText.split(/\r?\n/);
      const cleaned = lines.filter((ln) => {
        const t = ln.trim();
        if (!t) return false;
        // Drop bullet/list lines or anything that looks like "* SERVICE: $..."
        if (/^([*\-•]|\d+\.)\s/.test(t)) return false;
        if (/\$\d/.test(t) && /[*_]{1,2}/.test(t)) return false;
        return true;
      });
      finalText = cleaned.join(" ").replace(/\s+/g, " ").trim();
      if (!finalText) finalText = fallbackTextForUiHint(lastUiHint, locale);
    }
    // Always strip leftover bold markdown asterisks from any reply.
    finalText = finalText.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|\s)\*(?=\S)/g, "$1");

    if (convId) {
      await admin
        .from("filho_conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", convId);
    }

    return jsonRes({
      success: true,
      message: finalText,
      conversation_id: convId,
      role,
      uiHint: lastUiHint,
    });
  } catch (e) {
    console.error("[filho-agent]", e);
    const msg = (e as Error).message;
    if (msg.startsWith("gateway_rate_limit")) return jsonRes({ error: "rate_limited" }, 429);
    if (msg.startsWith("gateway_payment_required")) return jsonRes({ error: "ai_credits_required" }, 402);
    return jsonRes({ error: msg }, 500);
  }
});
