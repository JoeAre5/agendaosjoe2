/**
 * Normalize a phone number to 10 digits — no country code, no formatting.
 * Used by ATH Móvil flows (which require exactly 10 digits) and elsewhere.
 *
 *   normalizePhone10("(787) 348-1280")  // "7873481280"
 *   normalizePhone10("+1 787 348 1280") // "7873481280"
 *   normalizePhone10("17873481280")     // "7873481280"
 *   normalizePhone10("")                // ""
 */
export function normalizePhone10(input: string | null | undefined): string {
  return (input || "").replace(/\D/g, "").slice(-10);
}

/**
 * Format a phone number for display as the user types: "787-555-1234".
 * Strips non-digits, caps at 10, and inserts hyphens progressively.
 * Safe to use as a controlled-input transformer in onChange.
 *
 *   formatPhoneDisplay("7")            // "7"
 *   formatPhoneDisplay("787")          // "787"
 *   formatPhoneDisplay("7875")         // "787-5"
 *   formatPhoneDisplay("7875551")      // "787-555-1"
 *   formatPhoneDisplay("7875551234")   // "787-555-1234"
 *   formatPhoneDisplay("(787) 555-1234 ext") // "787-555-1234"
 */
export function formatPhoneDisplay(input: string | null | undefined): string {
  const digits = (input || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
