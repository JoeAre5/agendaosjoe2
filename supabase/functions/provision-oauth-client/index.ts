// provision-oauth-client
// Ensures the calling auth user has a `client` role row and a linked client
// profile. Called by AuthContext after sign-in when no role is found yet
// (covers OAuth signups and any account created via pwa-signup that hasn't
// been linked yet).
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

function normalizeEmail(v: unknown): string | null {
  const email = String(v ?? "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function normalizePhone(v: unknown): string | null {
  const phone = String(v ?? "").replace(/\D+/g, "").slice(-10);
  return phone.length === 10 ? phone : null;
}

async function ensureClientProfile(admin: ReturnType<typeof createClient>, user: any, bookingSource: string) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = normalizeEmail(user.email);
  const rawFirstName = String(meta.first_name ?? "").trim();
  const firstName = rawFirstName || (email ? email.split("@")[0] : "Cliente");
  const lastName = String(meta.last_name ?? "").trim() || null;
  const phone = normalizePhone(meta.phone);

  const { data: existing, error: existingErr } = await admin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existingErr) throw existingErr;

  if (existing?.id) {
    const { error } = await admin
      .from("clients")
      .update({
        email,
        ...(rawFirstName ? { first_name: rawFirstName } : {}),
        last_name: lastName,
        phone,
        is_guest: false,
        account_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) throw error;
    return { client_id: existing.id, action: "already_linked" };
  }

  let match: { id: string } | null = null;
  if (email) {
    const { data, error } = await admin
      .from("clients")
      .select("id")
      .ilike("email", email)
      .is("auth_user_id", null)
      .order("total_visits", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    match = data;
  }

  if (match?.id) {
    const { error } = await admin
      .from("clients")
      .update({
        auth_user_id: user.id,
        email,
        ...(rawFirstName ? { first_name: rawFirstName } : {}),
        last_name: lastName,
        phone,
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
      auth_user_id: user.id,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      is_guest: false,
      account_verified: true,
      booking_source: bookingSource,
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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) return json(401, { error: "missing_token" });

    // Validate the caller's JWT and get their user.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json(401, { error: "invalid_token" });
    }
    const user = userData.user;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) Ensure a user_roles row exists. If user already has any role, keep it.
    const { data: existingRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    let role: string | null = null;
    if (existingRoles && existingRoles.length > 0) {
      const priority = ["owner", "barber", "client"];
      for (const p of priority) {
        if (existingRoles.find((r) => r.role === p)) { role = p; break; }
      }
      role = role ?? existingRoles[0].role;
    } else {
      const { error: insErr } = await admin
        .from("user_roles")
        .insert({ user_id: user.id, role: "client" });
      if (insErr && !String(insErr.message).toLowerCase().includes("duplicate")) {
        console.error("[provision-oauth-client] user_roles insert failed", insErr);
        return json(500, { error: "role_insert_failed", detail: insErr.message });
      }
      role = "client";
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const bookingSource = String((body as { booking_source?: string }).booking_source ?? "self-signup");
    let clientProfile: unknown = null;
    if (role === "client") {
      clientProfile = await ensureClientProfile(admin, user, bookingSource);
    }

    return json(200, { role, client: clientProfile });
  } catch (e) {
    console.error("[provision-oauth-client] unexpected", e);
    return json(500, { error: "unexpected", detail: String((e as Error)?.message ?? e) });
  }
});
