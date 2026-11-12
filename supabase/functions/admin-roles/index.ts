// admin-roles
// Owner-only management of staff roles (owner / admin / barber).
// Only ONE owner is allowed. Owner role cannot be assigned, changed-to, or
// removed through this function; it is managed in the database directly.
// Actions:
//   { action: "list" }
//     -> { members: [...] }   (includes owner, admin, barber)
//   { action: "assign", email, role: "admin"|"barber", full_name? }
//   { action: "change", user_id, role: "admin"|"barber" }
//   { action: "remove", user_id }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type StaffRole = "owner" | "admin" | "barber";
const LISTED_ROLES: StaffRole[] = ["owner", "admin", "barber"];
const ASSIGNABLE_ROLES: StaffRole[] = ["admin", "barber"];
const ASSIGNABLE_OR_CLIENT = ["admin", "barber", "client"] as const;

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return json(401, { error: "missing_auth" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json(401, { error: "invalid_jwt" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isOwner } = await admin.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "owner",
    });
    if (!isOwner) return json(403, { error: "forbidden" });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    // ---- LIST -----------------------------------------------------------
    if (action === "list") {
      const { data: roleRows, error: rolesErr } = await admin
        .from("user_roles")
        .select("user_id, role")
        .in("role", LISTED_ROLES);
      if (rolesErr) return json(500, { error: "list_failed", detail: rolesErr.message });

      const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id)));
      const [{ data: profiles }, authList] = await Promise.all([
        ids.length
          ? admin.from("profiles").select("id, full_name, barber_id").in("id", ids)
          : Promise.resolve({ data: [] as any[] }),
        admin.auth.admin.listUsers({ perPage: 1000 }),
      ]);

      const barberIds = Array.from(
        new Set((profiles ?? []).map((p: any) => p.barber_id).filter(Boolean)),
      );
      const { data: barbers } = barberIds.length
        ? await admin.from("barbers").select("id, name").in("id", barberIds)
        : { data: [] as any[] };
      const barberMap = new Map((barbers ?? []).map((b: any) => [b.id, b.name]));
      const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const emailMap = new Map(
        (authList?.data?.users ?? []).map((u: any) => [u.id, u.email ?? ""]),
      );

      const members = (roleRows ?? []).map((r: any) => {
        const p = profMap.get(r.user_id) as any;
        return {
          user_id: r.user_id,
          role: r.role,
          full_name: p?.full_name ?? "",
          email: emailMap.get(r.user_id) ?? "",
          barber_id: p?.barber_id ?? null,
          barber_name: p?.barber_id ? barberMap.get(p.barber_id) ?? null : null,
        };
      });
      const rank = (r: string) => (r === "owner" ? 0 : r === "admin" ? 1 : 2);
      members.sort((a, b) => {
        if (a.role !== b.role) return rank(a.role) - rank(b.role);
        return (a.full_name || a.email).localeCompare(b.full_name || b.email);
      });
      return json(200, { members });
    }

    // ---- ASSIGN ---------------------------------------------------------
    if (action === "assign") {
      const email = String(body?.email ?? "").trim().toLowerCase();
      const role = String(body?.role ?? "") as typeof ASSIGNABLE_OR_CLIENT[number];
      if (!email || !ASSIGNABLE_OR_CLIENT.includes(role)) {
        return json(400, { error: "bad_input" });
      }
      let targetId: string | null = null;
      for (let page = 1; page <= 5; page++) {
        const { data: list, error: listErr } =
          await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr) return json(500, { error: "auth_list_failed", detail: listErr.message });
        const hit = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === email);
        if (hit) { targetId = hit.id; break; }
        if (!list?.users || list.users.length < 1000) break;
      }
      if (!targetId) return json(404, { error: "user_not_found" });

      // Refuse to overwrite the sole owner via this endpoint
      const { data: existing } = await admin
        .from("user_roles").select("role").eq("user_id", targetId);
      if ((existing ?? []).some((r: any) => r.role === "owner")) {
        return json(400, { error: "target_is_owner" });
      }

      const fullName = String(body?.full_name ?? "").trim() || email;
      await admin
        .from("profiles")
        .upsert({ id: targetId, full_name: fullName }, { onConflict: "id" });

      await admin.from("user_roles").delete().eq("user_id", targetId);
      const { error: insErr } = await admin
        .from("user_roles")
        .insert({ user_id: targetId, role });
      if (insErr) return json(500, { error: "assign_failed", detail: insErr.message });
      return json(200, { ok: true, user_id: targetId });
    }

    // ---- CHANGE ---------------------------------------------------------
    if (action === "change") {
      const userId = String(body?.user_id ?? "");
      const role = String(body?.role ?? "") as typeof ASSIGNABLE_OR_CLIENT[number];
      if (!userId || !ASSIGNABLE_OR_CLIENT.includes(role)) return json(400, { error: "bad_input" });

      // Cannot modify an owner via this endpoint
      const { data: existing } = await admin
        .from("user_roles").select("role").eq("user_id", userId);
      if ((existing ?? []).some((r: any) => r.role === "owner")) {
        return json(400, { error: "cannot_modify_owner" });
      }

      await admin.from("user_roles").delete().eq("user_id", userId).in("role", LISTED_ROLES);
      if (role === "client") {
        await admin
          .from("user_roles")
          .upsert(
            { user_id: userId, role: "client" },
            { onConflict: "user_id,role", ignoreDuplicates: true },
          );
      } else {
        const { error: insErr } = await admin
          .from("user_roles")
          .insert({ user_id: userId, role });
        if (insErr) return json(500, { error: "change_failed", detail: insErr.message });
      }
      return json(200, { ok: true });
    }

    // ---- REMOVE ---------------------------------------------------------
    if (action === "remove") {
      const userId = String(body?.user_id ?? "");
      if (!userId) return json(400, { error: "bad_input" });
      if (userId === userData.user.id) {
        return json(400, { error: "cannot_remove_self" });
      }
      const { data: existing } = await admin
        .from("user_roles").select("role").eq("user_id", userId);
      if ((existing ?? []).some((r: any) => r.role === "owner")) {
        return json(400, { error: "cannot_remove_owner" });
      }
      await admin
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .in("role", LISTED_ROLES);
      await admin
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "client" },
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );
      return json(200, { ok: true });
    }

    return json(400, { error: "unknown_action" });
  } catch (err) {
    console.error("[admin-roles]", err);
    return json(500, { error: (err as Error).message });
  }
});
