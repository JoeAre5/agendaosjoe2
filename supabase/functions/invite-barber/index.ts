// Invite barber: creates auth user (auto-confirmed), profile, user_roles entry,
// and links to existing barbers row. Owner-only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[^A-Za-z0-9]/g, "") + "Aa1!";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate caller token (supports ES256 signing keys)
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Invalid token" }, 401);

    const callerId = claimsData.claims.sub as string;

    // Owner check
    const { data: callerRole } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .maybeSingle();
    if (callerRole?.role !== "owner") return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const barber_id = String(body?.barber_id || "").trim();
    const emailRaw = String(body?.email || "").trim().toLowerCase();
    const full_name = String(body?.full_name || "").trim();

    if (!barber_id || !emailRaw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      return json({ error: "barber_id and valid email required" }, 400);
    }

    // Verify barbers row exists
    const { data: barberRow, error: barberErr } = await admin
      .from("barbers")
      .select("id, name")
      .eq("id", barber_id)
      .maybeSingle();
    if (barberErr || !barberRow) return json({ error: "Barber not found" }, 404);

    // Find existing auth user by email (paginate-safe via listUsers filter)
    let userId: string | null = null;
    const { data: listed } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const found = listed?.users?.find((u) => (u.email || "").toLowerCase() === emailRaw);
    if (found) userId = found.id;

    let createdAuthUser = false;
    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: emailRaw,
        password: randomPassword(),
        email_confirm: true,
        user_metadata: { full_name: full_name || barberRow.name },
      });
      if (createErr || !created.user) {
        console.error("createUser failed:", createErr);
        return json({ error: createErr?.message || "Failed to create auth user" }, 500);
      }
      userId = created.user.id;
      createdAuthUser = true;
    }

    // Upsert profile linking auth user -> barber row
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          full_name: full_name || barberRow.name,
          barber_id,
        } as never,
        { onConflict: "id" }
      );
    if (profileErr) {
      console.error("profile upsert failed:", profileErr);
      return json({ error: "Failed to link profile" }, 500);
    }

    // Ensure email is stored on barbers row
    await admin.from("barbers").update({ email: emailRaw } as never).eq("id", barber_id);

    // Remove any conflicting client role and assign barber role
    await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .neq("role", "barber");

    const { error: roleErr } = await admin
      .from("user_roles")
      .upsert(
        { user_id: userId, role: "barber" } as never,
        { onConflict: "user_id,role" }
      );
    if (roleErr) {
      console.error("role upsert failed:", roleErr);
      return json({ error: "Failed to assign role" }, 500);
    }

    // Trigger password reset email so the barber can set their own password
    let resetSent = false;
    if (createdAuthUser) {
      const { error: resetErr } = await admin.auth.resetPasswordForEmail(emailRaw);
      if (!resetErr) resetSent = true;
    }

    return json({
      success: true,
      user_id: userId,
      barber_id,
      created_auth_user: createdAuthUser,
      reset_email_sent: resetSent,
    });
  } catch (err) {
    console.error("invite-barber error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
