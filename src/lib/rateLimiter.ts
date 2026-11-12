/**
 * Client-side rate limiter using sessionStorage.
 * Tracks attempts per action key within a rolling window.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const STORAGE_PREFIX = "rl_";

export function checkRateLimit(
  action: string,
  maxAttempts: number,
  windowMs: number = 3600000 // 1 hour default
): { allowed: boolean; remainingMs: number; remaining: number } {
  const key = STORAGE_PREFIX + action;
  const now = Date.now();

  let entry: RateLimitEntry = { timestamps: [] };
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) entry = JSON.parse(raw);
  } catch {}

  // Prune expired timestamps
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxAttempts) {
    const oldest = entry.timestamps[0];
    const remainingMs = windowMs - (now - oldest);
    return { allowed: false, remainingMs, remaining: 0 };
  }

  return { allowed: true, remainingMs: 0, remaining: maxAttempts - entry.timestamps.length };
}

export function recordAttempt(action: string, windowMs: number = 3600000): void {
  const key = STORAGE_PREFIX + action;
  const now = Date.now();

  let entry: RateLimitEntry = { timestamps: [] };
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) entry = JSON.parse(raw);
  } catch {}

  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
  entry.timestamps.push(now);

  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {}
}

export function formatRemainingTime(ms: number, lang: string): string {
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 1) return lang === "es" ? "menos de 1 minuto" : "less than 1 minute";
  return lang === "es" ? `${minutes} minutos` : `${minutes} minutes`;
}
