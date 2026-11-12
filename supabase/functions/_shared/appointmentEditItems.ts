export interface AppointmentEditItem {
  kind: "service" | "addon" | "extra_service" | "extra_addon" | "product";
  id: number | string;
  name: string;
  price_cents: number;
  duration_minutes: number;
  quantity: number;
}

export function readEditItems(value: unknown): AppointmentEditItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const kinds = ["service", "addon", "extra_service", "extra_addon", "product"];
  if (!value.every((v) => v && kinds.includes(v.kind) &&
    (typeof v.id === "number" || typeof v.id === "string") && typeof v.name === "string" &&
    Number.isSafeInteger(v.price_cents) && v.price_cents >= 0 &&
    Number.isSafeInteger(v.duration_minutes) && v.duration_minutes >= 0 &&
    Number.isSafeInteger(v.quantity) && v.quantity > 0)) return null;
  if (value.filter((v) => v.kind === "service").length !== 1) return null;
  return value;
}

export function totalEditItems(items: AppointmentEditItem[]) {
  return items.reduce((total, item) => ({
    priceCents: total.priceCents + item.price_cents * item.quantity,
    durationMinutes: total.durationMinutes + item.duration_minutes * item.quantity,
  }), { priceCents: 0, durationMinutes: 0 });
}

export function replaceMainItems(saved: AppointmentEditItem[], main: AppointmentEditItem, addons: AppointmentEditItem[]) {
  return [main, ...addons, ...saved.filter((i) => i.kind !== "service" && i.kind !== "addon")];
}

export function resolveEditReplacement(saved: AppointmentEditItem[] | null, main: AppointmentEditItem, addons: AppointmentEditItem[], explicitReplacement: boolean) {
  if (!explicitReplacement) return saved;
  const items = replaceMainItems(saved ?? [], main, addons);
  return readEditItems(items);
}

export function editServiceBalance(priceCents: number, paidCents: number, tipCents: number) {
  return Math.max(0, priceCents - Math.max(0, paidCents - tipCents));
}

// Acuity cannot update an existing appointment's service/price/duration by API.
// Keep the explicit staff snapshot authoritative, even after the echo window.
// Date/time and cancellations remain Acuity-managed; derive the end from local duration.
export function preserveItemizedEdit(row: Record<string, any>, existing: Record<string, any> | null | undefined) {
  if (!existing || !readEditItems(existing.edit_line_items)) return;
  for (const key of ["service_id", "service_name", "addons", "price_cents", "duration_minutes",
    "amount_paid_cents", "tip_cents", "payment_method", "payment_confirmed"]) {
    row[key] = existing[key];
  }
  row.paid = row.status === "cancelled" || row.status === "no_show" ? false : existing.paid;
  if (row.starts_at) {
    row.ends_at = new Date(new Date(row.starts_at).getTime() + existing.duration_minutes * 60_000).toISOString();
  }
}