import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { AuthorChip } from "./AuthorChip";
import { CoverIcon } from "./CoverIcon";
import { pickLocalized, pickSlug } from "@/lib/blog/i18n";
import { usePublicationSettings } from "@/hooks/usePublicationSettings";

export interface BlogCardPost {
  id: string;
  slug: string;
  slug_en?: string | null;
  title: string;
  title_en?: string | null;
  excerpt: string | null;
  excerpt_en?: string | null;
  category: string | null;
  cover_icon: string | null;
  cover_icon_secondary?: string | null;
  cover_bg_preset: string | null;
  author: string | null;
  author_avatar_url?: string | null;
  read_time_minutes: number | null;
  published_at: string | null;
}

export function BlogCard({ post, categoryLabel }: { post: BlogCardPost; categoryLabel?: string }) {
  const { language } = useTranslation();
  const { data: pub } = usePublicationSettings();
  const fallbackAuthor = [pub?.author_first_name, pub?.author_last_name].filter(Boolean).join(" ") || "Charlie Corchado";
  const fallbackAvatar = pub?.author_avatar_url || null;
  const title = pickLocalized(post, "title", language);
  const excerpt = pickLocalized(post, "excerpt", language);
  const slug = pickSlug(post, language);
  const minutes = post.read_time_minutes;

  return (
    <Link
      to={`/titulares/${slug}`}
      className="card-blog group rounded-2xl overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1"
    >
      <div className="aspect-video overflow-hidden">
        <div className="w-full h-full transition-transform duration-500 group-hover:scale-[1.04]">
          <CoverIcon icon={post.cover_icon} iconSecondary={post.cover_icon_secondary} bgPreset={post.cover_bg_preset} size="md" />
        </div>
      </div>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
          style={{ color: "var(--accent-color)" }}
        >
          <span>{categoryLabel || post.category?.replace(/-/g, " ") || ""}</span>
          {minutes ? (
            <>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <span style={{ color: "var(--text-tertiary)" }}>{minutes} min</span>
            </>
          ) : null}
        </div>
        <h3
          className="text-base font-bold leading-snug line-clamp-2 group-hover:underline"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
        {excerpt && (
          <p className="text-xs line-clamp-2" style={{ color: "var(--text-secondary)" }}>
            {excerpt}
          </p>
        )}
        <div className="mt-auto pt-3">
          <AuthorChip
            author={post.author || fallbackAuthor}
            authorAvatarUrl={post.author_avatar_url || fallbackAvatar}
            publishedAt={post.published_at}
          />
        </div>
      </div>
    </Link>
  );
}
