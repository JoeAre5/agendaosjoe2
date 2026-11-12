// Edge-function mirror of src/lib/clientMatching.ts.
// Calls the same SECURITY DEFINER RPC so matching logic lives in one place (the DB).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contactEmail } from "./contactEmail.ts";

export type MatchType = "both" | "email" | "phone" | "none";
export interface ClientMatch {
  clientId: string | null;
  matchType: MatchType;
  displayName: string | null;
  email: string | null;
  phone: string | null;
}

const NONE: ClientMatch = {
  clientId: null,
  matchType: "none",
  displayName: null,
  email: null,
  phone: null,
};

export function normalizePhone10(input: string | null | undefined): string {
  return (input || "").replace(/\D/g, "").slice(-10);
}

export async function findMatchingClient(
  admin: SupabaseClient,
  phone: string | null | undefined,
  email: string | null | undefined,
): Promise<ClientMatch> {
  const phoneNorm = normalizePhone10(phone || "");
  const emailNorm = contactEmail(email)?.toLowerCase();
  if (!phoneNorm && !emailNorm) return NONE;

  const { data, error } = await admin.rpc("find_matching_client", {
    _phone: phoneNorm || null,
    _email: emailNorm || null,
  });
  if (error || !data) return NONE;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.client_id || row.match_type === "none") return NONE;
  return {
    clientId: row.client_id as string,
    matchType: row.match_type as MatchType,
    displayName: row.display_name || null,
    email: contactEmail(row.email),
    phone: row.phone || null,
  };
}
