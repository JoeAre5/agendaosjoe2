// Shared guards for public payment endpoints.
// deno-lint-ignore-file no-explicit-any

const PROJECT_SLUG = "b2bc2e8c-ae89-4b9e-8b09-3f30500df3fb";

// Return/redirect origins must be this project's own hosts or a registered shop hostname.
export async function isAllowedReturnOrigin(admin: any, origin: string): Promise<boolean> {
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (url.pathname !== "/" && url.pathname !== "") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (url.protocol !== "https:") return false;
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) {
    return host.includes(PROJECT_SLUG) || host === "app-agendaos.lovable.app";
  }
  const { data } = await admin.from("shop_hostnames").select("hostname").eq("hostname", host).maybeSingle();
  return !!data;
}

async function callerUserId(admin: any, req: Request): Promise<string | null> {
  const h = req.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return null;
  const { data } = await admin.auth.getUser(h.slice(7));
  return data?.user?.id ?? null;
}

async function isStaff(admin: any, uid: string): Promise<boolean> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", uid);
  return (data ?? []).some((r: { role: string }) =>
    ["owner", "super_owner", "manager", "staff", "barber"].includes(r.role));
}

/**
 * Draft access: the draft ID is the guest's capability. When the draft is
 * linked to a client who has an account, the caller must be that account
 * (or shop staff). `requireAccount` forces a signed-in owner (used for
 * charging saved cards).
 */
export async function canAccessDraft(
  admin: any, req: Request, clientId: string | null | undefined, requireAccount = false,
): Promise<boolean> {
  let authUserId: string | null = null;
  if (clientId) {
    const { data } = await admin.from("clients").select("auth_user_id").eq("id", clientId).maybeSingle();
    authUserId = data?.auth_user_id ?? null;
  }
  if (!authUserId && !requireAccount) return true;
  const uid = await callerUserId(admin, req);
  if (!uid) return false;
  if (authUserId && uid === authUserId) return true;
  return await isStaff(admin, uid);
}
