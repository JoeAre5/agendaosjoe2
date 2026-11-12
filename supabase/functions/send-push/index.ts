// Send a push notification to one client (admin/manual use, also reused by reminder cron).
// Body: { client_id, template_name, vars?: { service, barber, time, date, ... }, dispatch_key?, appointment_id?, starts_at? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { sendPush, isExpiredEndpoint } from "../_shared/webPush.ts";
import { formatAppointmentVars } from "../_shared/dispatchPush.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Body {
  client_id?: string;
  template_name?: string;
  vars?: Record<string, string>;
  dispatch_key?: string;
  appointment_id?: string;
  // Optional: when present, send-push re-formats {date,time} per recipient
  // language (Spanish vs English). Overrides any date/time in vars.
  starts_at?: string;
  // Allow inline override for tests / one-offs
  title?: string;
  body?: string;
  url?: string;
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth gate — require either service-role JWT (cron / internal callers)
    // or an authenticated owner/barber. Prevents unauthenticated push spam.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let staffUid: string | null = null;
    let staffIsOwner = false;
    if (token !== serviceKey) {
      const { data: userData } = await admin.auth.getUser(token);
      const uid = userData?.user?.id;
      if (!uid) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: roles } = await admin
        .from("user_roles").select("role").eq("user_id", uid);
      const allowed = (roles ?? []).some((r: any) => r.role === "owner" || r.role === "barber");
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      staffUid = uid;
      staffIsOwner = (roles ?? []).some((r: any) => r.role === "owner");
    }

    const body: Body = await req.json();
    if (!body.client_id) {
      return new Response(JSON.stringify({ error: "Missing client_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Staff (non-internal) callers may only send owner-defined templates.
    // Free-form title/body is reserved for trusted internal callers.
    if (staffUid) {
      if (!body.template_name) {
        return new Response(JSON.stringify({ error: "template_name required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      body.title = undefined;
      body.body = undefined;
      body.url = undefined;
      // Barbers may only notify clients they serve.
      if (!staffIsOwner) {
        const { data: profileRow } = await admin
          .from("profiles").select("barber_id").eq("id", staffUid).maybeSingle();
        const barberRow = profileRow?.barber_id ? { id: profileRow.barber_id as string } : null;
        const { data: link } = barberRow
          ? await admin.from("appointments").select("id")
              .eq("barber_id", barberRow.id).eq("client_id", body.client_id).limit(1).maybeSingle()
          : { data: null };
        if (!link) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Idempotency
    if (body.dispatch_key) {
      const { data: existing } = await admin
        .from("notification_dispatch_log")
        .select("id")
        .eq("dispatch_key", body.dispatch_key)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Load client + opt-in flags
    const { data: client } = await admin
      .from("clients")
      .select("id, notifications_enabled, notify_push_appointments")
      .eq("id", body.client_id)
      .maybeSingle();
    if (!client || !client.notifications_enabled || !client.notify_push_appointments) {
      return new Response(JSON.stringify({ ok: true, skipped: "opted-out" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load subscriptions for this client
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, language")
      .eq("client_id", body.client_id);
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no-subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve template
    let templateTitleEs = body.title ?? "";
    let templateBodyEs = body.body ?? "";
    let templateTitleEn = body.title ?? "";
    let templateBodyEn = body.body ?? "";
    let urlPath = body.url ?? "/app/cliente";

    if (body.template_name) {
      const { data: tpl } = await admin
        .from("notification_templates")
        .select("title_es, body_es, title_en, body_en, url_path, is_enabled")
        .eq("name", body.template_name)
        .maybeSingle();
      if (!tpl) {
        return new Response(JSON.stringify({ error: "Template not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Owner-controlled kill switch — paused templates are silently skipped.
      if (!tpl.is_enabled) {
        if (body.dispatch_key) {
          await admin.from("notification_dispatch_log").insert({
            client_id: body.client_id,
            appointment_id: body.appointment_id ?? null,
            template_name: body.template_name,
            dispatch_key: body.dispatch_key,
            subscription_count: 0,
            success_count: 0,
            failure_count: 0,
            metadata: { skipped: "template-disabled" },
          });
        }
        return new Response(JSON.stringify({ ok: true, skipped: "template-disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      templateTitleEs = tpl.title_es;
      templateBodyEs = tpl.body_es;
      templateTitleEn = tpl.title_en;
      templateBodyEn = tpl.body_en;
      if (tpl.url_path) urlPath = tpl.url_path;
    }

    const vars = body.vars ?? {};
    let success = 0;
    let failure = 0;
    const expiredIds: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        const lang = sub.language === "en" ? "en" : "es";
        // If caller provided starts_at, re-format date/time in this
        // subscription's language (so Spanish users get "30/abril/2026" and
        // English users get "30/April/2026").
        const perSubVars = body.starts_at
          ? { ...vars, ...formatAppointmentVars(body.starts_at, lang) }
          : vars;
        const payload = {
          title: fillTemplate(lang === "en" ? templateTitleEn : templateTitleEs, perSubVars),
          body: fillTemplate(lang === "en" ? templateBodyEn : templateBodyEs, perSubVars),
          url: urlPath,
          tag: body.template_name || "charlies-notification",
        };
        const result = await sendPush(sub, payload);
        if (result.ok) {
          success++;
          await admin
            .from("push_subscriptions")
            .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
            .eq("id", sub.id);
        } else {
          failure++;
          if (isExpiredEndpoint(result.status)) {
            expiredIds.push(sub.id);
          } else {
            await admin.rpc; // no-op placeholder
            await admin
              .from("push_subscriptions")
              .update({ failure_count: (sub as any).failure_count != null ? (sub as any).failure_count + 1 : 1 })
              .eq("id", sub.id);
          }
        }
      })
    );

    if (expiredIds.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", expiredIds);
    }

    // Log dispatch (idempotency)
    if (body.dispatch_key) {
      await admin.from("notification_dispatch_log").insert({
        client_id: body.client_id,
        appointment_id: body.appointment_id ?? null,
        template_name: body.template_name ?? "inline",
        dispatch_key: body.dispatch_key,
        subscription_count: subs.length,
        success_count: success,
        failure_count: failure,
        metadata: { vars },
      });
    }

    return new Response(
      JSON.stringify({ ok: true, success, failure, expired: expiredIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-push]", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
