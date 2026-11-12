import { Link } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { trackBlogEvent } from "@/lib/blog/analytics";

interface NavPost {
  slug: string;
  title: string;
  title_en?: string | null;
  cover_image_url: string | null;
  category: string | null;
}

export function PrevNextPosts({ prev, next, postId }: { prev: NavPost | null; next: NavPost | null; postId?: string }) {
  const { language } = useTranslation();
  if (!prev && !next) return null;
  const both = !!prev && !!next;
  const titleFor = (post: NavPost) => (language === "en" && post.title_en?.trim() ? post.title_en : post.title);

  return (
    <div className={`grid grid-cols-1 ${both ? "md:grid-cols-2" : ""} gap-4 my-12`}>
      {prev ? (
        <Link
          to={`/titulares/${prev.slug}`}
          onClick={() => trackBlogEvent("prev_click", { postId, language, metadata: { target_slug: prev.slug } })}
          className="group rounded-2xl p-5 flex items-start gap-3"
          style={{ background: "var(--bg-surface)", border: "1.5px solid var(--divider)" }}
        >
          <ArrowLeft size={16} className="mt-1 shrink-0" style={{ color: "var(--accent-color)" }} />
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
              {language === "es" ? "Anterior" : "Previous"}
            </div>
            <div className="text-sm font-bold line-clamp-2 group-hover:underline" style={{ color: "var(--text-primary)" }}>
              {titleFor(prev)}
            </div>
          </div>
        </Link>
      ) : null}

      {next ? (
        <Link
          to={`/titulares/${next.slug}`}
          onClick={() => trackBlogEvent("next_click", { postId, language, metadata: { target_slug: next.slug } })}
          className="group rounded-2xl p-5 flex items-start gap-3 md:text-right md:flex-row-reverse"
          style={{ background: "var(--bg-surface)", border: "1.5px solid var(--divider)" }}
        >
          <ArrowRight size={16} className="mt-1 shrink-0" style={{ color: "var(--accent-color)" }} />
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-tertiary)" }}>
              {language === "es" ? "Siguiente" : "Next"}
            </div>
            <div className="text-sm font-bold line-clamp-2 group-hover:underline" style={{ color: "var(--text-primary)" }}>
              {titleFor(next)}
            </div>
          </div>
        </Link>
      ) : null}
    </div>
  );
}
