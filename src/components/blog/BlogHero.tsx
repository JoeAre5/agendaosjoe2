import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { AuthorChip } from "./AuthorChip";
import { CoverIcon } from "./CoverIcon";
import { pickLocalized, pickSlug } from "@/lib/blog/i18n";
import { usePublicationSettings } from "@/hooks/usePublicationSettings";
import type { BlogCardPost } from "./BlogCard";

export function BlogHero({ post, categoryLabel }: { post: BlogCardPost; categoryLabel?: string }) {
  const { language } = useTranslation();
  const { data: pub } = usePublicationSettings();
  const fallbackAuthor = [pub?.author_first_name, pub?.author_last_name].filter(Boolean).join(" ") || "Charlie Corchado";
  const fallbackAvatar = pub?.author_avatar_url || null;
  const fallbackRole = (language === "en" ? pub?.author_role_en : pub?.author_role_es) || null;
  const title = pickLocalized(post, "title", language);
  const excerpt = pickLocalized(post, "excerpt", language);
  const slug = pickSlug(post, language);
  const minutes = post.read_time_minutes;

  return (
    <Link
      to={`/titulares/${slug}`}
      className="card-blog group block rounded-3xl overflow-hidden grid grid-cols-1 md:grid-cols-2 mb-12"
    >
      <div className="aspect-video md:aspect-auto md:min-h-[320px] overflow-hidden order-1 md:order-2">
        <div className="w-full h-full transition-transform duration-500 group-hover:scale-[1.03]">
          <CoverIcon icon={post.cover_icon} iconSecondary={post.cover_icon_secondary} bgPreset={post.cover_bg_preset} size="lg" />
        </div>
      </div>
      <div className="p-6 md:p-10 flex flex-col gap-4 order-2 md:order-1">
        <div
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--accent-color)" }}
        >
          <span>{language === "es" ? "Destacado" : "Featured"}</span>
          <span style={{ color: "var(--text-tertiary)" }}>·</span>
          <span>{categoryLabel || post.category?.replace(/-/g, " ") || ""}</span>
          {minutes ? (
            <>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <span style={{ color: "var(--text-tertiary)" }}>{minutes} min</span>
            </>
          ) : null}
        </div>
        <h2
          className="font-black leading-[1.05] group-hover:underline"
          style={{
            color: "var(--text-primary)",
            fontSize: "clamp(24px, 3.5vw, 40px)",
            letterSpacing: "-1px",
          }}
        >
          {title}
        </h2>
        {excerpt && (
          <p className="text-sm md:text-base line-clamp-3" style={{ color: "var(--text-secondary)" }}>
            {excerpt}
          </p>
        )}
        <div className="mt-auto pt-3">
          <AuthorChip
            author={post.author || fallbackAuthor}
            authorAvatarUrl={post.author_avatar_url || fallbackAvatar}
            authorRole={fallbackRole}
            publishedAt={post.published_at}
            size="md"
          />
        </div>
      </div>
    </Link>
  );
}
