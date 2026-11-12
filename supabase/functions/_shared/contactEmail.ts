/** Contact policy only. This does not change booking, identity or payment rules. */
export function contactEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /@placeholders?\.local$/i.test(trimmed)) return null;
  return trimmed;
}