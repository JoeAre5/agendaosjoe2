import { supabase } from "@/integrations/supabase/client";

/** UI gating only. The existing RPC independently verifies the session's role. */
export function canConfirmStaffOverlap(isOwner: boolean, isBarber: boolean): boolean {
  return isOwner || isBarber;
}

export async function authorizeStaffOverlap(acuityId: number, reason: string): Promise<void> {
  if (!Number.isSafeInteger(acuityId) || acuityId === 0) throw new Error("Invalid appointment ID");
  const { error } = await supabase.rpc("staff_preauthorize_overlap", {
    _acuity_id: acuityId,
    _reason: reason,
  });
  if (error) throw error;
}

/** Cancellation and rejected authorization must never continue to a write. */
export async function confirmStaffOverlap(
  allowed: boolean,
  confirm: () => boolean,
  acuityId: number,
  reason: string,
): Promise<boolean> {
  if (!allowed || !confirm()) return false;
  await authorizeStaffOverlap(acuityId, reason);
  return true;
}