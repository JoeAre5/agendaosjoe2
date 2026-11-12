// Shared helper to invoke the `send-push` edge function from another edge function.
//
// IMPORTANT: We use raw fetch + service-role Authorization header instead of
// `supabase.functions.invoke()` because the SDK call from one edge function to
// another silently fails inside service-role clients. Direct fetch with the
// bearer token reliably reaches the deployed function.
//
// Always called fire-and-forget — the caller wraps it in try/catch and
// logs warnings only. Notification failure must NEVER block the user-facing
// action (payment, cancellation, reschedule) that triggered it.

export interface DispatchPushArgs {
  client_id: string;
  template_name: string;
  dispatch_key: string;
  appointment_id?: string;
  // When provided, send-push localizes {date,time} per recipient language.
  starts_at?: string;
  vars?: Record<string, string>;
}

/**
 * POST to the deployed `send-push` function. Returns the parsed response or
 * throws on network/HTTP error so the caller can log it.
 */
export async function dispatchPush(args: DispatchPushArgs): Promise<unknown> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const url = `${supabaseUrl}/functions/v1/send-push`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify(args),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`send-push HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return parsed;
}

/**
 * Format an appointment's `starts_at` (UTC ISO) into the standard
 * `{date, time}` vars used by every appointment-related template. PR timezone.
 *
 * Owner directive: date format is `dd/<full month name>/yyyy` in the
 * recipient's language (Spanish or English). Month name is lowercase in
 * Spanish (per Spanish convention) and capitalized in English.
 */
export function formatAppointmentVars(
  startsAtIso: string,
  lang: "es" | "en" = "es"
): {
  date: string;
  time: string;
} {
  const start = new Date(startsAtIso);
  const locale = lang === "en" ? "en-US" : "es-ES";
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Puerto_Rico",
  }).formatToParts(start);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  let month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  // Owner directive: month always capitalized in both languages.
  // Spanish: dd/<Mes>/yyyy — English: <Month>/dd/yyyy.
  if (month) month = month.charAt(0).toUpperCase() + month.slice(1);
  const date = lang === "en"
    ? `${month}/${day}/${year}`
    : `${day}/${month}/${year}`;
  const time = start.toLocaleTimeString(lang === "en" ? "en-US" : "es-ES", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Puerto_Rico",
  });
  return { date, time };
}
