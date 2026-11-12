import { useTranslation } from "@/hooks/useTranslation";
import { formatPostDate } from "@/lib/blog/i18n";

interface AuthorChipProps {
  author: string | null;
  authorAvatarUrl?: string | null;
  authorRole?: string | null;
  publishedAt: string | null;
  readingTime?: number | null;
  size?: "sm" | "md";
}

export function AuthorChip({
  author,
  authorAvatarUrl,
  authorRole,
  publishedAt,
  readingTime,
  size = "sm",
}: AuthorChipProps) {
  const { language } = useTranslation();
  const avatarSize = size === "md" ? 36 : 24;
  const initials = (author || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <div
        className="rounded-full overflow-hidden flex items-center justify-center shrink-0"
        style={{
          width: avatarSize,
          height: avatarSize,
          background: "var(--bg-surface-2)",
          color: "var(--text-secondary)",
          fontSize: size === "md" ? 12 : 10,
          fontWeight: 700,
        }}
      >
        {authorAvatarUrl ? (
          <img loading="lazy" decoding="async" src={authorAvatarUrl} alt={author || ""} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span
          className={size === "md" ? "text-sm font-semibold" : "text-xs font-semibold"}
          style={{ color: "var(--text-primary)" }}
        >
          {author}
          {authorRole && size === "md" && (
            <span className="font-normal" style={{ color: "var(--text-tertiary)" }}>
              {" · "}
              {authorRole}
            </span>
          )}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {formatPostDate(publishedAt, language)}
          {readingTime ? ` · ${readingTime} min` : ""}
        </span>
      </div>
    </div>
  );
}
