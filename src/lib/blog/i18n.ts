// Helpers to pick the correct localized field on a blog post.
// Bilingual is required at publish, but we still fall back to ES if EN is empty
// (defensive — the publish trigger should prevent missing fields).
export function pickLocalized<T extends Record<string, any>>(
  post: T,
  field: string,
  language: string,
): string {
  if (language === "en") {
    const en = post[`${field}_en`];
    if (en && String(en).trim().length > 0) return en as string;
  }
  // Spanish primary: try `${field}_es` first, then legacy `${field}` for back-compat.
  const es = post[`${field}_es`];
  if (es && String(es).trim().length > 0) return es as string;
  return (post[field] as string) ?? "";
}

export function pickSlug<T extends { slug: string; slug_en?: string | null }>(
  post: T,
  language: string,
): string {
  if (language === "en" && post.slug_en && post.slug_en.trim().length > 0) return post.slug_en;
  return post.slug;
}

export function formatPostDate(iso: string | null, language: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(language === "es" ? "es-PR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
