// Helper for resolving client avatar URLs.
//
// The 'client-avatars' bucket is PRIVATE — `getPublicUrl` no longer works.
// Avatars must be displayed via short-lived signed URLs created by the owning
// client (or by staff via the staff-read RLS policy).
//
// Storage convention: files live at `{auth_user_id}/avatar.{ext}` so the
// user can read their own folder under the new RLS policies.
//
// Backward compatibility: legacy `clients.avatar_url` rows hold a full
// `/storage/v1/object/public/client-avatars/<path>` URL. We strip the
// prefix and sign the path. New uploads write only the storage path.
import { supabase } from "@/integrations/supabase/client";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
const BUCKET = "client-avatars";

/** Extract the storage path from any value persisted in clients.avatar_url. */
export function extractAvatarPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Already a bare path
  if (!trimmed.startsWith("http")) return trimmed.replace(/^\/+/, "");
  // Legacy public URL → strip everything up to and including the bucket name
  const marker = `/${BUCKET}/`;
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;
  return trimmed.slice(idx + marker.length);
}

/**
 * Resolve a stored avatar value to a displayable URL.
 * Returns null on any failure so callers can fall back to initials.
 */
export async function resolveClientAvatarUrl(
  value: string | null | undefined,
): Promise<string | null> {
  const path = extractAvatarPath(value);
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
