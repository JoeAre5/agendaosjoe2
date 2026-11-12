export const CLIENT_DUPLICATE_QUERY_ROOT = "client-duplicate-badges";
export const CLIENT_DUPLICATE_REFRESH_MS = 60_000;
export const CLIENT_DUPLICATE_DEBOUNCE_MS = 800;

export function canReadClientDuplicateBadges(userId: string | undefined, role: string | null): boolean {
  return Boolean(userId) && role === "owner";
}

export function countClientDuplicateGroups(groups: readonly unknown[] | null): number {
  if (!groups) throw new Error("Client duplicate count unavailable");
  return groups.length;
}

export function hamburgerPendingCount(paymentAndInboxCount: number, clientGroupCount: number | null): number {
  return paymentAndInboxCount + (clientGroupCount ?? 0);
}