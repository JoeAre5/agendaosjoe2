import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { notifyOwners } from "../_shared/notifyOwners.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Owner email — single source of truth for inbound alerts.
const OWNER_ALERT_EMAIL = "charliesbarbershop.camuy@gmail.com";
const INBOX_URL = "https://charliesbarbershop.co/admin/bandeja";

type Source = "contact" | "newsletter" | "recruitment";

function normalizePhone(p?: string | null) {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits || null;
}

function getAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function findExistingClient(admin: ReturnType<typeof createClient>, email?: string | null, phone?: string | null) {
  const e = (email || "").trim().toLowerCase();
  const phoneNorm = normalizePhone(phone);
  if (e) {
    const { data } = await admin.from("clients").select("id").ilike("email", e).limit(1);
    if (data && data.length > 0) return data[0].id as string;
  }
  if (phoneNorm) {
    const { data } = await admin
      .from("clients")
      .select("id")
      .filter("phone", "ilike", `%${phoneNorm.slice(-10)}`)
      .limit(1);
    if (data && data.length > 0) return data[0].id as string;
  }
  return null;
}

async function sendTransactionalEmail(payload: {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData?: Record<string, unknown>;
}) {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const resp = await fetch(`${url}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
        "apikey": key,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn("[inbox-submit] email dispatch non-2xx", resp.status, txt);
    }
  } catch (err) {
    console.warn("[inbox-submit] email dispatch failed", payload.templateName, err);
  }
}

async function upsertNewsletterSubscriber(admin: ReturnType<typeof createClient>, opts: {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  language?: "es" | "en";
}) {
  const email = (opts.email || "").trim().toLowerCase() || null;
  const phoneNorm = normalizePhone(opts.phone);

  let existing: { id: string; newsletter_opt_in?: boolean | null } | null = null;
  if (email) {
    const { data } = await admin.from("clients").select("id, newsletter_opt_in").ilike("email", email).limit(1);
    if (data && data.length > 0) existing = data[0];
  }
  if (!existing && phoneNorm) {
    const { data } = await admin
      .from("clients").select("id, newsletter_opt_in")
      .filter("phone", "ilike", `%${phoneNorm.slice(-10)}`).limit(1);
    if (data && data.length > 0) existing = data[0];
  }

  if (existing?.newsletter_opt_in === true) {
    return { ok: true, mode: "already_subscribed", id: existing.id };
  }

  const flagsPatch = {
    newsletter_opt_in: true,
    newsletter_opt_in_at: new Date().toISOString(),
    newsletter_language: opts.language || "es",
    newsletter_source: "homepage_form",
    notify_email_marketing: true,
  };

  if (existing) {
    // Never change an existing client's contact details or preferences from
    // an anonymous form. Subscribe only when the submitted email is the one
    // already on that profile (messages go to the profile's own inbox).
    const matchedByEmail = !!email && await admin.from("clients").select("id")
      .eq("id", existing.id).ilike("email", email).maybeSingle().then((r: { data: unknown }) => !!r.data);
    if (!matchedByEmail) return { ok: true, mode: "matched_no_change", id: existing.id };
    const { error } = await admin.from("clients").update(flagsPatch).eq("id", existing.id);
    return { ok: !error, mode: "matched", id: existing.id, error: error?.message };
  }

  const placeholderName = email ? email.split("@")[0].slice(0, 60) : "Suscriptor";
  const { data, error } = await admin
    .from("clients")
    .insert({
      first_name: opts.first_name || placeholderName,
      last_name: opts.last_name || null,
      email,
      phone: opts.phone || null,
      is_guest: true,
      ...flagsPatch,
    })
    .select("id")
    .maybeSingle();
  return { ok: !error, mode: "created", id: data?.id, error: error?.message };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { source, language, ...fields } = body as Record<string, unknown> & {
      source: Source;
      language?: "es" | "en";
    };

    if (!source || !["contact", "newsletter", "recruitment"].includes(source)) {
      return new Response(JSON.stringify({ error: "source is required (contact|newsletter|recruitment)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang: "es" | "en" = language === "en" ? "en" : "es";
    const admin = getAdmin();
    if (!admin) {
      return new Response(JSON.stringify({ error: "server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let subscriber: unknown = null;
    let savedRow: { id?: string } | null = null;

    // ===== NEWSLETTER =====
    if (source === "newsletter") {
      const email = (fields.email as string | undefined)?.trim().toLowerCase();
      subscriber = await upsertNewsletterSubscriber(admin, {
        first_name: fields.first_name as string | undefined,
        last_name: fields.last_name as string | undefined,
        email,
        phone: fields.phone as string | undefined,
        language: lang,
      });
      if (email && (subscriber as { mode?: string } | null)?.mode !== "already_subscribed") {
        await sendTransactionalEmail({
          templateName: "newsletter-welcome",
          recipientEmail: email,
          idempotencyKey: `newsletter-welcome-${email}`,
          templateData: { language: lang },
        });
      }
      await notifyOwners({
        event_key: "admin_contact_form",
        vars: { name: "Nuevo suscriptor", preview: email || "Suscripción al newsletter" },
        defaults: {
          title: "📬 Nuevo suscriptor",
          body: email || "Suscripción al newsletter",
          url: INBOX_URL,
          tag: `newsletter-${Date.now()}`,
        },
      });
    }

    // ===== CONTACT =====
    if (source === "contact") {
      const first_name = (fields.first_name as string | undefined) || "";
      const last_name = (fields.last_name as string | undefined) || "";
      const email = ((fields.email as string | undefined) || "").trim().toLowerCase() || null;
      const phone = (fields.phone as string | undefined) || null;
      const message = (fields.message as string | undefined) || null;

      const matchedId = await findExistingClient(admin, email, phone);

      const { data: inserted, error: insErr } = await admin
        .from("contact_submissions")
        .insert({
          first_name: first_name || "—",
          last_name: last_name || null,
          email,
          phone,
          message,
          language: lang,
          matched_client_id: matchedId,
          is_existing_client: Boolean(matchedId),
        })
        .select("id")
        .maybeSingle();
      if (insErr) console.error("[inbox-submit] contact insert error", insErr);
      savedRow = inserted ?? null;

      const fullName = [first_name, last_name].filter(Boolean).join(" ").trim() || "—";

      // Confirmation is a fixed acknowledgement: no caller-written message is
      // echoed, the name is trimmed, and each address gets at most one per day
      // so this form cannot be used to send content to arbitrary inboxes.
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const { data: rl } = await admin.rpc("check_rate_limit", {
          _key: `contact_confirm:${email}`, _max: 1, _window_seconds: 86400,
        });
        if ((rl as { allowed?: boolean } | null)?.allowed !== false) {
          const safeName = String(first_name || "").replace(/[<>{}\[\]\/\\]|https?:|www\./gi, "").slice(0, 40).trim();
          await sendTransactionalEmail({
            templateName: "contact-confirmation",
            recipientEmail: email,
            idempotencyKey: `contact-confirm-${inserted?.id ?? email}`,
            templateData: { name: safeName || undefined, language: lang },
          });
        }
      }
      await sendTransactionalEmail({
        templateName: "owner-alert-submission",
        recipientEmail: OWNER_ALERT_EMAIL,
        idempotencyKey: `owner-alert-contact-${inserted?.id ?? Date.now()}`,
        templateData: {
          formType: "contact",
          submitterName: fullName,
          submitterEmail: email,
          submitterPhone: phone,
          isExistingClient: Boolean(matchedId),
          message,
          inboxUrl: INBOX_URL,
        },
      });
      await notifyOwners({
        event_key: "admin_contact_form",
        vars: { name: fullName, preview: (message || "").slice(0, 80) || "(sin mensaje)" },
        defaults: {
          title: "📬 Nuevo mensaje de contacto",
          body: `${fullName}: ${(message || "").slice(0, 80) || "(sin mensaje)"}`,
          url: INBOX_URL,
          tag: `contact-${inserted?.id ?? Date.now()}`,
        },
      });
    }
    if (source === "recruitment") {
      const workplace = (fields.workplace as string | undefined) || null;
      const social = (fields.social as string | undefined) || null;
      const experience = (fields.experience as string | undefined) || null;
      const passion = (fields.passion as string | undefined) || null;
      const message = (fields.message as string | undefined) || null;

      const contactEmail = ((fields.email as string | undefined) || "").trim().toLowerCase() || null;
      const contactPhone = (fields.phone as string | undefined) || null;
      const contactName = (fields.contact_name as string | undefined) || null;

      const matchedId = await findExistingClient(admin, contactEmail, contactPhone);

      const { data: inserted, error: insErr } = await admin
        .from("recruitment_submissions")
        .insert({
          workplace,
          social,
          experience,
          passion,
          message,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          contact_name: contactName,
          language: lang,
          matched_client_id: matchedId,
          is_existing_client: Boolean(matchedId),
        })
        .select("id")
        .maybeSingle();
      if (insErr) console.error("[inbox-submit] recruitment insert error", insErr);
      savedRow = inserted ?? null;

      if (contactEmail) {
        await sendTransactionalEmail({
          templateName: "recruitment-confirmation",
          recipientEmail: contactEmail,
          idempotencyKey: `recruitment-confirm-${inserted?.id ?? contactEmail}`,
          templateData: { name: contactName, language: lang },
        });
      }
      await sendTransactionalEmail({
        templateName: "owner-alert-submission",
        recipientEmail: OWNER_ALERT_EMAIL,
        idempotencyKey: `owner-alert-recruit-${inserted?.id ?? Date.now()}`,
        templateData: {
          formType: "recruitment",
          submitterName: contactName || workplace || "—",
          submitterEmail: contactEmail,
          submitterPhone: contactPhone,
          isExistingClient: Boolean(matchedId),
          message,
          details: [
            workplace ? { label: "Lugar de trabajo actual", value: workplace } : null,
            social ? { label: "Redes sociales", value: social } : null,
            experience ? { label: "Experiencia", value: experience } : null,
            passion ? { label: "Por qué le apasiona", value: passion } : null,
          ].filter(Boolean),
          inboxUrl: INBOX_URL,
        },
      });
      await notifyOwners({
        event_key: "admin_contact_form",
        vars: {
          name: contactName || workplace || "Postulante",
          preview: `Únete al equipo${contactEmail ? ` · ${contactEmail}` : ""}`,
        },
        defaults: {
          title: "📬 Nueva solicitud, Únete al equipo",
          body: `${contactName || workplace || "Postulante"}${contactEmail ? ` · ${contactEmail}` : ""}`,
          url: INBOX_URL,
          tag: `recruit-${inserted?.id ?? Date.now()}`,
        },
      });
    }

    return new Response(
      JSON.stringify({ success: true, subscriber, saved: savedRow }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[inbox-submit] error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
