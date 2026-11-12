// Tracks a paid booking that is still being confirmed, so a customer who
// closes the "no cierres" page and tries again is sent back to that
// confirmation instead of paying and booking a second time.
const KEY = "agendaos.pendingBooking.v1";
const MAX_AGE_MS = 20 * 60 * 1000;

export function savePendingBooking(draftId: string, url: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ draftId, url, ts: Date.now() }));
  } catch { /* ignore */ }
}

export function clearPendingBooking() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function getPendingBookingUrl(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { url?: string; ts?: number };
    if (!p.url || !p.ts || Date.now() - p.ts > MAX_AGE_MS) {
      clearPendingBooking();
      return null;
    }
    return p.url.startsWith("/citas/confirmando") ? p.url : null;
  } catch {
    return null;
  }
}
