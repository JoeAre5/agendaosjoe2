// pwa-signup
// Bulletproof signup for the Client PWA / Welcome flow.
//
// Why this exists:
//   Relying on the project's "auto_confirm_email" toggle is fragile — if it
//   ever flips off (manual change, restore, env reset), clients see the
//   dreaded "Email not confirmed" error during onboarding. This function
//   creates the auth user via the admin API with `email_confirm: true`,
//   which is independent of project-level auth settings, so confirmation
//   is GUARANTEED regardless of dashboard configuration.
//
// It also collapses the pre-check + signup into a single server round-trip:
//   - new email          → creates confirmed user, returns { status: "created" }
//   - already PWA user   → returns { status: "has_account" } (client routes to /login)
//   - legacy guest row   → creates confirmed user; client RPC links the row
//
// The client then performs signInWithPassword to obtain a session.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function normalizeEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}
function normalizePhone10(v: unknown): string {
  return String(v ?? "").replace(/\D+/g, "").slice(-10);
}

async function ensureClientProfile(admin: ReturnType<typeof createClient>, userId: string, email: string, firstName: string, lastName: string, phone: string, source: string) {
  const safeFirst = firstName || email.split("@")[0] || "Cliente";

  const { data: existing, error: existingErr } = await admin
    .from("clients")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (existing?.id) return { client_id: existing.id, action: "already_linked" };

  const { data: match, error: matchErr } = await admin
    .from("clients")
    .select("id, phone")
    .ilike("email", email)
    .is("auth_user_id", null)
    .order("total_visits", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (matchErr) throw matchErr;

  if (match?.id) {
    // Email alone is not proof of ownership (accounts are auto-confirmed), so
    // an existing profile is only claimed when the phone on file also matches.
    const onFile = normalizePhone10(match.phone);
    if (!onFile || onFile !== normalizePhone10(phone)) {
      const err = new Error("identity_mismatch");
      (err as Error & { code?: string }).code = "identity_mismatch";
      throw err;
    }
    const { error } = await admin
      .from("clients")
      .update({
        auth_user_id: userId,
        is_guest: false,
        account_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id);
    if (error) throw error;
    return { client_id: match.id, action: "linked_existing" };
  }

  const { data: created, error: createErr } = await admin
    .from("clients")
    .insert({
      auth_user_id: userId,
      first_name: safeFirst,
      last_name: lastName || null,
      email,
      phone: phone || null,
      is_guest: false,
      account_verified: true,
      booking_source: source,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;
  return { client_id: created.id, action: "created" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const password = String(body?.password ?? "");
    const firstName = String(body?.first_name ?? "").trim();
    const lastName = String(body?.last_name ?? "").trim();
    const phone = normalizePhone10(body?.phone);

    if (!email || !email.includes("@")) return json(400, { error: "invalid_email" });
    if (password.length < 8) return json(400, { error: "weak_password" });
    // first_name and phone are required ONLY for the Welcome flow which collects them.
    // Lightweight entry points (e.g. /citas/acceso) pass source="post_booking" and
    // omit those fields — onboarding collects them later in the portal.
    const source = String(body?.source ?? "welcome");
    const strictProfile = true; // every new account needs real name + phone (prevents email-prefix names)
    if (strictProfile && !firstName) return json(400, { error: "missing_first_name" });
    if (strictProfile && phone.length !== 10) return json(400, { error: "invalid_phone" });

    // Pre-check via existing RPC — single source of truth for "has account?"
    const { data: statusData, error: statusErr } = await admin.rpc(
      "check_signup_email_status",
      { _email: email },
    );
    if (statusErr) {
      console.error("[pwa-signup] status check failed", statusErr);
      // Fall through; admin.createUser will surface a duplicate error if needed.
    }
    const status = (statusData as { status?: string } | null)?.status;
    if (status === "has_account") {
      return json(200, { status: "has_account" });
    }

    // Force-confirmed user creation — independent of project auto_confirm setting.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName || null,
        last_name: lastName || null,
        phone: phone || null,
      },
    });

    if (createErr) {
      const msg = (createErr.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate")) {
        return json(200, { status: "has_account" });
      }
      if (msg.includes("password")) return json(400, { error: "weak_password", detail: createErr.message });
      console.error("[pwa-signup] createUser failed", createErr);
      return json(500, { error: "signup_failed", detail: createErr.message });
    }

    const userId = created?.user?.id;
    if (!userId) return json(500, { error: "signup_failed", detail: "no_user_id" });

    try {
      const client = await ensureClientProfile(admin, userId, email, firstName, lastName, phone, source);
      return json(200, { status: "created", user_id: userId, client });
    } catch (profileErr) {
      if ((profileErr as Error)?.message === "identity_mismatch") {
        // Roll back the new login so the email isn't held by an unlinked account.
        await admin.auth.admin.deleteUser(userId).catch(() => {});
        return json(200, { error: "identity_mismatch" });
      }
      console.error("[pwa-signup] client profile link/create failed", profileErr);
      return json(500, { error: "profile_failed" });
    }

  } catch (e) {
    console.error("[pwa-signup] unexpected", e);
    return json(500, { error: "unexpected", detail: String((e as Error)?.message ?? e) });
  }
});
