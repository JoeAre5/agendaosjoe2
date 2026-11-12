import { supabase } from "@/integrations/supabase/client";

/**
 * Find an existing client by phone (normalized to last 10 digits) or create a new one.
 * Prevents duplicate client profiles by deduplicating on the normalized phone number,
 * regardless of formatting (787-348-1280 == 7873481280 == +17873481280).
 *
 * If no phone is provided, falls back to a name match (legacy behavior).
 */
export async function findOrCreateClient(opts: {
  firstName: string;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  acuityClientId?: number | null;
}): Promise<string | null> {
  const firstName = opts.firstName.trim();
  const lastName = (opts.lastName || "").trim() || null;
  const phone = (opts.phone || "").trim() || null;
  const email = (opts.email || "").trim() || null;

  // 1. Phone-based lookup (preferred — uses normalized 10-digit RPC)
  if (phone) {
    const { data: existingId } = await supabase.rpc("find_client_by_phone", { _phone: phone });
    if (existingId) return existingId as string;
  } else {
    // 2. Fallback: name match when no phone available
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .ilike("first_name", firstName)
      .ilike("last_name", lastName || "")
      .limit(1);
    if (existing?.length) return existing[0].id;
  }

  // 3. Create new
  const { data: newClient, error } = await supabase
    .from("clients")
    .insert({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      acuity_client_id: opts.acuityClientId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // If the trigger fired (race condition), look up the existing one
    if (error.message.includes("duplicate_client_phone") && phone) {
      const { data: fallbackId } = await supabase.rpc("find_client_by_phone", { _phone: phone });
      if (fallbackId) return fallbackId as string;
    }
    throw error;
  }
  return newClient?.id || null;
}
