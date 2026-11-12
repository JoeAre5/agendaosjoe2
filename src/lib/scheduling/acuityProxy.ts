// The one Acuity proxy call. Every admin / client screen used to carry its
// own copy of this function; the request and the error contract are unchanged.
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProxyResult = any;

export class EdgeFunctionError extends Error {
  status: number;
  code: string;
  reason: string | null;
  constructor(status: number, code: string, message: string, reason: string | null = null) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

/**
 * POSTs a JSON body to an edge function with the caller's session. Shared by
 * the Acuity proxy and the native scheduler so auth headers and error
 * handling live in one place.
 */
export async function callEdgeFunction(name: string, body: unknown): Promise<{ status: number; json: ProxyResult }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(`https://${projectId}.supabase.co/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

/**
 * Calls the `acuity-proxy` edge function with the caller's session.
 *
 * Calls that target a synthetic (negative) appointment id resolve to `null`:
 * those rows exist only in this database and have nothing in Acuity.
 */
export async function acuityProxy(path: string, method = "GET", body?: unknown): Promise<ProxyResult> {
  const apptIdMatch = path.match(/\/appointments\/(-?\d+)/);
  if (apptIdMatch && parseInt(apptIdMatch[1], 10) < 0) return null;

  const { status, json } = await callEdgeFunction("acuity-proxy", { path, method, body });
  if (status >= 400) throw new Error(json?.message || json?.error || `Acuity proxy error ${status}`);
  return json;
}
