/** Contactability is based on the current profile, never an old appointment snapshot. */
export function hasRetentionPhone(phone: string | null | undefined): boolean {
  return /\d/.test(phone ?? "");
}