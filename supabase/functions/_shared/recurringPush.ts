// Push-or-queue helper for recurring-aware notifications.
//
// When the appointment belongs to a recurring series, the push is
// QUEUED into pending_recurring_pushes (debounced by ~30s and then
// flushed by the `flush-recurring-pushes` cron). When the appointment
// is a one-off, the push is dispatched immediately exactly like before.
//
// This guarantees: no matter how many siblings a bulk recurring action
// touches (10 cancels, 12 reschedules, etc.), the client receives a
// single grouped notification per series.
import { dispatchPush, formatAppointmentVars } from "./dispatchPush.ts";

interface SupabaseLite {
  from: (table: string) => any;
}

interface QueueOrDispatchArgs {
  admin: SupabaseLite;
  client_id: string;
  appointment_id: string;
  recurring_group_id: string | null;
  template_name: "appointment_cancelled_by_shop" | "appointment_rescheduled";
  starts_at: string;
  service?: string | null;
  barber?: string | null;
  event_key?: string | null;
}

export async function queueOrDispatchRecurringPush(args: QueueOrDispatchArgs) {
  const {
    admin,
    client_id,
    appointment_id,
    recurring_group_id,
    template_name,
    starts_at,
    service,
    barber,
    event_key,
  } = args;

  const canonicalStartsAt = new Date(starts_at).toISOString();
  const stableEventKey = event_key ?? `${template_name}:${appointment_id}:${canonicalStartsAt}`;

  // No series — fire immediately, identical to legacy path.
  if (!recurring_group_id) {
    const { date, time } = formatAppointmentVars(starts_at);
    const dispatchKey =
      template_name === "appointment_cancelled_by_shop"
        ? `appt:${appointment_id}:cancel`
        : `appt:${appointment_id}:rescheduled:${canonicalStartsAt}`;
    return dispatchPush({
      client_id,
      template_name,
      dispatch_key: dispatchKey,
      appointment_id,
      starts_at,
      vars: {
        service: service ?? "tu cita",
        barber: barber ?? "tu barbero",
        date,
        time,
      },
    });
  }

  // Series — upsert into the pending queue. The unique partial index
  // guarantees one open row per (client, template, series).
  const { data: existing, error: selErr } = await admin
    .from("pending_recurring_pushes")
    .select("id, count, first_starts_at, last_starts_at, event_keys")
    .eq("client_id", client_id)
    .eq("template_name", template_name)
    .eq("recurring_group_id", recurring_group_id)
    .is("flushed_at", null)
    .maybeSingle();

  if (selErr) {
    console.warn("[recurringPush] select failed:", selErr.message);
  }

  if (existing) {
    const eventKeys = Array.isArray(existing.event_keys) ? existing.event_keys : [];
    if (eventKeys.includes(stableEventKey)) {
      await admin
        .from("pending_recurring_pushes")
        .update({
          last_event_at: new Date().toISOString(),
          service: service ?? null,
          barber: barber ?? null,
        })
        .eq("id", existing.id);
      return { queued: true, duplicate: true };
    }

    const newFirst =
      existing.first_starts_at && new Date(existing.first_starts_at) < new Date(canonicalStartsAt)
        ? existing.first_starts_at
        : canonicalStartsAt;
    const newLast =
      existing.last_starts_at && new Date(existing.last_starts_at) > new Date(canonicalStartsAt)
        ? existing.last_starts_at
        : canonicalStartsAt;
    await admin
      .from("pending_recurring_pushes")
      .update({
        count: (existing.count ?? 0) + 1,
        last_event_at: new Date().toISOString(),
        first_starts_at: newFirst,
        last_starts_at: newLast,
        service: service ?? null,
        barber: barber ?? null,
        event_keys: [...eventKeys, stableEventKey],
      })
      .eq("id", existing.id);
  } else {
    await admin.from("pending_recurring_pushes").insert({
      client_id,
      template_name,
      recurring_group_id,
      count: 1,
      first_starts_at: canonicalStartsAt,
      last_starts_at: canonicalStartsAt,
      service: service ?? null,
      barber: barber ?? null,
      event_keys: [stableEventKey],
      last_event_at: new Date().toISOString(),
    });
  }
  return { queued: true };
}
