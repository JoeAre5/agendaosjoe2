import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { List } from "lucide-react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

/**
 * Auto-generates a Table of Contents by scanning rendered H2/H3 inside `.blog-prose`.
 * Adds id slugs to each heading so anchor links work.
 */
export function PostTOC() {
  const { language } = useTranslation();
  const [items, setItems] = useState<TocItem[]>([]);

  useEffect(() => {
    const root = document.querySelector(".blog-prose");
    if (!root) return;
    const headings = root.querySelectorAll("h2, h3");
    const generated: TocItem[] = [];
    headings.forEach((h) => {
      const text = (h.textContent || "").trim();
      if (!text) return;
      let id = h.id;
      if (!id) {
        id = text
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9\s-]/g, "")
          .trim()
          .replace(/\s+/g, "-");
        h.id = id;
      }
      generated.push({ id, text, level: h.tagName === "H2" ? 2 : 3 });
    });
    setItems(generated);
  }, []);

  if (items.length < 2) return null;

  return (
    <nav
      className="rounded-2xl p-6 my-10"
      style={{ background: "var(--bg-surface)", border: "1.5px solid var(--divider)" }}
      aria-label={language === "es" ? "Tabla de contenidos" : "Table of contents"}
    >
      <div
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] mb-4"
        style={{ color: "var(--accent-color)" }}
      >
        <List size={14} strokeWidth={1.5} />
        {language === "es" ? "Tabla de contenidos" : "Table of contents"}
      </div>
      <ol className="space-y-2 list-none p-0">
        {items.map((it, idx) => (
          <li key={it.id} style={{ paddingLeft: it.level === 3 ? 16 : 0 }}>
            <a
              href={`#${it.id}`}
              className="text-sm hover:underline transition-colors"
              style={{ color: it.level === 2 ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              <span style={{ color: "var(--text-tertiary)" }}>{idx + 1}. </span>
              {it.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
