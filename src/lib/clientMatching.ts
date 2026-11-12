import { supabase } from "@/integrations/supabase/client";
import { normalizePhone10 } from "@/lib/phone";

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

/**
 * Unified client identity matching. Single source of truth — every appointment
 * creation/edit surface (admin, barber, client portal, public booking) calls this.
 *
 * Returns the best match found, preferring `both` > `email` > `phone`.
 * Null-safe: empty inputs never match (no NULL=NULL false positives).
 */
export async function findMatchingClient(
  phone: string | null | undefined,
  email: string | null | undefined,
): Promise<ClientMatch> {
  const phoneNorm = normalizePhone10(phone || "");
  const emailNorm = (email || "").trim().toLowerCase();

  if (!phoneNorm && !emailNorm) return NONE;

  const { data, error } = await supabase.rpc("find_matching_client", {
    _phone: phoneNorm || null,
    _email: emailNorm || null,
  });

  if (error || !data || (Array.isArray(data) && data.length === 0)) return NONE;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.client_id || row.match_type === "none") return NONE;

  return {
    clientId: row.client_id,
    matchType: row.match_type as MatchType,
    displayName: row.display_name || null,
    email: row.email || null,
    phone: row.phone || null,
  };
}

/**
 * Owner/Barber-only: re-link an existing appointment to a target client profile,
 * also overwriting client_name/email/phone so no orphan-name displays remain.
 */
export async function relinkAppointment(
  appointmentId: string,
  targetClientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("relink_appointment", {
    _appt_id: appointmentId,
    _target_client_id: targetClientId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
