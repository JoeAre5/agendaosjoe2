import { useTranslation } from "@/hooks/useTranslation";
import { ListChecks } from "lucide-react";
import { tweenScrollToY } from "@/lib/blog/scrollUtils";
import { trackBlogEvent } from "@/lib/blog/analytics";

interface PostSnapshotProps {
  bullets: string[];
  /** Sequential mapping: bullet[i] jumps to heading element with id headingIds[i]. */
  headingIds?: string[];
  postId?: string;
}

/**
 * "Snapshot" / TL;DR block. Sits at the very bottom of every post.
 * Bullets are AI-generated in the admin (editable). When `headingIds` is
 * provided, each bullet becomes a clickable button that smoothly scrolls
 * the corresponding section into view.
 */
export function PostSnapshot({ bullets, headingIds, postId }: PostSnapshotProps) {
  const { language } = useTranslation();
  if (!bullets || bullets.length === 0) return null;

  const scrollTo = (id: string, index: number) => {
    trackBlogEvent("snapshot_click", { postId, language, metadata: { heading_id: id, index } });
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 16;
    tweenScrollToY(y, 800);
  };

  return (
    <aside
      className="rounded-2xl p-6 md:p-8 my-10"
      style={{
        background: "var(--bg-surface)",
        border: "1.5px solid var(--divider)",
      }}
    >
      <div
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] mb-4"
        style={{ color: "var(--accent-color)" }}
      >
        <ListChecks size={14} strokeWidth={1.5} />
        {language === "es" ? "Resumen rápido" : "Snapshot"}
      </div>
      <ul className="space-y-3 list-none p-0">
        {bullets.map((b, i) => {
          const id = headingIds?.[i];
          const dot = (
            <span
              aria-hidden
              className="mt-2 shrink-0 rounded-full transition-transform duration-200 group-hover:scale-150"
              style={{
                width: 6,
                height: 6,
                background: "var(--accent-color)",
              }}
            />
          );
          return (
            <li key={i} className="text-sm md:text-base leading-relaxed">
              {id ? (
                <button
                  type="button"
                  onClick={() => scrollTo(id, i)}
                  aria-label={
                    (language === "es" ? "Ir a sección: " : "Jump to section: ") + b
                  }
                  className="group w-full text-left flex gap-3 cursor-pointer transition-colors active:scale-[0.99]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {dot}
                  <span className="group-hover:underline" style={{ textUnderlineOffset: 3 }}>
                    {b}
                  </span>
                </button>
              ) : (
                <div className="flex gap-3" style={{ color: "var(--text-primary)" }}>
                  {dot}
                  <span>{b}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
