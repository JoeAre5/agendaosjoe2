// Cron-triggered: scan upcoming appointments and dispatch reminders.
// Reminder windows are now dynamic — driven by enabled rows in
// notification_templates where category='reminders' and offset_minutes IS NOT NULL.
// - is_enabled=false → window is silently skipped
// - offset_minutes is negative (minutes before appointment); we match within ±5min
// Idempotent via dispatch_key = `${appointment_id}:${template.name}`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { sendPush, isExpiredEndpoint } from "../_shared/webPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PR_TZ = "America/Puerto_Rico";

interface Template {
  name: string;
  title_es: string; body_es: string;
  title_en: string; body_en: string;
  url_path: string | null;
  offset_minutes: number;
  is_enabled: boolean;
}

function fill(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function formatTime(iso: string, lang: "es" | "en"): string {
  return new Date(iso).toLocaleTimeString(lang === "en" ? "en-US" : "es-PR", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: PR_TZ,
  });
}

function formatDate(iso: string, lang: "es" | "en"): string {
  // Owner directive: dd/<full month name>/yyyy in the recipient's language.
  const locale = lang === "en" ? "en-US" : "es-ES";
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit", month: "long", year: "numeric", timeZone: PR_TZ,
  }).formatToParts(new Date(iso));
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  let month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  if (month) month = month.charAt(0).toUpperCase() + month.slice(1);
  return lang === "en" ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Auth gate — cron only. Requires service-role JWT.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token !== serviceKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    // Pull all reminder templates dynamically — owners control offset + enabled state.
    const { data: tplRows } = await admin
      .from("notification_templates")
      .select("name, title_es, body_es, title_en, body_en, url_path, offset_minutes, is_enabled")
      .eq("category", "reminders")
      .not("offset_minutes", "is", null);

    const reminders: Template[] = (tplRows || [])
      .filter((r: any) => r.is_enabled && typeof r.offset_minutes === "number")
      .map((r: any) => r as Template);

    if (reminders.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, skipped: 0, note: "no-active-reminders" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Date.now();
    let totalSent = 0;
    let totalSkipped = 0;

    for (const tpl of reminders) {
      // offset_minutes is negative (e.g. -1440 = 1440 min before appointment).
      // We look for appointments that start (now - offset_minutes*60_000) ± 5 min.
      const target = now + Math.abs(tpl.offset_minutes) * 60 * 1000;
      const lo = new Date(target - 5 * 60 * 1000).toISOString();
      const hi = new Date(target + 5 * 60 * 1000).toISOString();

      const { data: appts } = await admin
        .from("appointments")
        .select("id, client_id, service_name, starts_at, status, barber_id, barbers(name)")
        .gte("starts_at", lo)
        .lte("starts_at", hi)
        .in("status", ["scheduled", "confirmed"])
        .not("client_id", "is", null);

      if (!appts || appts.length === 0) continue;

      for (const appt of appts) {
        const dispatchKey = `${appt.id}:${tpl.name}`;

        // Idempotency check
        const { data: existing } = await admin
          .from("notification_dispatch_log")
          .select("id")
          .eq("dispatch_key", dispatchKey)
          .maybeSingle();
        if (existing) { totalSkipped++; continue; }

        // Verify client opted in + has subs
        const { data: client } = await admin
          .from("clients")
          .select("id, notifications_enabled, notify_push_appointments")
          .eq("id", appt.client_id!)
          .maybeSingle();
        if (!client?.notifications_enabled || !client?.notify_push_appointments) {
          totalSkipped++;
          await admin.from("notification_dispatch_log").insert({
            client_id: appt.client_id, appointment_id: appt.id,
            template_name: tpl.name, dispatch_key: dispatchKey,
            subscription_count: 0, success_count: 0, failure_count: 0,
            metadata: { skipped: "opted-out", offset_minutes: tpl.offset_minutes },
          });
          continue;
        }

        const { data: subs } = await admin
          .from("push_subscriptions")
          .select("id, endpoint, p256dh, auth, language")
          .eq("client_id", appt.client_id!);
        if (!subs || subs.length === 0) {
          totalSkipped++;
          await admin.from("notification_dispatch_log").insert({
            client_id: appt.client_id, appointment_id: appt.id,
            template_name: tpl.name, dispatch_key: dispatchKey,
            subscription_count: 0, success_count: 0, failure_count: 0,
            metadata: { skipped: "no-subs", offset_minutes: tpl.offset_minutes },
          });
          continue;
        }

        const barberName = (appt as any).barbers?.name || "tu barbero";
        let success = 0, failure = 0;
        const expired: string[] = [];

        await Promise.all(subs.map(async (sub: any) => {
          const lang: "es" | "en" = sub.language === "en" ? "en" : "es";
          const vars = {
            service: appt.service_name,
            barber: barberName,
            time: formatTime(appt.starts_at, lang),
            date: formatDate(appt.starts_at, lang),
          };
          const payload = {
            title: fill(lang === "en" ? tpl.title_en : tpl.title_es, vars),
            body: fill(lang === "en" ? tpl.body_en : tpl.body_es, vars),
            url: tpl.url_path || "/app/cliente",
            tag: `appt-${appt.id}-${tpl.name}`,
          };
          const r = await sendPush(sub, payload);
          if (r.ok) {
            success++;
            await admin.from("push_subscriptions")
              .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
              .eq("id", sub.id);
          } else {
            failure++;
            if (isExpiredEndpoint(r.status)) expired.push(sub.id);
          }
        }));

        if (expired.length > 0) {
          await admin.from("push_subscriptions").delete().in("id", expired);
        }

        await admin.from("notification_dispatch_log").insert({
          client_id: appt.client_id, appointment_id: appt.id,
          template_name: tpl.name, dispatch_key: dispatchKey,
          subscription_count: subs.length, success_count: success, failure_count: failure,
          metadata: { offset_minutes: tpl.offset_minutes },
        });

        totalSent += success;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        sent: totalSent,
        skipped: totalSkipped,
        active_reminders: reminders.map((t) => ({ name: t.name, offset_minutes: t.offset_minutes })),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-appointment-reminders]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
