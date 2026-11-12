// Verifies that a request comes from a trusted internal caller:
//  - scheduled jobs / DB triggers sending `x-internal-secret`, or
//  - other edge functions sending the service-role key as Bearer token.
// deno-lint-ignore no-explicit-any
export async function isInternalCaller(req: Request, admin: any): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (serviceKey && bearer && bearer === serviceKey) return true;

  const secret = req.headers.get("x-internal-secret") || "";
  if (!secret) return false;
  const { data, error } = await admin.rpc("verify_internal_job_secret", { _secret: secret });
  return !error && data === true;
}

// Returns true when the bearer token belongs to an owner / super_owner.
// deno-lint-ignore no-explicit-any
export async function isOwnerCaller(req: Request, admin: any): Promise<boolean> {
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearer) return false;
  const { data } = await admin.auth.getUser(bearer);
  const uid = data?.user?.id;
  if (!uid) return false;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", uid);
  return (roles ?? []).some((r: { role: string }) => r.role === "owner" || r.role === "super_owner");
}

export function unauthorizedResponse(headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
