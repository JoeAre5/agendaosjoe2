/**
 * Referral attribution: capture, persist, and record conversions.
 *
 * Capture flow:
 *   - User lands with `?ref=<code>` OR via `/r/:code` (which 302s to `/?ref=...`).
 *   - We persist the code in cookie + localStorage for 90 days.
 *   - When the user completes a "conversion" (signup, waitlist, first booking,
 *     PWA install, push enabled), we call `recordReferralConversion()` which
 *     fires the `record_referral_conversion` RPC.
 *
 * The cookie + localStorage redundancy is intentional: iOS Safari aggressively
 * clears cookies, and standalone PWAs don't always preserve site cookies
 * across launches.
 */
import { supabase } from "@/integrations/supabase/client";

const COOKIE_NAME = "ref_attribution";
const STORAGE_KEY = "ref_attribution_v1";
const MAX_AGE_DAYS = 90;
const MAX_AGE_SECONDS = MAX_AGE_DAYS * 24 * 60 * 60;

export type ConversionType =
  | "signup"
  | "waitlist"
  | "first_booking"
  | "pwa_install"
  | "push_enabled";

interface StoredRef {
  code: string;
  capturedAt: number;
  landingUrl?: string;
  utm?: { source?: string; medium?: string; campaign?: string };
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure}`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * Look at the current URL for `?ref=...` and persist if present.
 * Safe to call multiple times; only writes when a new ref is found.
 * Also captures utm params alongside.
 */
export function captureRefFromUrl(): StoredRef | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("ref");
    if (!code || code.length > 64) return getStoredRef();

    const stored: StoredRef = {
      code: code.toLowerCase().trim(),
      capturedAt: Date.now(),
      landingUrl: url.pathname + url.search,
      utm: {
        source: url.searchParams.get("utm_source") || undefined,
        medium: url.searchParams.get("utm_medium") || undefined,
        campaign: url.searchParams.get("utm_campaign") || undefined,
      },
    };

    setCookie(COOKIE_NAME, JSON.stringify(stored), MAX_AGE_SECONDS);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // ignore quota/disabled errors
    }
    return stored;
  } catch {
    return null;
  }
}

export function persistRefCode(code: string, landingUrl?: string): StoredRef | null {
  if (typeof window === "undefined") return null;
  const normalized = code.toLowerCase().trim();
  if (!normalized || normalized.length > 64) return getStoredRef();

  const stored: StoredRef = {
    code: normalized,
    capturedAt: Date.now(),
    landingUrl: landingUrl || window.location.pathname + window.location.search,
  };

  setCookie(COOKIE_NAME, JSON.stringify(stored), MAX_AGE_SECONDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // ignore quota/disabled errors
  }
  return stored;
}

export function getStoredRef(): StoredRef | null {
  if (typeof window === "undefined") return null;

  const fromCookie = readCookie(COOKIE_NAME);
  if (fromCookie) {
    try {
      const parsed = JSON.parse(fromCookie) as StoredRef;
      if (parsed?.code && Date.now() - parsed.capturedAt < MAX_AGE_SECONDS * 1000) {
        return parsed;
      }
    } catch {
      // fall through to localStorage
    }
  }

  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (!fromStorage) return null;
    const parsed = JSON.parse(fromStorage) as StoredRef;
    if (parsed?.code && Date.now() - parsed.capturedAt < MAX_AGE_SECONDS * 1000) {
      // Re-hydrate cookie from storage backup
      setCookie(COOKIE_NAME, fromStorage, MAX_AGE_SECONDS);
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function clearStoredRef() {
  deleteCookie(COOKIE_NAME);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Fire-and-forget conversion record. Never throws.
 *
 * @param conversionType - one of the allowed conversion types
 * @param clientId       - optional, passed when the calling code already
 *                         knows the client id (e.g. immediately after signup
 *                         before the auth context refreshes).
 */
export async function recordReferralConversion(
  conversionType: ConversionType,
  clientId?: string | null,
  appointmentId?: string | null
): Promise<void> {
  const stored = getStoredRef();
  if (!stored?.code) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)("record_referral_conversion", {
      _code: stored.code,
      _conversion_type: conversionType,
      _client_id: clientId ?? null,
      _landing_url: stored.landingUrl ?? null,
      _utm_source: stored.utm?.source ?? null,
      _utm_medium: stored.utm?.medium ?? null,
      _utm_campaign: stored.utm?.campaign ?? null,
      _appointment_id: appointmentId ?? null,
    });

    // Also assign the client to the referral owner for any conversion type
    // (signup, first_booking, waitlist, pwa_install, push_enabled). Idempotent
    // server-side; safe to call repeatedly. Self-heals matching bonus.
    if (clientId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("assign_client_referral", {
          _client_id: clientId,
          _slug: stored.code,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[referral] assign_client_referral failed", e);
      }
    }

  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[referral] conversion record failed", err);
  }
}
