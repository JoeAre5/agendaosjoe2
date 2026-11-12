/**
 * Validation helpers for admin/barber appointment creation flows
 * (NewAppointment.tsx, WalkIn.tsx).
 *
 * Rule (locked in by tests): for staff-led booking, only first name +
 * phone are required. Email is OPTIONAL — but if provided, it must be a
 * valid format. Last name is optional.
 *
 * Client-facing public booking flows have stricter rules and are NOT
 * covered here.
 */

export type StaffClientInput = {
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: "missing_first_name" | "missing_phone" | "invalid_phone" | "invalid_email" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function phoneDigits(input: string | null | undefined): string {
  const digits = (input || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/**
 * Mirrors the `hasClient` gate in NewAppointment.tsx — used to enable
 * the "Agendar Cita" CTA. Returns true when the staff member has typed
 * the minimum required fields.
 */
export function hasMinimumStaffClientInfo(input: {
  firstName: string;
  phone: string;
}): boolean {
  return input.firstName.trim().length > 0 && phoneDigits(input.phone).length === 10;
}

/**
 * Full submit-time validation used by staff appointment creation.
 */
export function validateStaffClientInput(input: StaffClientInput): ValidationResult {
  if (!input.firstName.trim()) return { ok: false, reason: "missing_first_name" };
  if (!input.phone.trim()) return { ok: false, reason: "missing_phone" };
  if (phoneDigits(input.phone).length !== 10) return { ok: false, reason: "invalid_phone" };
  const email = (input.email || "").trim();
  if (email && !EMAIL_RE.test(email)) return { ok: false, reason: "invalid_email" };
  return { ok: true };
}
