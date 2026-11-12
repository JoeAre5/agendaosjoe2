/**
 * Resolves branded color + avatar for a referral owner.
 *
 * - barber owners → barbers.color & barbers.avatar_url via owner_profile_id
 * - shop owner   → CSS var `--text-primary` color, no avatar
 * - fallback     → accent color
 */
import { supabase } from "@/integrations/supabase/client";

export interface OwnerMeta {
  color: string;
  avatarUrl: string | null;
}

export type OwnerColorMap = Map<string, OwnerMeta>;

export const SHOP_COLOR = "var(--text-primary)";
export const FALLBACK_COLOR = "var(--accent-color)";

export async function loadOwnerColorMap(
  owners: Array<{ id: string; owner_type: string; owner_profile_id?: string | null }>,
): Promise<OwnerColorMap> {
  const map: OwnerColorMap = new Map();
  const barberIds = owners
    .filter((o) => o.owner_type === "barber" && o.owner_profile_id)
    .map((o) => o.owner_profile_id as string);

  let barberMetaById = new Map<string, { color: string | null; avatar_url: string | null }>();
  if (barberIds.length > 0) {
    const { data } = await supabase
      .from("barbers")
      .select("id,color,avatar_url")
      .in("id", barberIds);
    barberMetaById = new Map(
      ((data as Array<{ id: string; color: string | null; avatar_url: string | null }>) || [])
        .map((b) => [b.id, { color: b.color, avatar_url: b.avatar_url }]),
    );
  }

  for (const o of owners) {
    if (o.owner_type === "shop") {
      map.set(o.id, { color: SHOP_COLOR, avatarUrl: null });
    } else if (o.owner_type === "barber" && o.owner_profile_id) {
      const meta = barberMetaById.get(o.owner_profile_id);
      map.set(o.id, {
        color: meta?.color || FALLBACK_COLOR,
        avatarUrl: meta?.avatar_url || null,
      });
    } else {
      map.set(o.id, { color: FALLBACK_COLOR, avatarUrl: null });
    }
  }
  return map;
}

export function getOwnerColor(map: OwnerColorMap, ownerId: string): string {
  return map.get(ownerId)?.color || FALLBACK_COLOR;
}

export function getOwnerAvatar(map: OwnerColorMap, ownerId: string): string | null {
  return map.get(ownerId)?.avatarUrl || null;
}
