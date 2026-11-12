import { supabase } from "@/integrations/supabase/client";

export interface ConflictAppt {
  id: string;
  client_name: string;
  service_name: string;
  starts_at: string;
  ends_at: string;
}

/**
 * Returns appointments on the same barber that overlap [startsAt, endsAt).
 * Excludes the appointment being edited (if excludeApptId is provided).
 */
export async function checkAppointmentConflicts(
  barberId: string,
  startsAt: string,
  endsAt: string,
  excludeApptId?: string | null,
): Promise<ConflictAppt[]> {
  // Overlap test: existing.starts_at < new.ends_at AND existing.ends_at > new.starts_at
  let q = supabase
    .from("appointments")
    .select("id, client_name, service_name, starts_at, ends_at, status")
    .eq("barber_id", barberId)
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .neq("status", "cancelled");

  if (excludeApptId) q = q.neq("id", excludeApptId);

  const { data, error } = await q;
  if (error) throw error;
  if (!data) throw new Error("Could not verify appointment conflicts");
  return data as ConflictAppt[];
}
